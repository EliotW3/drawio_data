/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * The model view of a data flow page (docs/DATAFLOW.md §7): one table per
 * dataset with a row per attribute, relationship edges between rows with
 * ER markers, and one lineage edge per pair of datasets (decision E). It
 * lives in its own layers on the same page as the flow, so switching views
 * swaps layer visibility (D15) and the viewer can switch them too.
 *
 * Layers are marked with dfLayer: flow (the existing layer of the flow
 * shapes), model (tables and relationships) and lineage (lineage edges,
 * hidden with Show lineage). Once the model layer exists, every sync keeps
 * it in line with the catalog, so table positions survive.
 */
var DataFlowModel = {};

/**
 * Cell and layer types.
 */
DataFlowModel.TABLE = 'table';
DataFlowModel.COLUMN = 'column';
DataFlowModel.RELATIONSHIP = 'relationship';
DataFlowModel.LINEAGE = 'lineage';
DataFlowModel.LAYER_ATTRIBUTE = 'dfLayer';

/**
 * Returns the dfLayer of the given layer or null.
 */
DataFlowModel.getLayerRole = function(cell)
{
	return (cell != null && cell.value != null && typeof cell.value === 'object' &&
		cell.value.getAttribute != null) ? cell.value.getAttribute(DataFlowModel.LAYER_ATTRIBUTE) : null;
};

/**
 * Returns the layer with the given role on the current page, or null.
 */
DataFlowModel.getLayer = function(graph, role)
{
	var model = graph.model;
	var root = model.getRoot();

	for (var i = 0; i < model.getChildCount(root); i++)
	{
		var layer = model.getChildAt(root, i);

		if (DataFlowModel.getLayerRole(layer) == role)
		{
			return layer;
		}
	}

	return null;
};

/**
 * Returns the layer of the flow shapes: the marked flow layer, else the
 * layer that contains systems or actions, else the default parent.
 */
DataFlowModel.getFlowLayer = function(graph)
{
	var layer = DataFlowModel.getLayer(graph, DataFlow.VIEW_FLOW);

	if (layer == null)
	{
		var model = graph.model;
		var root = model.getRoot();

		for (var i = 0; i < model.getChildCount(root) && layer == null; i++)
		{
			var candidate = model.getChildAt(root, i);

			if (DataFlowModel.getLayerRole(candidate) == null &&
				model.filterDescendants(DataFlowStreams.isNode, candidate).length > 0)
			{
				layer = candidate;
			}
		}
	}

	return (layer != null) ? layer : graph.getDefaultParent();
};

/**
 * Returns the current view of the page (flow unless the page says model).
 */
DataFlowModel.getView = function(graph)
{
	var root = graph.model.getRoot();
	var view = (root != null && root.value != null && typeof root.value === 'object') ?
		root.value.getAttribute(DataFlow.VIEW_ATTRIBUTE) : null;

	return (view == DataFlow.VIEW_MODEL && DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL) != null) ?
		DataFlow.VIEW_MODEL : DataFlow.VIEW_FLOW;
};

/**
 * Returns true if lineage is shown in the model view (default true).
 */
DataFlowModel.isLineageShown = function(graph)
{
	var root = graph.model.getRoot();

	return !(root != null && root.value != null && typeof root.value === 'object' &&
		root.value.getAttribute('dfLineage') == '0');
};

/**
 * Returns a new layer value with the given label and role.
 */
DataFlowModel.createLayerValue = function(label, role)
{
	var value = mxUtils.createXmlDocument().createElement('object');
	value.setAttribute('label', label);
	value.setAttribute(DataFlowModel.LAYER_ATTRIBUTE, role);

	return value;
};

/**
 * Marks the flow layer and adds the model and lineage layers if missing.
 * Returns true if the model layer was created.
 */
DataFlowModel.ensureLayers = function(graph)
{
	var model = graph.model;
	var root = model.getRoot();
	var flow = DataFlowModel.getFlowLayer(graph);

	if (DataFlowModel.getLayerRole(flow) != DataFlow.VIEW_FLOW)
	{
		var label = graph.convertValueToString(flow);
		model.setValue(flow, DataFlowModel.createLayerValue((label != null && label != '') ?
			label : mxResources.get('dfFlowLayer'), DataFlow.VIEW_FLOW));
	}

	var created = false;

	if (DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL) == null)
	{
		var layer = new mxCell(DataFlowModel.createLayerValue(mxResources.get('dfModelLayer'),
			DataFlow.VIEW_MODEL));
		layer.visible = false;
		model.add(root, layer);
		created = true;
	}

	if (DataFlowModel.getLayer(graph, DataFlowModel.LINEAGE) == null)
	{
		var layer = new mxCell(DataFlowModel.createLayerValue(mxResources.get('dfLineageLayer'),
			DataFlowModel.LINEAGE));
		layer.visible = false;
		model.add(root, layer);
	}

	return created;
};

/**
 * Shows or hides a layer and locks it while it is hidden.
 */
DataFlowModel.setLayerShown = function(graph, layer, shown)
{
	if (layer != null)
	{
		var model = graph.model;

		if (model.isVisible(layer) != shown)
		{
			model.setVisible(layer, shown);
		}

		var style = mxUtils.setStyle(layer.style || '', 'locked', (shown) ? null : '1');

		if ((layer.style || '') != style)
		{
			model.setStyle(layer, style);
		}
	}
};

/**
 * Switches the page to the given view (and lineage visibility), creating
 * and laying out the model on first use. Must run inside DataFlowView.update.
 */
DataFlowModel.applyView = function(graph, catalog, view, showLineage)
{
	if (DataFlowModel.ensureLayers(graph))
	{
		DataFlowModel.sync(graph, catalog);
		DataFlowModel.arrange(graph, catalog);
	}

	var model = (view == DataFlow.VIEW_MODEL);
	DataFlowModel.setLayerShown(graph, DataFlowModel.getLayer(graph, DataFlow.VIEW_FLOW), !model);
	DataFlowModel.setLayerShown(graph, DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL), model);
	DataFlowModel.setLayerShown(graph, DataFlowModel.getLayer(graph, DataFlowModel.LINEAGE),
		model && showLineage);

	var root = graph.model.getRoot();
	graph.setAttributeForCell(root, DataFlow.VIEW_ATTRIBUTE, view);
	graph.setAttributeForCell(root, 'dfLineage', (showLineage) ? null : '0');
};

/**
 * Returns the header colour of a system's tables (decision F): a palette
 * colour by the order the systems were added.
 */
DataFlowModel.getSystemColor = function(catalog, systemId)
{
	var index = Math.max(0, mxUtils.indexOf(catalog.getSystemIds(), systemId));

	return DataFlow.SYSTEM_PALETTE[index % DataFlow.SYSTEM_PALETTE.length];
};

/**
 * Returns the label of a table: dataset name and system name.
 */
DataFlowModel.getTableLabel = function(catalog, dataset)
{
	var system = catalog.getSystem(dataset.system);

	return '<b>' + mxUtils.htmlEntities(dataset.name) + '</b> <span style="font-size:10px;' +
		'font-weight:normal;opacity:0.82;">' + mxUtils.htmlEntities((system != null) ? system.name : '') +
		'</span>';
};

/**
 * Returns the label and tooltip of a column: the name, and for a copy a
 * lineage mark with the source in the tooltip.
 */
DataFlowModel.getColumnValue = function(catalog, attributeId)
{
	var attribute = catalog.getAttribute(attributeId);
	var label = mxUtils.htmlEntities(attribute.name);
	var tooltip = null;
	var source = (attribute.derivedFrom != null) ? catalog.getAttribute(attribute.derivedFrom) : null;

	if (source != null)
	{
		var dataset = catalog.getDataset(source.dataset);
		var system = catalog.getSystem(dataset.system);
		label += ' <span style="color:' + DataFlow.COLORS.lineage + ';">&#8627;</span>';
		tooltip = mxResources.get('dfDerivedFrom', [system.name + ' · ' + dataset.name + '.' + source.name]);
	}

	return {label: label, tooltip: tooltip};
};

/**
 * Returns the ER marker of one side of a cardinality.
 */
DataFlowModel.getMarker = function(side)
{
	return (side == '1') ? 'ERmandOne' : 'ERmany';
};

/**
 * Returns the style of a relationship edge with the given cardinality.
 */
DataFlowModel.getRelationshipStyle = function(cardinality)
{
	var sides = cardinality.split(':');

	return DataFlow.RELATIONSHIP_STYLE + 'startArrow=' + DataFlowModel.getMarker(sides[0]) +
		';endArrow=' + DataFlowModel.getMarker(sides[1]) + ';';
};

/**
 * Returns the label of a relationship edge: the cardinality, and the action
 * for relationships an Addition created.
 */
DataFlowModel.getRelationshipLabel = function(relationship)
{
	return relationship.cardinality + ((relationship.source == DataFlow.RELATIONSHIP_ADDITION) ?
		' · ' + mxResources.get('dfAction_addition') : '');
};

/**
 * Returns a new cell value of the given type and entity.
 */
DataFlowModel.createValue = function(type, id, label, tooltip)
{
	return DataFlowView.createValue(type, id, label, tooltip);
};

/**
 * Returns a new edge with the given value, style and terminals in the
 * given parent (added with the model, inside the current transaction).
 */
DataFlowModel.addEdge = function(graph, parent, value, style, source, target)
{
	var model = graph.model;
	var edge = new mxCell(value, new mxGeometry(), style);
	edge.edge = true;
	edge.geometry.relative = true;
	model.add(parent, edge);
	model.setTerminal(edge, source, true);
	model.setTerminal(edge, target, false);

	return edge;
};

/**
 * Removes the given cells with their descendants and connected edges.
 * Unlike graph.removeCells this ignores deletable=0, which columns and
 * lineage edges carry so that users cannot delete them.
 */
DataFlowModel.removeCells = function(graph, cells)
{
	var model = graph.model;

	for (var i = 0; i < cells.length; i++)
	{
		if (model.contains(cells[i]))
		{
			var all = model.filterDescendants(function() { return true; }, cells[i]);

			for (var j = 0; j < all.length; j++)
			{
				var edges = model.getEdges(all[j]);

				for (var k = 0; k < edges.length; k++)
				{
					if (model.contains(edges[k]))
					{
						model.remove(edges[k]);
					}
				}
			}

			model.remove(cells[i]);
		}
	}
};

/**
 * Returns the height of a table with the given number of columns.
 */
DataFlowModel.getTableHeight = function(count)
{
	return DataFlow.TABLE_HEADER + count * DataFlow.ATTRIBUTE_HEIGHT;
};

/**
 * Brings the columns of a table in line with its dataset, reusing the cell
 * of every attribute so that relationship edges stay connected.
 */
DataFlowModel.syncColumns = function(graph, catalog, table, dataset)
{
	var model = graph.model;
	var existing = DataFlowCatalog.createMap();
	var children = model.getChildCells(table);

	for (var i = 0; i < children.length; i++)
	{
		existing[DataFlowView.getId(children[i])] = children[i];
	}

	for (var i = 0; i < dataset.attributes.length; i++)
	{
		var id = dataset.attributes[i];
		var value = DataFlowModel.getColumnValue(catalog, id);
		var style = DataFlow.COLUMN_STYLE + 'fillColor=' +
			((i % 2 == 1) ? DataFlow.COLORS.attributeAlt : 'none') + ';';
		var cell = existing[id];

		if (cell == null)
		{
			cell = new mxCell(DataFlowModel.createValue(DataFlowModel.COLUMN, id, value.label, value.tooltip),
				new mxGeometry(0, DataFlow.TABLE_HEADER + i * DataFlow.ATTRIBUTE_HEIGHT,
				DataFlow.TABLE_WIDTH, DataFlow.ATTRIBUTE_HEIGHT), style);
			cell.vertex = true;
		}
		else
		{
			delete existing[id];
			DataFlowView.updateValue(graph, cell, value.label, value.tooltip);

			if (cell.style != style)
			{
				model.setStyle(cell, style);
			}
		}

		if (model.getParent(cell) != table || model.getChildAt(table, i) != cell)
		{
			model.add(table, cell, i);
		}
	}

	var removed = [];

	for (var id in existing)
	{
		removed.push(existing[id]);
	}

	if (removed.length > 0)
	{
		DataFlowModel.removeCells(graph, removed);
	}
};

/**
 * Brings the model layer in line with the catalog: tables (new ones placed
 * next to a related table), columns, relationships and lineage edges.
 * Does nothing until the model layer exists. Must run inside a transaction.
 */
DataFlowModel.sync = function(graph, catalog)
{
	var model = graph.model;
	var layer = DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL);
	var lineageLayer = DataFlowModel.getLayer(graph, DataFlowModel.LINEAGE);

	if (layer == null)
	{
		return;
	}

	// Tables
	var tables = DataFlowCatalog.createMap();
	var removed = [];
	var children = model.getChildCells(layer);

	for (var i = 0; i < children.length; i++)
	{
		var id = DataFlowView.getId(children[i]);

		if (DataFlowView.getType(children[i]) == DataFlowModel.TABLE &&
			catalog.getDataset(id) != null && tables[id] == null)
		{
			tables[id] = children[i];
		}
		else if (DataFlowView.getType(children[i]) == DataFlowModel.TABLE)
		{
			removed.push(children[i]);
		}
	}

	if (removed.length > 0)
	{
		DataFlowModel.removeCells(graph, removed);
	}

	var datasets = catalog.getDatasetIds();
	var added = [];

	for (var i = 0; i < datasets.length; i++)
	{
		var dataset = catalog.getDataset(datasets[i]);
		var table = tables[datasets[i]];
		var label = DataFlowModel.getTableLabel(catalog, dataset);
		var color = DataFlowModel.getSystemColor(catalog, dataset.system);

		if (table == null)
		{
			table = new mxCell(DataFlowModel.createValue(DataFlowModel.TABLE, datasets[i], label),
				new mxGeometry(0, 0, DataFlow.TABLE_WIDTH,
				DataFlowModel.getTableHeight(dataset.attributes.length)),
				DataFlow.TABLE_STYLE + 'fillColor=' + color + ';');
			table.vertex = true;
			model.add(layer, table);
			tables[datasets[i]] = table;
			added.push(datasets[i]);
		}
		else
		{
			DataFlowView.updateValue(graph, table, label);
			DataFlowView.updateStyle(graph, table, {fillColor: color});
		}

		DataFlowModel.syncColumns(graph, catalog, table, dataset);
	}

	for (var i = 0; i < added.length; i++)
	{
		DataFlowModel.placeTable(graph, catalog, tables, added[i], added.slice(i));
	}

	// Columns by attribute ID, for the edges
	var columns = DataFlowCatalog.createMap();

	for (var id in tables)
	{
		var cells = model.getChildCells(tables[id]);

		for (var i = 0; i < cells.length; i++)
		{
			columns[DataFlowView.getId(cells[i])] = cells[i];
		}
	}

	// Relationships
	var edges = DataFlowCatalog.createMap();
	removed = [];
	children = model.getChildCells(layer, false, true);

	for (var i = 0; i < children.length; i++)
	{
		var id = DataFlowView.getId(children[i]);

		if (DataFlowView.getType(children[i]) == DataFlowModel.RELATIONSHIP)
		{
			if (catalog.getRelationship(id) != null && edges[id] == null)
			{
				edges[id] = children[i];
			}
			else
			{
				removed.push(children[i]);
			}
		}
	}

	var relationships = Object.keys(catalog.relationships);

	for (var i = 0; i < relationships.length; i++)
	{
		var rel = catalog.getRelationship(relationships[i]);
		var source = columns[rel.from];
		var target = columns[rel.to];
		var edge = edges[relationships[i]];
		var style = DataFlowModel.getRelationshipStyle(rel.cardinality);
		var label = DataFlowModel.getRelationshipLabel(rel);

		if (source == null || target == null)
		{
			if (edge != null)
			{
				removed.push(edge);
			}
		}
		else if (edge == null)
		{
			DataFlowModel.addEdge(graph, layer, DataFlowModel.createValue(DataFlowModel.RELATIONSHIP,
				relationships[i], label), style, source, target);
		}
		else
		{
			if (model.getTerminal(edge, true) != source)
			{
				model.setTerminal(edge, source, true);
			}

			if (model.getTerminal(edge, false) != target)
			{
				model.setTerminal(edge, target, false);
			}

			if (edge.style != style)
			{
				model.setStyle(edge, style);
			}

			DataFlowView.updateValue(graph, edge, label);
		}
	}

	// Lineage: one edge per pair of datasets with the number of attributes
	var pairs = DataFlowCatalog.createMap();

	for (var id in catalog.attributes)
	{
		var attribute = catalog.attributes[id];

		if (attribute.derivedFrom != null)
		{
			var from = catalog.getAttribute(attribute.derivedFrom).dataset;
			var key = from + '>' + attribute.dataset;

			if (from != attribute.dataset)
			{
				pairs[key] = pairs[key] || {from: from, to: attribute.dataset, count: 0};
				pairs[key].count++;
			}
		}
	}

	children = (lineageLayer != null) ? model.getChildCells(lineageLayer, false, true) : [];

	for (var i = 0; i < children.length; i++)
	{
		var key = (DataFlowView.getType(children[i]) == DataFlowModel.LINEAGE) ?
			children[i].value.getAttribute('dfFrom') + '>' + children[i].value.getAttribute('dfTo') : null;

		if (DataFlowView.getType(children[i]) == DataFlowModel.LINEAGE)
		{
			if (pairs[key] != null && pairs[key].edge == null)
			{
				pairs[key].edge = children[i];
			}
			else
			{
				removed.push(children[i]);
			}
		}
	}

	if (lineageLayer != null)
	{
		for (var key in pairs)
		{
			var pair = pairs[key];
			var label = mxResources.get((pair.count == 1) ? 'dfOneAttribute' : 'dfAttributeCount', [pair.count]);

			if (pair.edge == null)
			{
				var value = DataFlowModel.createValue(DataFlowModel.LINEAGE, '', label);
				value.setAttribute('dfFrom', pair.from);
				value.setAttribute('dfTo', pair.to);
				DataFlowModel.addEdge(graph, lineageLayer, value, DataFlow.LINEAGE_STYLE,
					tables[pair.from], tables[pair.to]);
			}
			else
			{
				DataFlowView.updateValue(graph, pair.edge, label);
			}
		}
	}

	if (removed.length > 0)
	{
		DataFlowModel.removeCells(graph, removed);
	}
};

/**
 * Returns the IDs of the datasets related to the given one by lineage or
 * relationships.
 */
DataFlowModel.getRelatedDatasets = function(catalog, datasetId)
{
	var result = [];

	function add(id)
	{
		if (id != datasetId && mxUtils.indexOf(result, id) < 0)
		{
			result.push(id);
		}
	};

	for (var id in catalog.attributes)
	{
		var attribute = catalog.attributes[id];
		var source = (attribute.derivedFrom != null) ? catalog.getAttribute(attribute.derivedFrom) : null;

		if (source != null && attribute.dataset == datasetId)
		{
			add(source.dataset);
		}
		else if (source != null && source.dataset == datasetId)
		{
			add(attribute.dataset);
		}
	}

	for (var id in catalog.relationships)
	{
		var rel = catalog.relationships[id];
		var from = catalog.getAttribute(rel.from).dataset;
		var to = catalog.getAttribute(rel.to).dataset;

		if (from == datasetId)
		{
			add(to);
		}
		else if (to == datasetId)
		{
			add(from);
		}
	}

	return result;
};

/**
 * Places a new table right of a related table that is already placed,
 * otherwise right of all placed tables, moving it down until it overlaps
 * nothing. Pending lists the new tables not placed yet (including this one).
 */
DataFlowModel.placeTable = function(graph, catalog, tables, datasetId, pending)
{
	var table = tables[datasetId];
	var related = DataFlowModel.getRelatedDatasets(catalog, datasetId);
	var anchor = null;
	var right = null;
	var top = null;

	function isPlaced(id)
	{
		return mxUtils.indexOf(pending, id) < 0;
	};

	for (var id in tables)
	{
		if (isPlaced(id))
		{
			var geo = tables[id].geometry;
			right = (right == null) ? geo.x + geo.width : Math.max(right, geo.x + geo.width);
			top = (top == null) ? geo.y : Math.min(top, geo.y);

			if (anchor == null && mxUtils.indexOf(related, id) >= 0)
			{
				anchor = geo;
			}
		}
	}

	var geo = table.geometry.clone();

	if (anchor != null)
	{
		geo.x = anchor.x + anchor.width + DataFlow.TABLE_GAP_X;
		geo.y = anchor.y;
	}
	else
	{
		geo.x = (right != null) ? right + DataFlow.TABLE_GAP_X : 40;
		geo.y = (top != null) ? top : 40;
	}

	for (var moved = true; moved;)
	{
		moved = false;

		for (var id in tables)
		{
			var other = tables[id].geometry;

			if (isPlaced(id) && mxUtils.intersects(new mxRectangle(geo.x, geo.y, geo.width, geo.height),
				new mxRectangle(other.x - 10, other.y - 10, other.width + 20, other.height + 20)))
			{
				geo.y = other.y + other.height + DataFlow.TABLE_GAP_Y;
				moved = true;
			}
		}
	}

	graph.model.setGeometry(table, geo);
};

/**
 * Lays out all tables in columns by lineage depth (originals first, then
 * the datasets copied from them), grouped by system within a column.
 */
DataFlowModel.arrange = function(graph, catalog)
{
	var model = graph.model;
	var layer = DataFlowModel.getLayer(graph, DataFlow.VIEW_MODEL);

	if (layer == null)
	{
		return;
	}

	var depth = DataFlowCatalog.createMap();

	function getDepth(datasetId, visiting)
	{
		if (depth[datasetId] == null)
		{
			var result = 0;
			visiting = visiting || [];
			visiting.push(datasetId);
			var dataset = catalog.getDataset(datasetId);

			for (var i = 0; i < dataset.attributes.length; i++)
			{
				var src = catalog.getAttribute(dataset.attributes[i]).derivedFrom;
				var srcDataset = (src != null) ? catalog.getAttribute(src).dataset : null;

				if (srcDataset != null && mxUtils.indexOf(visiting, srcDataset) < 0)
				{
					result = Math.max(result, getDepth(srcDataset, visiting) + 1);
				}
			}

			visiting.pop();
			depth[datasetId] = result;
		}

		return depth[datasetId];
	};

	var systems = catalog.getSystemIds();
	var ids = catalog.getDatasetIds().sort(function(a, b)
	{
		var da = getDepth(a), db = getDepth(b);

		if (da != db)
		{
			return da - db;
		}

		return mxUtils.indexOf(systems, catalog.getDataset(a).system) -
			mxUtils.indexOf(systems, catalog.getDataset(b).system);
	});

	var tables = DataFlowCatalog.createMap();
	var children = model.getChildCells(layer);

	for (var i = 0; i < children.length; i++)
	{
		tables[DataFlowView.getId(children[i])] = children[i];
	}

	var y = DataFlowCatalog.createMap();

	for (var i = 0; i < ids.length; i++)
	{
		var table = tables[ids[i]];

		if (table != null)
		{
			var column = getDepth(ids[i]);
			var geo = table.geometry.clone();
			geo.x = 40 + column * (DataFlow.TABLE_WIDTH + DataFlow.TABLE_GAP_X);
			geo.y = (y[column] != null) ? y[column] : 40;
			geo.height = DataFlowModel.getTableHeight(catalog.getDataset(ids[i]).attributes.length);
			y[column] = geo.y + geo.height + DataFlow.TABLE_GAP_Y;
			model.setGeometry(table, geo);
		}
	}
};
