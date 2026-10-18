/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * Turns catalog entities into cells (docs/DATAFLOW.md §5). Every shape is an
 * ordinary draw.io cell whose value carries dfType (system, dataset or
 * attribute) and dfId (the entity it draws), so the viewer and every export
 * draw it without this code. The catalog is the source of truth: sync
 * re-renders every occurrence of every entity and removes the shapes of
 * entities that no longer exist (D17).
 */
var DataFlowView = {};

/**
 * Cell types.
 */
DataFlowView.SYSTEM = 'system';
DataFlowView.DATASET = 'dataset';
DataFlowView.ATTRIBUTE = 'attribute';

/**
 * Set while sync changes cells, so that listeners can ignore those changes.
 */
DataFlowView.syncing = false;

/**
 * Returns the dfType of the given cell or null.
 */
DataFlowView.getType = function(cell)
{
	return (cell != null && cell.value != null && typeof cell.value === 'object' &&
		cell.value.getAttribute != null) ? cell.value.getAttribute('dfType') : null;
};

/**
 * Returns the dfId of the given cell or null.
 */
DataFlowView.getId = function(cell)
{
	return (DataFlowView.getType(cell) != null) ? cell.value.getAttribute('dfId') : null;
};

/**
 * Returns the template type (system or dataset) of a palette cell or null.
 */
DataFlowView.getTemplate = function(cell)
{
	return (cell != null && cell.value != null && typeof cell.value === 'object' &&
		cell.value.getAttribute != null) ? cell.value.getAttribute('dfTemplate') : null;
};

/**
 * Returns the system occurrence that contains the given cell (or is the
 * cell), or null.
 */
DataFlowView.getSystemCell = function(graph, cell)
{
	while (cell != null)
	{
		if (DataFlowView.getType(cell) == DataFlowView.SYSTEM)
		{
			return cell;
		}

		cell = graph.model.getParent(cell);
	}

	return null;
};

/**
 * Returns the cell to edit for the given cell: the dataset for an attribute
 * row, otherwise the system or dataset itself, or null.
 */
DataFlowView.getEditCell = function(graph, cell)
{
	var type = DataFlowView.getType(cell);

	if (type == DataFlowView.ATTRIBUTE)
	{
		return graph.model.getParent(cell);
	}

	return (type == DataFlowView.SYSTEM || type == DataFlowView.DATASET) ? cell : null;
};

/**
 * Returns all cells of the current page of the given type, and of the given
 * entity ID if one is given.
 */
DataFlowView.getCells = function(graph, type, id)
{
	return graph.model.filterDescendants(function(cell)
	{
		return DataFlowView.getType(cell) == type &&
			(id == null || DataFlowView.getId(cell) == id);
	});
};

/**
 * Returns the IDs of the datasets shown in the given system occurrence.
 */
DataFlowView.getDatasetIds = function(graph, systemCell)
{
	var result = [];
	var children = graph.model.getChildCells(systemCell);

	for (var i = 0; i < children.length; i++)
	{
		if (DataFlowView.getType(children[i]) == DataFlowView.DATASET)
		{
			result.push(DataFlowView.getId(children[i]));
		}
	}

	return result;
};

/**
 * Returns a new cell value.
 */
DataFlowView.createValue = function(type, id, label, tooltip)
{
	var value = mxUtils.createXmlDocument().createElement('object');
	value.setAttribute('label', label);
	value.setAttribute('dfType', type);
	value.setAttribute('dfId', id);

	if (tooltip != null && tooltip !== '')
	{
		value.setAttribute('tooltip', tooltip);
	}

	return value;
};

/**
 * Returns the HTML label of a system: name, owner and environment chip.
 * All entity text is escaped.
 */
DataFlowView.getSystemLabel = function(system)
{
	var c = DataFlow.COLORS;
	var html = '<div style="display:flex;align-items:center;gap:8px;">' +
		'<div style="min-width:0;line-height:1.25;"><b>' +
		mxUtils.htmlEntities(system.name) + '</b>';

	if (system.owner !== '')
	{
		html += '<br><span style="font-size:10.5px;color:' + c.systemOwner + ';">' +
			mxUtils.htmlEntities(system.owner) + '</span>';
	}

	html += '</div>';

	if (system.environment !== '')
	{
		html += '<span style="flex:none;font-size:10px;line-height:1;color:' + c.chipText +
			';background:' + c.chipFill + ';border-radius:8px;padding:3px 7px;">' +
			mxUtils.htmlEntities(system.environment) + '</span>';
	}

	return html + '</div>';
};

/**
 * Returns the HTML label of a dataset: table glyph, name and attribute count.
 */
DataFlowView.getDatasetLabel = function(dataset)
{
	var c = DataFlow.COLORS;

	return '<span style="color:' + c.datasetAccent + ';">&#9638;</span>&nbsp; <b>' +
		mxUtils.htmlEntities(dataset.name) + '</b> <span style="color:' + c.datasetCount +
		';">(' + dataset.attributes.length + ')</span>';
};

/**
 * Returns the style of the attribute row at the given index (alternating fill).
 */
DataFlowView.getAttributeStyle = function(index)
{
	return DataFlow.ATTRIBUTE_STYLE + 'fillColor=' +
		((index % 2 == 0) ? DataFlow.COLORS.attributeAlt : 'none') + ';';
};

/**
 * Returns the expanded height of a dataset with the given attribute count.
 */
DataFlowView.getDatasetHeight = function(count)
{
	return DataFlow.DATASET_HEADER + count * DataFlow.ATTRIBUTE_HEIGHT +
		((count > 0) ? 4 : 0);
};

/**
 * Returns a new system occurrence at the given position.
 */
DataFlowView.createSystemCell = function(catalog, id, x, y)
{
	var system = catalog.getSystem(id);
	var cell = new mxCell(DataFlowView.createValue(DataFlowView.SYSTEM, id,
		DataFlowView.getSystemLabel(system), system.notes),
		new mxGeometry(x, y, DataFlow.SYSTEM_WIDTH, DataFlow.SYSTEM_HEADER + 20),
		DataFlow.SYSTEM_STYLE);
	cell.vertex = true;

	return cell;
};

/**
 * Returns a new dataset occurrence with its attribute rows, collapsed unless
 * expanded is true.
 */
DataFlowView.createDatasetCell = function(catalog, id, expanded)
{
	var dataset = catalog.getDataset(id);
	var width = DataFlow.SYSTEM_WIDTH - 20;
	var height = DataFlowView.getDatasetHeight(dataset.attributes.length);
	var cell = new mxCell(DataFlowView.createValue(DataFlowView.DATASET, id,
		DataFlowView.getDatasetLabel(dataset)),
		new mxGeometry(0, 0, width, (expanded) ? height : DataFlow.DATASET_HEADER),
		DataFlow.DATASET_STYLE);
	cell.vertex = true;
	DataFlowView.addAttributeCells(catalog, cell, dataset);

	if (!expanded)
	{
		cell.collapsed = true;
		cell.geometry.alternateBounds = new mxRectangle(0, 0, width, height);
	}

	return cell;
};

/**
 * Adds a row for every attribute of the dataset to the given cell.
 */
DataFlowView.addAttributeCells = function(catalog, cell, dataset)
{
	var width = cell.geometry.width;

	for (var i = 0; i < dataset.attributes.length; i++)
	{
		var aId = dataset.attributes[i];
		var row = new mxCell(DataFlowView.createValue(DataFlowView.ATTRIBUTE, aId,
			mxUtils.htmlEntities(catalog.getAttribute(aId).name)),
			new mxGeometry(0, DataFlow.DATASET_HEADER + i * DataFlow.ATTRIBUTE_HEIGHT,
				width, DataFlow.ATTRIBUTE_HEIGHT), DataFlowView.getAttributeStyle(i));
		row.vertex = true;
		cell.insert(row);
	}
};

/**
 * Updates the value of the given cell if its label or tooltip differ.
 */
DataFlowView.updateValue = function(graph, cell, label, tooltip)
{
	tooltip = (tooltip != null && tooltip !== '') ? tooltip : null;

	if (cell.value.getAttribute('label') !== label ||
		cell.value.getAttribute('tooltip') !== tooltip)
	{
		var value = cell.value.cloneNode(true);
		value.setAttribute('label', label);

		if (tooltip != null)
		{
			value.setAttribute('tooltip', tooltip);
		}
		else
		{
			value.removeAttribute('tooltip');
		}

		graph.model.setValue(cell, value);
	}
};

/**
 * Replaces the attribute rows of a dataset occurrence if they differ from
 * the catalog, and updates the expanded size.
 */
DataFlowView.syncAttributeCells = function(graph, catalog, cell, dataset)
{
	var model = graph.model;
	var rows = model.getChildCells(cell);
	var same = rows.length == dataset.attributes.length;

	for (var i = 0; same && i < rows.length; i++)
	{
		same = DataFlowView.getId(rows[i]) == dataset.attributes[i] &&
			rows[i].value.getAttribute('label') ===
				mxUtils.htmlEntities(catalog.getAttribute(dataset.attributes[i]).name);
	}

	if (!same)
	{
		for (var i = 0; i < rows.length; i++)
		{
			model.remove(rows[i]);
		}

		var temp = new mxCell(null, cell.geometry.clone());
		DataFlowView.addAttributeCells(catalog, temp, dataset);

		while (temp.getChildCount() > 0)
		{
			model.add(cell, temp.getChildAt(0));
		}

		var height = DataFlowView.getDatasetHeight(dataset.attributes.length);
		var geo = cell.geometry.clone();

		if (cell.collapsed)
		{
			geo.alternateBounds = new mxRectangle(0, 0, geo.width, height);
		}
		else
		{
			geo.height = height;
		}

		model.setGeometry(cell, geo);
	}
};

/**
 * Brings every data flow cell of the current page in line with the catalog:
 * updates labels and attribute rows, and removes the shapes of entities
 * that no longer exist. Must run inside a model transaction.
 */
DataFlowView.sync = function(graph, catalog)
{
	var model = graph.model;
	var removed = [];
	var wasSyncing = DataFlowView.syncing;
	DataFlowView.syncing = true;

	try
	{
		var cells = model.filterDescendants(function(cell)
		{
			return DataFlowView.getType(cell) != null;
		});

		for (var i = 0; i < cells.length; i++)
		{
			var cell = cells[i];
			var type = DataFlowView.getType(cell);
			var id = DataFlowView.getId(cell);

			if (type == DataFlowView.SYSTEM)
			{
				var system = catalog.getSystem(id);

				if (system == null)
				{
					removed.push(cell);
				}
				else
				{
					DataFlowView.updateValue(graph, cell,
						DataFlowView.getSystemLabel(system), system.notes);
				}
			}
			else if (type == DataFlowView.DATASET)
			{
				var dataset = catalog.getDataset(id);

				if (dataset == null)
				{
					removed.push(cell);
				}
				else
				{
					DataFlowView.updateValue(graph, cell, DataFlowView.getDatasetLabel(dataset));
					DataFlowView.syncAttributeCells(graph, catalog, cell, dataset);
				}
			}
		}

		for (var i = 0; i < removed.length; i++)
		{
			// Descendants of removed cells are already gone
			if (model.contains(removed[i]))
			{
				model.remove(removed[i]);
			}
		}
	}
	finally
	{
		DataFlowView.syncing = wasSyncing;
	}
};

/**
 * Changes the catalog of the current page with the given function and syncs
 * the cells, as one undoable edit. Returns the function's result.
 */
DataFlowView.update = function(graph, fn)
{
	return DataFlowCatalog.edit(graph, function(catalog)
	{
		var result = fn(catalog);
		DataFlowView.sync(graph, catalog);

		return result;
	});
};
