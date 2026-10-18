/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * Editor integration of the data flow diagrams (docs/DATAFLOW.md §5): the
 * Data Flow palette, placing systems and datasets, double-click editing,
 * the context menu, deletion and the drop rules. Every change goes through
 * DataFlowView.update, so the catalog and the cells change in one undoable
 * edit. Each EditorUi gets an instance as ui.dataFlow.
 */
function DataFlowUi(ui)
{
	this.ui = ui;
	this.graph = ui.editor.graph;
	this.updating = 0;
	this.init();
};

/**
 * Installs the graph hooks.
 */
DataFlowUi.prototype.init = function()
{
	var graph = this.graph;
	var self = this;

	// Removing shapes removes the entities that have no shapes left (D19)
	graph.addListener(mxEvent.REMOVE_CELLS, function(sender, evt)
	{
		if (!DataFlowView.syncing && self.updating == 0)
		{
			self.cellsRemoved(evt.getProperty('cells'));
		}
	});

	// Copies of action shapes (paste, duplicate, clone) get their own action
	graph.addListener(mxEvent.CELLS_ADDED, function(sender, evt)
	{
		if (!DataFlowView.syncing && self.updating == 0)
		{
			self.cellsAdded(evt.getProperty('cells'));
		}
	});

	// Copied cells carry their entities, so paste, cut and paste, and
	// pasting into another page or file keep them (see cellsAdded)
	var graphEncodeCells = graph.encodeCells;

	graph.encodeCells = function(cells)
	{
		var node = graphEncodeCells.apply(this, arguments);

		if (DataFlowCatalog.hasCatalog(graph))
		{
			self.addFragments(node);
		}

		return node;
	};

	// Connecting applies the connection rules and updates the action states
	graph.addListener(mxEvent.CELL_CONNECTED, function(sender, evt)
	{
		var edge = evt.getProperty('edge');

		if (!DataFlowView.syncing && self.updating == 0 && edge != null &&
			(DataFlowView.getType(edge) == DataFlowView.FLOW ||
			DataFlowStreams.isNode(graph.model.getTerminal(edge, true)) ||
			DataFlowStreams.isNode(graph.model.getTerminal(edge, false))))
		{
			self.update(function() {});
		}
	});

	// Refuses connections that break the rules while dragging (§6.2)
	var graphGetEdgeValidationError = graph.getEdgeValidationError;

	graph.getEdgeValidationError = function(edge, source, target)
	{
		var types = [DataFlowView.getType(source), DataFlowView.getType(target)];

		if (mxUtils.indexOf(types, DataFlowModel.COLUMN) >= 0 || mxUtils.indexOf(types, DataFlowModel.TABLE) >= 0)
		{
			return (types[0] == DataFlowModel.COLUMN && types[1] == DataFlowModel.COLUMN && source != target) ?
				null : mxResources.get('dfConnectColumns');
		}

		var conn = DataFlowStreams.getConnection(this, edge, source, target, false);

		if (conn != null && conn.error != null)
		{
			return conn.error;
		}

		return graphGetEdgeValidationError.apply(this, arguments);
	};

	// Explains a refused connection in a dialog instead of window.alert
	graph.validationAlert = function(message)
	{
		if (message != null && message.length > 0)
		{
			self.ui.alert(message);
		}
	};

	// Opens the action dialog once its connections are complete
	graph.connectionHandler.addListener(mxEvent.CONNECT, function(sender, evt)
	{
		var edge = evt.getProperty('cell');

		window.setTimeout(function()
		{
			if (graph.model.contains(edge) && self.ui.dialog == null)
			{
				var target = graph.model.getTerminal(edge, false);
				var source = graph.model.getTerminal(edge, true);
				var cells = [target, source];

				for (var i = 0; i < cells.length; i++)
				{
					if (DataFlowView.getType(cells[i]) == DataFlowView.ACTION &&
						DataFlowStreams.getMissingConnections(graph, cells[i]).length == 0 &&
						!DataFlowStreams.isConfigured(self.getCatalog(), DataFlowView.getId(cells[i])))
					{
						self.configureAction(cells[i]);
						break;
					}
				}
			}
		}, 0);
	});

	// Asks before a delete that removes relationships or changes actions
	var graphDeleteCells = graph.deleteCells;

	graph.deleteCells = function(cells, includeEdges)
	{
		var msg = self.getDeleteImpactMessage(cells);

		if (msg != null)
		{
			self.ui.confirm(msg, function()
			{
				graphDeleteCells.call(graph, cells, includeEdges);
			}, null, mxResources.get('delete'));

			return null;
		}

		return graphDeleteCells.apply(this, arguments);
	};

	// Selecting a Validation dims everything it does not compare
	graph.getSelectionModel().addListener(mxEvent.CHANGE, function()
	{
		self.updateFocus();
	});

	graph.model.addListener(mxEvent.CHANGE, function()
	{
		self.updateFocus();
	});

	// Double click edits the system or dataset instead of the label
	graph.addListener(mxEvent.DOUBLE_CLICK, function(sender, evt)
	{
		var cell = DataFlowView.getEditCell(graph, evt.getProperty('cell'));

		if (cell != null && graph.isEnabled())
		{
			evt.consume();
			self.editCell(cell);
		}
	});

	// Systems only accept their own datasets, datasets accept nothing
	var graphIsValidDropTarget = graph.isValidDropTarget;

	graph.isValidDropTarget = function(target, cells, evt)
	{
		var type = DataFlowView.getType(target);

		if (type == DataFlowView.SYSTEM)
		{
			return self.isDatasetDrop(target, cells);
		}
		else if (type == DataFlowView.DATASET || type == DataFlowView.ATTRIBUTE ||
			type == DataFlowModel.TABLE || type == DataFlowModel.COLUMN)
		{
			return false;
		}
		else if (self.containsDatasets(cells))
		{
			return false;
		}

		return graphIsValidDropTarget.apply(this, arguments);
	};

	// Model view: rows connect to rows only, and drawing between two rows
	// asks for the cardinality instead of inserting an edge (§7.3)
	var connectionHandlerConnect = graph.connectionHandler.connect;

	graph.connectionHandler.connect = function(source, target, evt, dropTarget)
	{
		if (DataFlowView.getType(source) == DataFlowModel.COLUMN &&
			DataFlowView.getType(target) == DataFlowModel.COLUMN)
		{
			window.setTimeout(function()
			{
				self.showRelationshipDialog(source, target);
			}, 0);

			return null;
		}

		return connectionHandlerConnect.apply(this, arguments);
	};

	// Relationship and lineage edges follow the catalog, not dragging
	var graphIsCellDisconnectable = graph.isCellDisconnectable;

	graph.isCellDisconnectable = function(cell, terminal, source)
	{
		var type = DataFlowView.getType(cell);

		if (type == DataFlowModel.RELATIONSHIP || type == DataFlowModel.LINEAGE)
		{
			return false;
		}

		return graphIsCellDisconnectable.apply(this, arguments);
	};

	// Datasets cannot be dragged out of their system
	var graphHandlerShouldRemoveCellsFromParent = graph.graphHandler.shouldRemoveCellsFromParent;

	graph.graphHandler.shouldRemoveCellsFromParent = function(parent, cells, evt)
	{
		if (self.containsDatasets(cells))
		{
			return false;
		}

		return graphHandlerShouldRemoveCellsFromParent.apply(this, arguments);
	};
};

/**
 * Returns true if the given cells contain a dataset or attribute row.
 */
DataFlowUi.prototype.containsDatasets = function(cells)
{
	for (var i = 0; cells != null && i < cells.length; i++)
	{
		var type = DataFlowView.getType(cells[i]);

		if (type == DataFlowView.DATASET || type == DataFlowView.ATTRIBUTE ||
			DataFlowView.getTemplate(cells[i]) == DataFlowView.DATASET)
		{
			return true;
		}
	}

	return false;
};

/**
 * Returns true if all given cells are datasets of the given system
 * occurrence's system, or the dataset palette template.
 */
DataFlowUi.prototype.isDatasetDrop = function(systemCell, cells)
{
	if (cells == null || cells.length == 0)
	{
		return false;
	}

	var systemId = DataFlowView.getId(systemCell);

	for (var i = 0; i < cells.length; i++)
	{
		var parent = this.graph.model.getParent(cells[i]);

		if (DataFlowView.getTemplate(cells[i]) != DataFlowView.DATASET &&
			(DataFlowView.getType(cells[i]) != DataFlowView.DATASET ||
			DataFlowView.getId(parent) != systemId))
		{
			return false;
		}
	}

	return true;
};

/**
 * Returns the catalog of the current page.
 */
DataFlowUi.prototype.getCatalog = function()
{
	return DataFlowCatalog.read(this.graph);
};

/**
 * Changes the catalog and syncs the cells as one undoable edit.
 */
DataFlowUi.prototype.update = function(fn)
{
	this.updating++;

	try
	{
		return DataFlowView.update(this.graph, fn);
	}
	finally
	{
		this.updating--;
	}
};

/**
 * Places a system occurrence with its top left corner at the given point.
 * The spec is {id, includeDatasets} for an existing system or {props} for
 * a new one. Returns the new cell.
 */
DataFlowUi.prototype.placeSystem = function(spec, x, y)
{
	var graph = this.graph;

	var cell = this.update(function(catalog)
	{
		var id = (spec.id != null) ? spec.id : catalog.addSystem(spec.props);
		var cell = DataFlowView.createSystemCell(catalog, id, Math.round(x), Math.round(y));
		graph.addCell(cell, DataFlowModel.getFlowLayer(graph));

		if (spec.id != null && spec.includeDatasets)
		{
			var datasets = catalog.getDatasetIds(id);

			for (var i = 0; i < datasets.length; i++)
			{
				graph.addCell(DataFlowView.createDatasetCell(catalog, datasets[i]), cell);
			}
		}

		return cell;
	});

	graph.setSelectionCell(cell);
	graph.scrollCellToVisible(cell);

	return cell;
};

/**
 * Places a dataset occurrence in the given system occurrence at the given
 * index (default: last). The spec is {id} for an existing dataset or
 * {name, entries} (or {name, attributes} with plain names) for a new one.
 * Returns the new cell.
 */
DataFlowUi.prototype.placeDataset = function(systemCell, spec, index)
{
	var graph = this.graph;

	var cell = this.update(function(catalog)
	{
		var id = spec.id;

		if (id == null)
		{
			var names = spec.attributes;

			if (names == null && spec.entries != null)
			{
				names = spec.entries.map(function(entry) { return entry.name; });
			}

			id = catalog.addDataset(DataFlowView.getId(systemCell), spec.name, names);
		}

		var cell = DataFlowView.createDatasetCell(catalog, id);
		graph.addCell(cell, systemCell, index);

		return cell;
	});

	graph.setSelectionCell(cell);

	return cell;
};

/**
 * Changes the properties of a system (shown on all its shapes).
 */
DataFlowUi.prototype.editSystem = function(id, props)
{
	this.update(function(catalog)
	{
		catalog.updateSystem(id, props);
	});
};

/**
 * Renames a dataset and replaces its attributes (see
 * DataFlowCatalog.setDatasetAttributes). Returns the removal report.
 */
DataFlowUi.prototype.editDataset = function(id, name, entries)
{
	return this.update(function(catalog)
	{
		catalog.renameDataset(id, name);

		return catalog.setDatasetAttributes(id, entries).report;
	});
};

/**
 * Deletes a system or dataset with all its shapes (D17). Returns the report.
 */
DataFlowUi.prototype.deleteEntity = function(type, id)
{
	return this.update(function(catalog)
	{
		return (type == DataFlowView.SYSTEM) ? catalog.removeSystem(id) : catalog.removeDataset(id);
	});
};

/**
 * Removes the entities whose last shape was removed (D19). Called inside
 * the removal transaction, so the shapes and entities are one undo step.
 */
DataFlowUi.prototype.cellsRemoved = function(cells)
{
	var graph = this.graph;
	var systems = [];
	var datasets = [];
	var actions = [];
	var tables = [];
	var relationships = [];
	var touched = false;

	function collect(cell)
	{
		var type = DataFlowView.getType(cell);
		var id = DataFlowView.getId(cell);
		touched = touched || type != null;

		if (type == DataFlowView.SYSTEM && mxUtils.indexOf(systems, id) < 0)
		{
			systems.push(id);
		}
		else if (type == DataFlowView.DATASET && mxUtils.indexOf(datasets, id) < 0)
		{
			datasets.push(id);
		}
		else if (type == DataFlowView.ACTION && mxUtils.indexOf(actions, id) < 0)
		{
			actions.push(id);
		}
		else if (type == DataFlowModel.TABLE)
		{
			tables.push(id);
		}
		else if (type == DataFlowModel.RELATIONSHIP)
		{
			relationships.push(id);
		}

		for (var i = 0; i < graph.model.getChildCount(cell); i++)
		{
			collect(graph.model.getChildAt(cell, i));
		}
	};

	for (var i = 0; cells != null && i < cells.length; i++)
	{
		collect(cells[i]);
	}

	if (touched)
	{
		this.update(function(catalog)
		{
			// A deleted relationship edge or table deletes its entity (§7.3)
			for (var i = 0; i < relationships.length; i++)
			{
				if (catalog.getRelationship(relationships[i]) != null)
				{
					catalog.removeRelationship(relationships[i]);
				}
			}

			for (var i = 0; i < tables.length; i++)
			{
				if (catalog.getDataset(tables[i]) != null)
				{
					catalog.removeDataset(tables[i]);
				}
			}

			for (var i = 0; i < actions.length; i++)
			{
				if (catalog.getAction(actions[i]) != null &&
					DataFlowView.getCells(graph, DataFlowView.ACTION, actions[i]).length == 0)
				{
					catalog.removeAction(actions[i]);
				}
			}

			for (var i = 0; i < datasets.length; i++)
			{
				if (catalog.getDataset(datasets[i]) != null &&
					DataFlowView.getCells(graph, DataFlowView.DATASET, datasets[i]).length == 0)
				{
					catalog.removeDataset(datasets[i]);
				}
			}

			for (var i = 0; i < systems.length; i++)
			{
				if (catalog.getSystem(systems[i]) != null &&
					DataFlowView.getCells(graph, DataFlowView.SYSTEM, systems[i]).length == 0)
				{
					catalog.removeSystem(systems[i]);
				}
			}
		});
	}
};

/**
 * Handles a drop or click of a palette template at the given graph point.
 */
DataFlowUi.prototype.templateDropped = function(template, target, x, y, clicked)
{
	var graph = this.graph;

	if (DataFlowModel.getView(graph) == DataFlow.VIEW_MODEL)
	{
		this.ui.alert(mxResources.get('dfSwitchToFlow'));
	}
	else if (template == DataFlowView.SYSTEM)
	{
		this.showSystemDialog(null, x - DataFlow.SYSTEM_WIDTH / 2, y - DataFlow.SYSTEM_HEADER / 2);
	}
	else if (DataFlow.ACTIONS[template] != null)
	{
		var spec = DataFlow.ACTIONS[template];
		this.placeAction(template, x - spec.width / 2, y - spec.height / 2);
	}
	else if (template == DataFlowView.DATASET)
	{
		var systemCell = DataFlowView.getSystemCell(graph, target);

		// A click adds to the selected system
		if (systemCell == null && clicked)
		{
			systemCell = DataFlowView.getSystemCell(graph, graph.getSelectionCell());
		}

		if (systemCell == null)
		{
			this.ui.alert(mxResources.get('dfDropOnSystem'));
		}
		else
		{
			this.showDatasetDialog(systemCell, (clicked) ? null : this.getDropIndex(systemCell, y));
		}
	}
};

/**
 * Returns the index for a dataset dropped at the given graph y coordinate
 * in the given system occurrence.
 */
DataFlowUi.prototype.getDropIndex = function(systemCell, y)
{
	var graph = this.graph;
	var s = graph.view.scale;
	var ty = graph.view.translate.y;
	var children = graph.model.getChildCells(systemCell);
	var index = 0;

	for (var i = 0; i < children.length; i++)
	{
		var state = graph.view.getState(children[i]);

		if (state != null && state.getCenterY() / s - ty < y)
		{
			index = i + 1;
		}
	}

	return index;
};

/**
 * Opens the system dialog: for a new placement at the given point if cell
 * is null, otherwise for editing the cell's system.
 */
DataFlowUi.prototype.showSystemDialog = function(cell, x, y)
{
	var self = this;
	var catalog = this.getCatalog();
	var id = (cell != null) ? DataFlowView.getId(cell) : null;

	return DataFlowDialogs.showSystemDialog(this.ui, catalog, id, function(result)
	{
		if (id != null)
		{
			self.editSystem(id, result.props);
		}
		else
		{
			self.placeSystem(result, x, y);
		}
	});
};

/**
 * Opens the dataset dialog: for a new placement in the given system
 * occurrence if datasetCell is null, otherwise for editing its dataset.
 * Removing attributes that are in use asks for confirmation.
 */
DataFlowUi.prototype.showDatasetDialog = function(systemCell, index, datasetCell)
{
	var self = this;
	var catalog = this.getCatalog();
	var id = (datasetCell != null) ? DataFlowView.getId(datasetCell) : null;
	systemCell = (systemCell != null) ? systemCell : DataFlowView.getSystemCell(this.graph, datasetCell);

	// A table in the model view has no system shape
	var systemId = (systemCell != null) ? DataFlowView.getId(systemCell) : catalog.getDataset(id).system;
	var exclude = (systemCell != null) ? DataFlowView.getDatasetIds(this.graph, systemCell) : [];

	return DataFlowDialogs.showDatasetDialog(this.ui, catalog, systemId, id, exclude, function(result)
	{
		if (id == null)
		{
			self.placeDataset(systemCell, result, index);
		}
		else
		{
			var impact = catalog.clone().setDatasetAttributes(id, result.entries).report;

			if (impact.relationships.length > 0 || impact.flagged.length > 0)
			{
				self.ui.confirm(mxResources.get('dfRemoveImpact', [impact.relationships.length,
					impact.flagged.length]), function()
				{
					self.editDataset(id, result.name, result.entries);
				});
			}
			else
			{
				self.editDataset(id, result.name, result.entries);
			}
		}
	});
};

/**
 * Opens the editor for the given system or dataset occurrence.
 */
DataFlowUi.prototype.editCell = function(cell)
{
	var type = DataFlowView.getType(cell);

	if (type == DataFlowView.SYSTEM)
	{
		this.showSystemDialog(cell);
	}
	else if (type == DataFlowView.DATASET)
	{
		this.showDatasetDialog(null, null, cell);
	}
	else if (type == DataFlowView.ACTION)
	{
		this.configureAction(cell);
	}
	else if (type == DataFlowModel.TABLE)
	{
		this.showDatasetDialog(null, null, cell);
	}
	else if (type == DataFlowModel.RELATIONSHIP)
	{
		this.showRelationshipDialog(null, null, DataFlowView.getId(cell));
	}
};

/**
 * Asks before deleting the entity of the given occurrence everywhere.
 */
DataFlowUi.prototype.confirmDeleteEntity = function(cell)
{
	var self = this;
	var type = DataFlowView.getType(cell);
	type = (type == DataFlowModel.TABLE) ? DataFlowView.DATASET : type;
	var id = DataFlowView.getId(cell);
	var catalog = this.getCatalog();
	var msg = null;

	if (type == DataFlowView.SYSTEM && catalog.getSystem(id) != null)
	{
		msg = mxResources.get('dfDeleteSystemConfirm', [catalog.getSystem(id).name,
			catalog.getDatasetIds(id).length]);
	}
	else if (type == DataFlowView.DATASET && catalog.getDataset(id) != null)
	{
		msg = mxResources.get('dfDeleteDatasetConfirm', [catalog.getDataset(id).name]);
	}

	if (msg != null)
	{
		this.ui.confirm(msg, function()
		{
			self.deleteEntity(type, id);
		}, null, mxResources.get('delete'));
	}
};

/**
 * Adds the data flow items to the context menu of the given cell.
 */
DataFlowUi.prototype.addPopupMenuItems = function(menu, cell)
{
	var self = this;
	var graph = this.graph;
	cell = DataFlowView.getEditCell(graph, cell);
	var type = DataFlowView.getType(cell);

	// The background offers switching the view
	if (cell == null && graph.isEnabled() && DataFlowCatalog.hasCatalog(graph))
	{
		var model = DataFlowModel.getView(graph) == DataFlow.VIEW_MODEL;
		menu.addSeparator();
		menu.addItem(mxResources.get((model) ? 'dfShowFlowView' : 'dfShowModelView'), null, function()
		{
			self.setView((model) ? DataFlow.VIEW_FLOW : DataFlow.VIEW_MODEL);
		});
	}
	else if (type == DataFlowModel.RELATIONSHIP && graph.isEnabled())
	{
		menu.addSeparator();
		menu.addItem(mxResources.get('dfChangeCardinality') + '...', null, function()
		{
			self.editCell(cell);
		});
	}
	else if (type != null && graph.isEnabled() && graph.getSelectionCount() <= 1)
	{
		menu.addSeparator();

		if (type == DataFlowView.ACTION)
		{
			menu.addItem(mxResources.get('dfConfigureAction') + '...', null, function()
			{
				self.editCell(cell);
			});

			return;
		}
		else if (type == DataFlowView.SYSTEM)
		{
			menu.addItem(mxResources.get('dfEditSystem') + '...', null, function()
			{
				self.editCell(cell);
			});

			menu.addItem(mxResources.get('dfAddDataset') + '...', null, function()
			{
				self.showDatasetDialog(cell);
			});
		}
		else
		{
			menu.addItem(mxResources.get('dfEditDataset') + '...', null, function()
			{
				self.editCell(cell);
			});
		}

		menu.addItem(mxResources.get('dfDeleteEverywhere'), null, function()
		{
			self.confirmDeleteEntity(cell);
		});
	}
};

/**
 * Adds the catalog fragment of every data flow cell in the given encoded
 * cells (dfData, see DataFlowCatalog.extract): systems, datasets with
 * their attributes and system, actions and relationships.
 */
DataFlowUi.prototype.addFragments = function(node)
{
	var catalog = this.getCatalog();
	var elts = node.getElementsByTagName('*');

	for (var i = 0; i < elts.length; i++)
	{
		var type = elts[i].getAttribute('dfType');
		var id = elts[i].getAttribute('dfId');
		var ids = null;

		if (type == DataFlowView.SYSTEM)
		{
			ids = {systems: [id]};
		}
		else if (type == DataFlowView.DATASET || type == DataFlowModel.TABLE)
		{
			ids = {datasets: [id]};
		}
		else if (type == DataFlowView.ACTION)
		{
			ids = {actions: [id]};
		}
		else if (type == DataFlowModel.RELATIONSHIP)
		{
			ids = {relationships: [id]};
		}

		if (ids != null)
		{
			elts[i].setAttribute('dfData', JSON.stringify(catalog.extract(ids)));
		}
	}
};

/**
 * Handles added cells (paste, duplicate, Ctrl+drag, library drops):
 * - imports the entities their dfData carries that this page lacks (cut and
 *   paste, other pages and files) and removes dfData;
 * - puts a dataset that landed outside its system into a shape of that
 *   system, or removes it; removes rows, and model view cells outside the
 *   model layers;
 * - gives copies of an action shape their own, new action;
 * - removes entities that were imported but ended up without shapes.
 */
DataFlowUi.prototype.cellsAdded = function(cells)
{
	var graph = this.graph;
	var model = graph.model;
	var added = [];

	for (var i = 0; cells != null && i < cells.length; i++)
	{
		added = added.concat(model.filterDescendants(function(cell)
		{
			return DataFlowView.getType(cell) != null;
		}, cells[i]));
	}

	if (added.length == 0)
	{
		return;
	}

	this.update(function(catalog)
	{
		// Imports and strips the fragments
		var imported = [];

		for (var i = 0; i < added.length; i++)
		{
			var cell = added[i];
			var data = cell.value.getAttribute('dfData');

			if (data != null)
			{
				try
				{
					imported = imported.concat(catalog.importFragment(JSON.parse(data)));
				}
				catch (e)
				{
					// Ignores invalid data
				}

				var value = cell.value.cloneNode(true);
				value.removeAttribute('dfData');
				model.setValue(cell, value);
			}
		}

		var modelLayers = [DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL),
			DataFlowModel.getLayer(graph, DataFlowModel.LINEAGE)];
		var removed = [];

		function inModel(cell)
		{
			var layer = cell;

			while (layer != null && model.getParent(layer) != model.getRoot())
			{
				layer = model.getParent(layer);
			}

			return layer != null && mxUtils.indexOf(modelLayers, layer) >= 0;
		};

		for (var i = 0; i < added.length; i++)
		{
			var cell = added[i];
			var type = DataFlowView.getType(cell);
			var id = DataFlowView.getId(cell);
			var parent = model.getParent(cell);

			if (!model.contains(cell) || mxUtils.indexOf(removed, cell) >= 0)
			{
				continue;
			}
			else if (type == DataFlowView.ATTRIBUTE)
			{
				if (DataFlowView.getType(parent) != DataFlowView.DATASET)
				{
					removed.push(cell);
				}
			}
			else if (type == DataFlowModel.TABLE || type == DataFlowModel.COLUMN ||
				type == DataFlowModel.RELATIONSHIP || type == DataFlowModel.LINEAGE)
			{
				if (!inModel(cell))
				{
					removed.push(cell);
				}
			}
			else if (type == DataFlowView.DATASET)
			{
				var dataset = catalog.getDataset(id);

				if (dataset == null)
				{
					removed.push(cell);
				}
				else if (DataFlowView.getType(parent) != DataFlowView.SYSTEM ||
					DataFlowView.getId(parent) != dataset.system)
				{
					// Into a shape of its system that does not show it yet
					var target = DataFlowView.getCells(graph, DataFlowView.SYSTEM, dataset.system).filter(function(sys)
					{
						return mxUtils.indexOf(DataFlowView.getDatasetIds(graph, sys), id) < 0;
					})[0];

					if (target != null)
					{
						model.add(target, cell);
					}
					else
					{
						removed.push(cell);
					}
				}
			}
			else if (type == DataFlowView.ACTION)
			{
				var others = DataFlowView.getCells(graph, DataFlowView.ACTION, id).filter(function(other)
				{
					return other != cell;
				});

				if (catalog.getAction(id) == null || others.length > 0)
				{
					var actionType = cell.value.getAttribute('dfAction');

					if (DataFlow.ACTIONS[actionType] != null)
					{
						var value = cell.value.cloneNode(true);
						value.setAttribute('dfId', catalog.addAction(actionType));
						model.setValue(cell, value);
					}
					else
					{
						removed.push(cell);
					}
				}
			}
		}

		DataFlowModel.removeCells(graph, removed);

		// Imported entities that ended up without shapes are not kept (D19)
		for (var i = 0; i < imported.length; i++)
		{
			var id = imported[i];

			if (catalog.getDataset(id) != null && DataFlowView.getCells(graph, DataFlowView.DATASET, id).length == 0 &&
				DataFlowView.getCells(graph, DataFlowModel.TABLE, id).length == 0)
			{
				catalog.removeDataset(id);
			}
		}

		for (var i = 0; i < imported.length; i++)
		{
			var id = imported[i];

			if (catalog.getSystem(id) != null && DataFlowView.getCells(graph, DataFlowView.SYSTEM, id).length == 0 &&
				catalog.getDatasetIds(id).length == 0)
			{
				catalog.removeSystem(id);
			}
			else if (catalog.getAction(id) != null && DataFlowView.getCells(graph, DataFlowView.ACTION, id).length == 0)
			{
				catalog.removeAction(id);
			}
		}
	});
};

/**
 * Returns the question to ask before deleting the given cells, or null if
 * the delete does not reach beyond them: entities whose last shapes go are
 * removed on a copy of the catalog, and relationships removed or actions
 * changed by that are counted.
 */
DataFlowUi.prototype.getDeleteImpactMessage = function(cells)
{
	var graph = this.graph;
	var model = graph.model;
	var deleted = [];

	for (var i = 0; cells != null && i < cells.length; i++)
	{
		deleted = deleted.concat(model.filterDescendants(function() { return true; }, cells[i]));
	}

	// Deleting a table deletes its dataset everywhere (§7.3)
	var tables = deleted.filter(function(cell)
	{
		return DataFlowView.getType(cell) == DataFlowModel.TABLE;
	});

	if (tables.length > 0)
	{
		return mxResources.get('dfDeleteTablesConfirm', [tables.length]);
	}

	var entities = deleted.filter(function(cell)
	{
		var type = DataFlowView.getType(cell);

		return type == DataFlowView.SYSTEM || type == DataFlowView.DATASET || type == DataFlowView.ACTION;
	});

	if (entities.length == 0)
	{
		return null;
	}

	var catalog = this.getCatalog();
	var report = DataFlowCatalog.createReport();
	var done = [];

	for (var i = 0; i < entities.length; i++)
	{
		var type = DataFlowView.getType(entities[i]);
		var id = DataFlowView.getId(entities[i]);
		var last = DataFlowView.getCells(graph, type, id).every(function(cell)
		{
			return mxUtils.indexOf(deleted, cell) >= 0;
		});

		if (last && mxUtils.indexOf(done, id) < 0)
		{
			done.push(id);

			if (type == DataFlowView.SYSTEM && catalog.getSystem(id) != null)
			{
				catalog.removeSystem(id, report);
			}
			else if (type == DataFlowView.DATASET && catalog.getDataset(id) != null)
			{
				catalog.removeDataset(id, report);
			}
			else if (type == DataFlowView.ACTION && catalog.getAction(id) != null)
			{
				catalog.removeAction(id, report);
			}
		}
	}

	var flagged = report.flagged.filter(function(id)
	{
		return mxUtils.indexOf(report.actions, id) < 0;
	});

	// Relationships of a deleted Addition go with it and are not a surprise
	var relationships = report.relationships.length;

	if (relationships > 0 || flagged.length > 0)
	{
		var own = 0;

		for (var i = 0; i < report.actions.length; i++)
		{
			own += this.getCatalog().getRelationshipIds(null, report.actions[i]).length;
		}

		if (relationships - own > 0 || flagged.length > 0)
		{
			return mxResources.get('dfDeleteImpact', [relationships - own, flagged.length]);
		}
	}

	return null;
};

/**
 * Places an action shape with its top left corner at the given point.
 * Returns the new cell.
 */
DataFlowUi.prototype.placeAction = function(type, x, y)
{
	var graph = this.graph;

	var cell = this.update(function(catalog)
	{
		var id = catalog.addAction(type);
		var cell = DataFlowView.createActionCell(catalog, id, Math.round(x), Math.round(y));
		graph.addCell(cell, DataFlowModel.getFlowLayer(graph));

		return cell;
	});

	graph.setSelectionCell(cell);
	graph.scrollCellToVisible(cell);

	return cell;
};

/**
 * Opens the dialog of an action, or explains which connections it lacks.
 */
DataFlowUi.prototype.configureAction = function(cell)
{
	var self = this;
	var graph = this.graph;
	var ui = this.ui;
	var missing = DataFlowStreams.getMissingConnections(graph, cell);

	if (missing.length > 0)
	{
		ui.alert(mxResources.get('dfConnectFirst') + ' ' + missing.map(function(key)
		{
			return mxResources.get(key);
		}).join(' '));

		return null;
	}

	var catalog = this.getCatalog();
	var id = DataFlowView.getId(cell);
	var action = catalog.getAction(id);
	var input = DataFlowStreams.getInputStream(graph, catalog, cell);

	if (input == null || input.length == 0)
	{
		ui.alert(mxResources.get('dfInputEmpty'));

		return null;
	}

	function systemName(systemCell)
	{
		return catalog.getSystem(DataFlowView.getId(systemCell)).name;
	};

	if (action.type == DataFlow.ACTION_EXPORT)
	{
		var target = DataFlowStreams.getOutputSystem(graph, cell);
		var output = catalog.getDataset(action.config.dataset);

		return DataFlowDialogs.showExportDialog(ui, catalog, input, systemName(target),
			(output != null && output.system == DataFlowView.getId(target)) ? output : null, function(result)
		{
			self.applyExport(cell, result);
		});
	}
	else if (action.type == DataFlow.ACTION_FILTER)
	{
		return DataFlowDialogs.showFilterDialog(ui, catalog, input,
			systemName(DataFlowStreams.getOutputSystem(graph, cell)), action.config, function(result)
		{
			self.applyFilter(cell, result);
		});
	}

	var secondCell = DataFlowStreams.getInputNode(graph, cell, DataFlowStreams.SECONDARY);
	var second = DataFlowView.getDatasetIds(graph, secondCell);

	if (second.length == 0)
	{
		ui.alert(mxResources.get('dfSecondEmpty'));

		return null;
	}

	if (action.type == DataFlow.ACTION_VALIDATION)
	{
		return DataFlowDialogs.showValidationDialog(ui, catalog, input, second, systemName(secondCell),
			action.config, function(result)
		{
			self.applyValidation(cell, result);
		});
	}

	var existing = catalog.getRelationshipIds(null, id).map(function(relId)
	{
		return catalog.getRelationship(relId);
	});

	return DataFlowDialogs.showAdditionDialog(ui, catalog, input, second, systemName(secondCell),
		action.config, existing, function(result)
	{
		self.applyAddition(cell, result);
	});
};

/**
 * Makes the attributes of a dataset copies of the given source attributes
 * (with lineage). Attributes already derived from a source are kept (with
 * their name), attributes without lineage (added by hand) stay at the end,
 * and names are made unique with the source dataset's name.
 */
DataFlowUi.prototype.setDerivedAttributes = function(catalog, datasetId, sources)
{
	var dataset = catalog.getDataset(datasetId);
	var bySource = DataFlowCatalog.createMap();
	var manual = [];

	for (var i = 0; i < dataset.attributes.length; i++)
	{
		var aId = dataset.attributes[i];
		var src = catalog.getAttribute(aId).derivedFrom;

		if (src == null)
		{
			manual.push(aId);
		}
		else if (bySource[src] == null)
		{
			bySource[src] = aId;
		}
	}

	var used = DataFlowCatalog.createMap();
	var entries = [];

	function unique(name, suffix)
	{
		var result = name;

		if (used[result.toLowerCase()] && suffix != null)
		{
			result = name + ' (' + suffix + ')';
		}

		for (var n = 2; used[result.toLowerCase()]; n++)
		{
			result = name + ' ' + n;
		}

		used[result.toLowerCase()] = true;

		return result;
	};

	for (var i = 0; i < sources.length; i++)
	{
		var existing = bySource[sources[i]];
		var source = catalog.getAttribute(sources[i]);
		entries.push({id: (existing != null) ? existing : null,
			name: unique((existing != null) ? catalog.getAttribute(existing).name : source.name,
				catalog.getDataset(source.dataset).name)});
	}

	for (var i = 0; i < manual.length; i++)
	{
		entries.push({id: manual[i], name: unique(catalog.getAttribute(manual[i]).name)});
	}

	var result = catalog.setDatasetAttributes(datasetId, entries);

	for (var i = 0; i < sources.length; i++)
	{
		if (entries[i].id == null)
		{
			catalog.setDerivedFrom(result.ids[i], sources[i]);
		}
	}
};

/**
 * Adds a shape of the dataset to the system shape unless it has one.
 */
DataFlowUi.prototype.ensureDatasetShape = function(catalog, systemCell, datasetId)
{
	if (mxUtils.indexOf(DataFlowView.getDatasetIds(this.graph, systemCell), datasetId) < 0)
	{
		this.graph.addCell(DataFlowView.createDatasetCell(catalog, datasetId), systemCell);
	}
};

/**
 * Applies the Export dialog: creates or updates the output dataset in the
 * target system, with lineage, and shows it there.
 */
DataFlowUi.prototype.applyExport = function(cell, result)
{
	var self = this;
	var graph = this.graph;
	var id = DataFlowView.getId(cell);

	this.update(function(catalog)
	{
		var system = DataFlowStreams.getOutputSystem(graph, cell);
		var systemId = DataFlowView.getId(system);
		var datasetId = catalog.getAction(id).config.dataset;
		var dataset = catalog.getDataset(datasetId);

		if (dataset == null || dataset.system != systemId)
		{
			datasetId = catalog.addDataset(systemId, result.name, null, id);
		}
		else
		{
			catalog.renameDataset(datasetId, result.name);
		}

		self.setDerivedAttributes(catalog, datasetId, result.attributes);
		catalog.setActionConfig(id, {dataset: datasetId});
		self.ensureDatasetShape(catalog, system, datasetId);
	});
};

/**
 * Applies the Filter dialog: one copy per kept dataset in the target system,
 * with the kept attributes and lineage. Copies of datasets that are no
 * longer kept are deleted.
 */
DataFlowUi.prototype.applyFilter = function(cell, result)
{
	var self = this;
	var graph = this.graph;
	var id = DataFlowView.getId(cell);

	this.update(function(catalog)
	{
		var system = DataFlowStreams.getOutputSystem(graph, cell);
		var systemId = DataFlowView.getId(system);
		var old = catalog.getAction(id).config.copies;
		var input = DataFlowStreams.getInputStream(graph, catalog, cell) || [];
		var copies = {};
		var dropped = {datasets: [], attributes: []};

		for (var i = 0; i < result.kept.length; i++)
		{
			var src = result.kept[i].dataset;
			var copyId = old[src];
			var copy = catalog.getDataset(copyId);

			if (copy == null || copy.system != systemId)
			{
				copyId = catalog.addDataset(systemId, catalog.getDataset(src).name, null, id);
			}

			self.setDerivedAttributes(catalog, copyId, result.kept[i].attributes);
			copies[src] = copyId;
			self.ensureDatasetShape(catalog, system, copyId);
		}

		for (var src in old)
		{
			if (copies[src] == null && catalog.getDataset(old[src]) != null)
			{
				catalog.removeDataset(old[src]);
			}
		}

		for (var i = 0; i < input.length; i++)
		{
			var kept = null;

			for (var j = 0; j < result.kept.length; j++)
			{
				if (result.kept[j].dataset == input[i].dataset)
				{
					kept = result.kept[j];
				}
			}

			if (kept == null)
			{
				dropped.datasets.push(input[i].dataset);
			}
			else
			{
				dropped.attributes = dropped.attributes.concat(input[i].attributes.filter(function(aId)
				{
					return mxUtils.indexOf(kept.attributes, aId) < 0;
				}));
			}
		}

		catalog.setActionConfig(id, {copies: copies, dropped: dropped});
	});
};

/**
 * Applies the Validation dialog.
 */
DataFlowUi.prototype.applyValidation = function(cell, result)
{
	var id = DataFlowView.getId(cell);

	this.update(function(catalog)
	{
		catalog.setActionConfig(id, {color: catalog.getAction(id).config.color, pairs: result.pairs});
	});
};

/**
 * Applies the Addition dialog: the added dataset and its relationships,
 * which replace the ones this addition created before.
 */
DataFlowUi.prototype.applyAddition = function(cell, result)
{
	var id = DataFlowView.getId(cell);

	this.update(function(catalog)
	{
		var old = catalog.getRelationshipIds(null, id);

		for (var i = 0; i < old.length; i++)
		{
			catalog.removeRelationship(old[i]);
		}

		for (var i = 0; i < result.mappings.length; i++)
		{
			var m = result.mappings[i];
			catalog.addRelationship(m.from, m.to, m.cardinality, id);
		}

		catalog.setActionConfig(id, {dataset: result.dataset});
	});
};

/**
 * Dims everything a selected Validation does not compare (§9): the shapes
 * of the compared datasets, the Validation and its edges stay as they are.
 */
DataFlowUi.prototype.updateFocus = function()
{
	var graph = this.graph;
	var cell = (graph.getSelectionCount() == 1) ? graph.getSelectionCell() : null;
	var keep = null;

	if (DataFlowStreams.getActionType(cell) == DataFlow.ACTION_VALIDATION)
	{
		var action = this.getCatalog().getAction(DataFlowView.getId(cell));

		if (action != null)
		{
			var ids = [];

			for (var i = 0; i < action.config.pairs.length; i++)
			{
				ids.push(action.config.pairs[i].primary, action.config.pairs[i].reference);
			}

			keep = [cell].concat(graph.model.getEdges(cell));

			for (var i = 0; i < ids.length; i++)
			{
				var shapes = DataFlowView.getCells(graph, DataFlowView.DATASET, ids[i]);

				for (var j = 0; j < shapes.length; j++)
				{
					keep = keep.concat(graph.model.filterDescendants(function() { return true; }, shapes[j]));
				}
			}
		}
	}

	if (keep != null || this.focused)
	{
		this.focused = keep != null;

		graph.view.states.visit(function(key, state)
		{
			var opacity = (keep == null || mxUtils.indexOf(keep, state.cell) >= 0 ||
				state.cell == graph.model.getRoot() || graph.model.isLayer(state.cell)) ? '' : '0.18';
			var nodes = [(state.shape != null) ? state.shape.node : null,
				(state.text != null) ? state.text.node : null];

			for (var i = 0; i < nodes.length; i++)
			{
				if (nodes[i] != null)
				{
					nodes[i].style.opacity = opacity;
				}
			}
		});
	}
};

/**
 * Switches the current page to the flow or model view (§7.1).
 */
DataFlowUi.prototype.setView = function(view)
{
	var graph = this.graph;
	var lineage = DataFlowModel.isLineageShown(graph);

	graph.clearSelection();
	this.update(function(catalog)
	{
		DataFlowModel.applyView(graph, catalog, view, lineage);
	});
	this.refreshViewBar();

	// Brings the shapes of the shown view into sight
	var layer = DataFlowModel.getLayer(graph, view);
	var bounds = (layer != null) ? graph.view.getBounds(graph.model.getChildCells(layer)) : null;

	if (bounds != null)
	{
		graph.scrollRectToVisible(new mxRectangle(bounds.x, bounds.y,
			Math.min(bounds.width, graph.container.clientWidth),
			Math.min(bounds.height, graph.container.clientHeight)));
	}
};

/**
 * Shows or hides lineage in the model view.
 */
DataFlowUi.prototype.setLineageShown = function(shown)
{
	var graph = this.graph;
	var view = DataFlowModel.getView(graph);

	this.update(function(catalog)
	{
		DataFlowModel.applyView(graph, catalog, view, shown);
	});
	this.refreshViewBar();
};

/**
 * Lays out the model view again.
 */
DataFlowUi.prototype.arrangeModel = function()
{
	var graph = this.graph;

	this.update(function(catalog)
	{
		DataFlowModel.arrange(graph, catalog);
	});
};

/**
 * Adds a relationship drawn between two attribute rows of the model view.
 */
DataFlowUi.prototype.addRelationship = function(from, to, cardinality)
{
	return this.update(function(catalog)
	{
		return catalog.addRelationship(from, to, cardinality);
	});
};

/**
 * Changes the cardinality of a relationship.
 */
DataFlowUi.prototype.setCardinality = function(id, cardinality)
{
	this.update(function(catalog)
	{
		catalog.setCardinality(id, cardinality);
	});
};

/**
 * Opens the cardinality picker: for a new relationship between the given
 * columns, or for the given relationship.
 */
DataFlowUi.prototype.showRelationshipDialog = function(source, target, relationshipId)
{
	var self = this;
	var catalog = this.getCatalog();
	var rel = (relationshipId != null) ? catalog.getRelationship(relationshipId) : null;
	var from = (rel != null) ? rel.from : DataFlowView.getId(source);
	var to = (rel != null) ? rel.to : DataFlowView.getId(target);

	if (catalog.getAttribute(from) == null || catalog.getAttribute(to) == null)
	{
		return null;
	}

	return DataFlowDialogs.showCardinalityDialog(this.ui, catalog, from, to,
		(rel != null) ? rel.cardinality : null, function(cardinality)
	{
		if (rel != null)
		{
			self.setCardinality(relationshipId, cardinality);
		}
		else
		{
			self.addRelationship(from, to, cardinality);
		}
	});
};

/**
 * Creates the Flow | Model switch shown over the canvas of pages with a
 * data flow (§7.1), with Show lineage and Re-arrange in the model view.
 */
DataFlowUi.prototype.createViewBar = function()
{
	var self = this;
	var ui = this.ui;
	var bar = document.createElement('div');
	bar.className = 'geDataFlowViewBar';
	bar.setAttribute('role', 'group');
	bar.setAttribute('aria-label', mxResources.get('dfViewSwitcher'));

	function button(key, fn)
	{
		var btn = document.createElement('button');
		btn.setAttribute('type', 'button');
		btn.className = 'geDataFlowViewBtn';
		mxUtils.write(btn, mxResources.get(key));
		mxEvent.addListener(btn, 'click', fn);
		bar.appendChild(btn);

		return btn;
	};

	this.flowButton = button('dfFlowView', function()
	{
		self.setView(DataFlow.VIEW_FLOW);
	});

	this.modelButton = button('dfModelView', function()
	{
		self.setView(DataFlow.VIEW_MODEL);
	});

	var label = document.createElement('label');
	label.className = 'geDataFlowViewCheck';
	this.lineageBox = document.createElement('input');
	this.lineageBox.setAttribute('type', 'checkbox');
	label.appendChild(this.lineageBox);
	mxUtils.write(label, mxResources.get('dfShowLineage'));
	bar.appendChild(label);
	this.lineageLabel = label;

	mxEvent.addListener(this.lineageBox, 'change', function()
	{
		self.setLineageShown(self.lineageBox.checked);
	});

	this.arrangeButton = button('dfRearrange', function()
	{
		self.arrangeModel();
	});
	this.arrangeButton.classList.add('geDataFlowViewAction');

	mxEvent.disableContextMenu(bar);
	this.viewBar = bar;

	if (ui.diagramContainer != null && ui.diagramContainer.parentNode != null)
	{
		ui.diagramContainer.parentNode.appendChild(bar);
	}

	// Follows the canvas when the editor layout changes
	var uiRefresh = ui.refresh;

	ui.refresh = function()
	{
		uiRefresh.apply(this, arguments);
		self.refreshViewBar();
	};

	ui.editor.addListener('pageSelected', function()
	{
		self.refreshViewBar();
	});

	this.graph.model.addListener(mxEvent.CHANGE, function()
	{
		self.refreshViewBar();
	});

	mxEvent.addListener(window, 'resize', function()
	{
		self.refreshViewBar();
	});

	this.refreshViewBar();
};

/**
 * Shows the view switch on pages with a data flow, reflects the current
 * view and centres it over the canvas.
 */
DataFlowUi.prototype.refreshViewBar = function()
{
	var bar = this.viewBar;
	var graph = this.graph;
	var container = this.ui.diagramContainer;

	if (bar == null)
	{
		return;
	}

	var shown = graph.isEnabled() && !this.ui.editor.chromeless && DataFlowCatalog.hasCatalog(graph);
	bar.style.display = (shown) ? '' : 'none';

	if (shown)
	{
		var model = DataFlowModel.getView(graph) == DataFlow.VIEW_MODEL;
		this.flowButton.setAttribute('aria-pressed', String(!model));
		this.modelButton.setAttribute('aria-pressed', String(model));
		this.lineageLabel.style.display = (model) ? '' : 'none';
		this.arrangeButton.style.display = (model) ? '' : 'none';
		this.lineageBox.checked = DataFlowModel.isLineageShown(graph);

		if (container != null)
		{
			bar.style.left = Math.round(container.offsetLeft + (container.offsetWidth - bar.offsetWidth) / 2) + 'px';
			bar.style.top = (container.offsetTop + 10) + 'px';
		}
	}
};

/**
 * Returns a palette template: a system with one dataset, or a dataset.
 */
DataFlowUi.createTemplate = function(type)
{
	var doc = mxUtils.createXmlDocument();

	function value(label)
	{
		var v = doc.createElement('object');
		v.setAttribute('label', label);
		v.setAttribute('dfTemplate', type);

		return v;
	};

	if (DataFlow.ACTIONS[type] != null)
	{
		var spec = DataFlow.ACTIONS[type];
		var action = new mxCell(value(DataFlowView.getActionLabel(new DataFlowCatalog(), null, type, null)),
			new mxGeometry(0, 0, spec.width, spec.height),
			DataFlowView.getActionStyle(type, {setup: false, problems: []}));
		action.vertex = true;

		return action;
	}

	var dataset = new mxCell(value(DataFlowView.getDatasetLabel({name:
		mxResources.get('dfDataset'), attributes: [1, 2, 3]})),
		new mxGeometry(10, DataFlow.SYSTEM_HEADER + 10, DataFlow.SYSTEM_WIDTH - 20,
		DataFlow.DATASET_HEADER), DataFlow.DATASET_STYLE + 'collapsible=0;');
	dataset.vertex = true;

	if (type == DataFlowView.DATASET)
	{
		dataset.geometry.x = 0;
		dataset.geometry.y = 0;

		return dataset;
	}

	var system = new mxCell(value(DataFlowView.getSystemLabel({name: mxResources.get('dfSystem'),
		owner: mxResources.get('dfOwner'), environment: 'SAP'})),
		new mxGeometry(0, 0, DataFlow.SYSTEM_WIDTH, DataFlow.SYSTEM_HEADER +
		DataFlow.DATASET_HEADER + 20), DataFlow.SYSTEM_STYLE);
	system.vertex = true;
	system.insert(dataset);

	return system;
};

(function()
{
	// Creates the integration for every editor
	var editorUiInit = EditorUi.prototype.init;

	EditorUi.prototype.init = function()
	{
		editorUiInit.apply(this, arguments);
		this.dataFlow = new DataFlowUi(this);
		this.dataFlow.createViewBar();
	};

	// Context menu items
	var menusCreatePopupMenu = Menus.prototype.createPopupMenu;

	Menus.prototype.createPopupMenu = function(menu, cell, evt)
	{
		menusCreatePopupMenu.apply(this, arguments);

		if (this.editorUi.dataFlow != null)
		{
			this.editorUi.dataFlow.addPopupMenuItems(menu, cell);
		}
	};

	// Adds the Data Flow palette above the General palette
	var sidebarInit = Sidebar.prototype.init;

	Sidebar.prototype.init = function()
	{
		sidebarInit.apply(this, arguments);
		this.addDataFlowPalette();
	};

	Sidebar.prototype.addDataFlowPalette = function()
	{
		var sb = this;
		var tags = 'data flow dataflow lineage ';

		var fns = [
			this.addEntry(tags + 'system application', function()
			{
				return sb.createVertexTemplateFromCells([DataFlowUi.createTemplate(DataFlowView.SYSTEM)],
					DataFlow.SYSTEM_WIDTH, DataFlow.SYSTEM_HEADER + DataFlow.DATASET_HEADER + 20,
					mxResources.get('dfSystem'), true);
			}),
			this.addEntry(tags + 'dataset table', function()
			{
				return sb.createVertexTemplateFromCells([DataFlowUi.createTemplate(DataFlowView.DATASET)],
					DataFlow.SYSTEM_WIDTH - 20, DataFlow.DATASET_HEADER,
					mxResources.get('dfDataset'), true);
			})
		];

		DataFlow.ACTION_TYPES.forEach(function(type)
		{
			var spec = DataFlow.ACTIONS[type];

			fns.push(sb.addEntry(tags + 'action ' + type, function()
			{
				return sb.createVertexTemplateFromCells([DataFlowUi.createTemplate(type)],
					spec.width, spec.height, mxResources.get('dfAction_' + type), true);
			}));
		});

		this.addPaletteFunctions('dataflow', mxResources.get('dfDataFlow'), true, fns);

		var elts = this.palettes['dataflow'];
		var general = this.palettes['general'];

		if (elts != null && general != null && general[0].parentNode != null)
		{
			for (var i = 0; i < elts.length; i++)
			{
				general[0].parentNode.insertBefore(elts[i], general[0]);
			}
		}
	};

	// Palette templates open the dialogs instead of inserting cells
	var sidebarCreateDropHandler = Sidebar.prototype.createDropHandler;

	Sidebar.prototype.createDropHandler = function(cells, allowSplit, allowCellsInserted, bounds)
	{
		var template = (cells != null && cells.length == 1) ? DataFlowView.getTemplate(cells[0]) : null;

		if (template == null)
		{
			return sidebarCreateDropHandler.apply(this, arguments);
		}

		return mxUtils.bind(this, function(graph, evt, target, x, y, force)
		{
			// Ignores drops on the sidebar itself (as the default handler)
			var elt = (force) ? null : ((mxEvent.isTouchEvent(evt) || mxEvent.isPenEvent(evt)) ?
				document.elementFromPoint(mxEvent.getClientX(evt), mxEvent.getClientY(evt)) :
				mxEvent.getSource(evt));

			while (elt != null && elt != this.container)
			{
				elt = elt.parentNode;
			}

			var dataFlow = this.editorUi.dataFlow;

			if (elt == null && dataFlow != null && graph == dataFlow.graph && graph.isEnabled())
			{
				graph.stopEditing();
				dataFlow.templateDropped(template, target, x, y, force);
			}
		});
	};
})();
