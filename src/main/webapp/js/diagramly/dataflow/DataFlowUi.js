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
		if (!DataFlowView.syncing)
		{
			self.cellsRemoved(evt.getProperty('cells'));
		}
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
		else if (type == DataFlowView.DATASET || type == DataFlowView.ATTRIBUTE)
		{
			return false;
		}
		else if (self.containsDatasets(cells))
		{
			return false;
		}

		return graphIsValidDropTarget.apply(this, arguments);
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
	return DataFlowView.update(this.graph, fn);
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
		graph.addCell(cell, graph.getDefaultParent());

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

	function collect(cell)
	{
		var type = DataFlowView.getType(cell);
		var id = DataFlowView.getId(cell);

		if (type == DataFlowView.SYSTEM && mxUtils.indexOf(systems, id) < 0)
		{
			systems.push(id);
		}
		else if (type == DataFlowView.DATASET && mxUtils.indexOf(datasets, id) < 0)
		{
			datasets.push(id);
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

	if (systems.length > 0 || datasets.length > 0)
	{
		this.update(function(catalog)
		{
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

	if (template == DataFlowView.SYSTEM)
	{
		this.showSystemDialog(null, x - DataFlow.SYSTEM_WIDTH / 2, y - DataFlow.SYSTEM_HEADER / 2);
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

	return DataFlowDialogs.showDatasetDialog(this.ui, catalog, DataFlowView.getId(systemCell), id,
		DataFlowView.getDatasetIds(this.graph, systemCell), function(result)
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
};

/**
 * Asks before deleting the entity of the given occurrence everywhere.
 */
DataFlowUi.prototype.confirmDeleteEntity = function(cell)
{
	var self = this;
	var type = DataFlowView.getType(cell);
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

	if (type != null && graph.isEnabled() && graph.getSelectionCount() <= 1)
	{
		menu.addSeparator();

		if (type == DataFlowView.SYSTEM)
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
