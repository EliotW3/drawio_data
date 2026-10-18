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
DataFlowView.ACTION = 'action';
DataFlowView.FLOW = 'flow';

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
 * Returns the cell to edit for the given cell: the dataset (or table) for an
 * attribute row (or column), otherwise the system, dataset, action, table
 * or relationship itself, or null.
 */
DataFlowView.getEditCell = function(graph, cell)
{
	var type = DataFlowView.getType(cell);

	if (type == DataFlowView.ATTRIBUTE || type == 'column')
	{
		return graph.model.getParent(cell);
	}

	return (type == DataFlowView.SYSTEM || type == DataFlowView.DATASET ||
		type == DataFlowView.ACTION || type == 'table' || type == 'relationship') ? cell : null;
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
 * Returns the HTML label of a dataset: table glyph, name, attribute count and
 * the badges of the validations that compare it ({text, color} each).
 */
DataFlowView.getDatasetLabel = function(dataset, badges)
{
	var c = DataFlow.COLORS;
	var html = '<span style="color:' + c.datasetAccent + ';">&#9638;</span>&nbsp; <b>' +
		mxUtils.htmlEntities(dataset.name) + '</b> <span style="color:' + c.datasetCount +
		';">(' + dataset.attributes.length + ')</span>';

	for (var i = 0; badges != null && i < badges.length; i++)
	{
		html += ' ' + DataFlowView.getBadge(badges[i].text, badges[i].color);
	}

	return html;
};

/**
 * Returns the HTML of a small coloured badge.
 */
DataFlowView.getBadge = function(text, color)
{
	return '<span style="font-size:9px;font-weight:bold;color:#FFFFFF;background:' + color +
		';border-radius:7px;padding:1px 5px;">' + mxUtils.htmlEntities(text) + '</span>';
};

/**
 * Returns the validation badges of every dataset as a map from dataset ID
 * to [{text, color}]: V1, V2, ... in the order the validations were added.
 */
DataFlowView.getValidationBadges = function(catalog)
{
	var result = DataFlowCatalog.createMap();
	var ids = catalog.getActionIds(DataFlow.ACTION_VALIDATION);

	function add(datasetId, badge)
	{
		var list = result[datasetId] = result[datasetId] || [];

		if (mxUtils.indexOf(list, badge) < 0)
		{
			list.push(badge);
		}
	};

	for (var i = 0; i < ids.length; i++)
	{
		var config = catalog.getAction(ids[i]).config;
		var badge = {text: 'V' + (i + 1), color: config.color};

		for (var j = 0; j < config.pairs.length; j++)
		{
			add(config.pairs[j].primary, badge);
			add(config.pairs[j].reference, badge);
		}
	}

	return result;
};

/**
 * Returns the number of a validation (1 for the first one added).
 */
DataFlowView.getValidationNumber = function(catalog, id)
{
	return mxUtils.indexOf(catalog.getActionIds(DataFlow.ACTION_VALIDATION), id) + 1;
};

/**
 * Returns the HTML label of an action: glyph and name, the validation badge,
 * and an amber "!" if it needs attention.
 */
DataFlowView.getActionLabel = function(catalog, id, type, state)
{
	var spec = DataFlow.ACTIONS[type];
	var name = mxUtils.htmlEntities(mxResources.get('dfAction_' + type));
	var html = '<b>' + ((spec.glyphAfter) ? name + spec.glyph : spec.glyph + name) + '</b>';

	if (type == DataFlow.ACTION_VALIDATION && catalog.getAction(id) != null)
	{
		html += ' ' + DataFlowView.getBadge('V' + DataFlowView.getValidationNumber(catalog, id),
			catalog.getAction(id).config.color);
	}

	if (state != null && state.problems.length > 0)
	{
		html = DataFlowView.getBadge('!', DataFlow.COLORS.attention) + ' ' + html;
	}

	return html;
};

/**
 * Returns the tooltip of an action: what is missing or no longer matches.
 */
DataFlowView.getActionTooltip = function(state)
{
	var lines = [];

	for (var i = 0; i < state.missing.length; i++)
	{
		lines.push(mxResources.get(state.missing[i]));
	}

	if (state.missing.length == 0 && state.setup)
	{
		lines.push(mxResources.get('dfNeedsSetup'));
	}

	return lines.concat(state.problems).join('\n');
};

/**
 * Returns the style of an action shape. While it needs setup it is drawn
 * as a dashed outline in its colour, otherwise filled.
 */
DataFlowView.getActionStyle = function(type, state)
{
	var spec = DataFlow.ACTIONS[type];
	var style = DataFlow.ACTION_STYLE + spec.shape + 'points=' + spec.points + ';';

	if (state == null || state.setup)
	{
		return style + 'fillColor=#FFFFFF;fontColor=' + spec.color + ';strokeColor=' +
			spec.color + ';strokeWidth=1.5;dashed=1;dashPattern=5 3;';
	}

	return style + 'fillColor=' + spec.color + ';fontColor=#FFFFFF;strokeColor=' +
		((state.problems.length > 0) ? DataFlow.COLORS.attention + ';strokeWidth=3;' : 'none;');
};

/**
 * Returns a new action shape with its top left corner at the given point.
 */
DataFlowView.createActionCell = function(catalog, id, x, y)
{
	var type = catalog.getAction(id).type;
	var spec = DataFlow.ACTIONS[type];
	var value = DataFlowView.createValue(DataFlowView.ACTION, id,
		DataFlowView.getActionLabel(catalog, id, type, null));
	value.setAttribute('dfAction', type);
	var cell = new mxCell(value, new mxGeometry(x, y, spec.width, spec.height),
		DataFlowView.getActionStyle(type, null));
	cell.vertex = true;

	return cell;
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
 * Sets the given style keys of a cell if they differ.
 */
DataFlowView.updateStyle = function(graph, cell, keys)
{
	var style = cell.style || '';

	for (var key in keys)
	{
		style = mxUtils.setStyle(style, key, keys[key]);
	}

	if (style != cell.style)
	{
		graph.model.setStyle(cell, style);
	}
};

/**
 * Brings a flow edge between two data flow nodes in line with the rules:
 * sets its role (keeping the current one while it is valid), its style and
 * its value. A connection that breaks the rules is drawn red and dashed
 * with the reason as its tooltip.
 */
DataFlowView.syncEdge = function(graph, edge)
{
	var model = graph.model;
	var source = model.getTerminal(edge, true);
	var target = model.getTerminal(edge, false);
	var role = DataFlowStreams.getRole(edge);
	var style = graph.getCurrentCellStyle(edge);
	var conn = DataFlowStreams.getConnection(graph, edge, source, target,
		role == DataFlowStreams.SECONDARY || (role == null && style['entryY'] == '1'));

	if (conn == null)
	{
		return;
	}

	var tooltip = null;

	if (conn.error != null)
	{
		role = 'invalid';
		tooltip = conn.error;
	}
	else
	{
		role = conn.role;
	}

	var newStyle = DataFlow.FLOW_STYLE + DataFlow.FLOW_ROLE_STYLES[role] +
		((DataFlowView.getType(source) == DataFlowView.ACTION) ?
		'exitX=1;exitY=0.5;exitDx=0;exitDy=0;' : '');

	if (edge.style != newStyle)
	{
		model.setStyle(edge, newStyle);
	}

	var value = edge.value;

	if (DataFlowView.getType(edge) != DataFlowView.FLOW || value.getAttribute('dfRole') != role ||
		value.getAttribute('tooltip') != tooltip)
	{
		var label = (value != null && typeof value === 'object') ?
			value.getAttribute('label') : ((value != null) ? String(value) : '');
		value = mxUtils.createXmlDocument().createElement('object');
		value.setAttribute('label', label || '');
		value.setAttribute('dfType', DataFlowView.FLOW);
		value.setAttribute('dfRole', role);

		if (tooltip != null)
		{
			value.setAttribute('tooltip', tooltip);
		}

		model.setValue(edge, value);
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
 * removes the shapes of entities that no longer exist (with their edges),
 * applies the connection rules to flow edges, and updates labels, attribute
 * rows, validation highlights and action states. Must run inside a model
 * transaction.
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

		// Removes the shapes of deleted entities first, with their edges
		for (var i = 0; i < cells.length; i++)
		{
			var type = DataFlowView.getType(cells[i]);
			var id = DataFlowView.getId(cells[i]);

			if ((type == DataFlowView.SYSTEM && catalog.getSystem(id) == null) ||
				(type == DataFlowView.DATASET && catalog.getDataset(id) == null) ||
				(type == DataFlowView.ACTION && catalog.getAction(id) == null))
			{
				removed.push(cells[i]);
			}
		}

		if (removed.length > 0)
		{
			graph.removeCells(removed, true);
		}

		// Flow edges, then everything else (action states depend on edge roles)
		var edges = model.filterDescendants(function(cell)
		{
			return model.isEdge(cell) && (DataFlowView.getType(cell) == DataFlowView.FLOW ||
				(DataFlowStreams.isNode(model.getTerminal(cell, true)) &&
				DataFlowStreams.isNode(model.getTerminal(cell, false))));
		});

		for (var i = 0; i < edges.length; i++)
		{
			DataFlowView.syncEdge(graph, edges[i]);
		}

		var badges = DataFlowView.getValidationBadges(catalog);
		cells = model.filterDescendants(function(cell)
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
				DataFlowView.updateValue(graph, cell,
					DataFlowView.getSystemLabel(system), system.notes);
			}
			else if (type == DataFlowView.DATASET)
			{
				var dataset = catalog.getDataset(id);
				var list = badges[id];
				DataFlowView.updateValue(graph, cell, DataFlowView.getDatasetLabel(dataset, list));
				DataFlowView.updateStyle(graph, cell, {
					strokeColor: (list != null) ? list[0].color : DataFlow.COLORS.datasetBorder,
					strokeWidth: (list != null) ? '2' : null});
				DataFlowView.syncAttributeCells(graph, catalog, cell, dataset);
			}
			else if (type == DataFlowView.ACTION)
			{
				var actionType = catalog.getAction(id).type;
				var state = DataFlowStreams.getActionState(graph, catalog, cell);
				DataFlowView.updateValue(graph, cell, DataFlowView.getActionLabel(catalog,
					id, actionType, state), DataFlowView.getActionTooltip(state));
				var actionStyle = DataFlowView.getActionStyle(actionType, state);

				if (cell.style != actionStyle)
				{
					model.setStyle(cell, actionStyle);
				}
			}
		}

		// The model view, once it exists (§7)
		DataFlowModel.sync(graph, catalog);
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
