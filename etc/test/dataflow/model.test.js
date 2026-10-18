/**
 * Model view: layers, tables, relationships, lineage, positions, editing
 * (docs/DATAFLOW.md §7, phase 4).
 */
(function()
{
	var test = DataFlowTest.test;

	function closeDialogs(ui)
	{
		while (ui.dialogs != null && ui.dialogs.length > 0)
		{
			ui.hideDialog();
		}
	};

	function attr(c, datasetId, name)
	{
		var ids = c.getDataset(datasetId).attributes;

		for (var i = 0; i < ids.length; i++)
		{
			if (c.getAttribute(ids[i]).name == name)
			{
				return ids[i];
			}
		}

		throw new Error('no attribute ' + name);
	};

	// SAP (Workorders, Assets) -> Filter -> Staging, Staging -> Addition
	// (+ Asset Register) and a manual relationship Workorders -> Assets
	function setup(ui)
	{
		var df = ui.dataFlow;
		var graph = ui.editor.graph;
		var x = {df: df, graph: graph, ui: ui};
		x.catalog = function() { return DataFlowCatalog.read(graph); };
		x.connect = function(s, t, secondary)
		{
			return graph.insertEdge(graph.getDefaultParent(), null, '', s, t, (secondary) ? 'entryX=0.5;entryY=1;' : null);
		};

		x.sap = df.placeSystem({props: {name: 'SAP'}}, 0, 0);
		x.wo = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Workorders', attributes: ['WO_ID', 'Asset_ID', 'Status']}));
		x.assets = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Assets', attributes: ['Asset_ID', 'Plant']}));
		x.staging = df.placeSystem({props: {name: 'Staging'}}, 600, 0);
		x.register = df.placeSystem({props: {name: 'Asset Register'}}, 600, 300);
		x.reg = DataFlowView.getId(df.placeDataset(x.register, {name: 'Register', attributes: ['Asset_No']}));

		x.filter = df.placeAction('filter', 300, 0);
		x.connect(x.sap, x.filter);
		x.connect(x.filter, x.staging);
		var c = x.catalog();
		df.applyFilter(x.filter, {kept: [{dataset: x.wo, attributes: c.getDataset(x.wo).attributes}]});
		x.copy = x.catalog().getAction(DataFlowView.getId(x.filter)).config.copies[x.wo];

		x.add = df.placeAction('addition', 900, 0);
		x.connect(x.staging, x.add);
		x.connect(x.register, x.add, true);
		c = x.catalog();
		df.applyAddition(x.add, {dataset: x.reg, mappings: [{from: attr(c, x.copy, 'Asset_ID'),
			to: attr(c, x.reg, 'Asset_No'), cardinality: 'M:1'}]});
		x.manual = df.addRelationship(attr(c, x.wo, 'Asset_ID'), attr(c, x.assets, 'Asset_ID'), '1:M');

		x.tables = function()
		{
			var result = {};
			DataFlowView.getCells(graph, 'table').forEach(function(t) { result[DataFlowView.getId(t)] = t; });

			return result;
		};

		return x;
	};

	test('model: switching views swaps layers in one undo step', function(t, ui)
	{
		var x = setup(ui);
		var steps = ui.editor.undoManager.history.length;
		x.df.setView('model');

		var flow = DataFlowModel.getLayer(x.graph, 'flow');
		var model = DataFlowModel.getLayer(x.graph, 'model');
		var lineage = DataFlowModel.getLayer(x.graph, 'lineage');
		t.ok(flow != null && model != null && lineage != null, 'three layers');
		t.ok(!flow.visible && model.visible && lineage.visible);
		t.ok(x.graph.isCellLocked(x.sap), 'the hidden flow is locked');
		t.eq(DataFlowModel.getView(x.graph), 'model');
		t.eq(ui.editor.undoManager.history.length, steps + 1);

		x.df.setView('flow');
		t.ok(flow.visible && !model.visible && !lineage.visible);
		t.ok(!x.graph.isCellLocked(x.sap));

		ui.editor.undoManager.undo();
		t.eq(DataFlowModel.getView(x.graph), 'model', 'undo returns to the model view');
	});

	test('model: one table per dataset, coloured by system', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var tables = x.tables();
		var c = x.catalog();

		t.eq(Object.keys(tables).sort(), c.getDatasetIds().sort());
		t.ok(tables[x.wo].style.indexOf('fillColor=' + DataFlow.SYSTEM_PALETTE[0]) >= 0, 'first system');
		t.ok(tables[x.assets].style.indexOf('fillColor=' + DataFlow.SYSTEM_PALETTE[0]) >= 0, 'same system, same colour');
		t.ok(tables[x.copy].style.indexOf('fillColor=' + DataFlow.SYSTEM_PALETTE[1]) >= 0, 'second system');
		t.ok(tables[x.wo].value.getAttribute('label').indexOf('SAP') > 0, 'system name in the header');

		var rows = x.graph.model.getChildCells(tables[x.copy]);
		t.eq(rows.map(function(r) { return DataFlowView.getId(r); }), c.getDataset(x.copy).attributes);
		t.ok(rows[0].value.getAttribute('label').indexOf('&#8627;') > 0, 'derived mark');
		t.eq(rows[0].value.getAttribute('tooltip'), 'Copied from SAP · Workorders.WO_ID');
		t.ok(x.graph.model.getChildCells(tables[x.wo])[0].value.getAttribute('tooltip') == null, 'originals have no mark');
	});

	test('model: relationships with ER markers and lineage per dataset', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var c = x.catalog();
		var rels = DataFlowView.getCells(x.graph, 'relationship');
		t.eq(rels.length, 2);

		var byId = {};
		rels.forEach(function(e) { byId[DataFlowView.getId(e)] = e; });
		var manual = byId[x.manual];
		t.ok(manual.style.indexOf('startArrow=ERmandOne') >= 0 && manual.style.indexOf('endArrow=ERmany') >= 0, '1:M');
		t.eq(manual.value.getAttribute('label'), '1:M');
		t.eq(DataFlowView.getId(x.graph.model.getTerminal(manual, true)), attr(c, x.wo, 'Asset_ID'), 'row to row');

		var added = byId[c.getRelationshipIds(null, DataFlowView.getId(x.add))[0]];
		t.ok(added.style.indexOf('startArrow=ERmany') >= 0 && added.style.indexOf('endArrow=ERmandOne') >= 0, 'M:1');
		t.eq(added.value.getAttribute('label'), 'M:1 · Addition');

		var lineage = DataFlowView.getCells(x.graph, 'lineage');
		t.eq(lineage.length, 1, 'one edge for the dataset pair');
		t.eq(lineage[0].value.getAttribute('label'), '3 attributes');
		t.ok(x.graph.model.getTerminal(lineage[0], true) == x.tables()[x.wo]);
	});

	test('model: Show lineage hides the lineage layer', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		x.df.setLineageShown(false);
		t.ok(!DataFlowModel.getLayer(x.graph, 'lineage').visible);
		t.ok(!DataFlowModel.isLineageShown(x.graph));

		x.df.setView('flow');
		x.df.setView('model');
		t.ok(!DataFlowModel.getLayer(x.graph, 'lineage').visible, 'remembered');
		x.df.setLineageShown(true);
		t.ok(DataFlowModel.getLayer(x.graph, 'lineage').visible);
	});

	test('model: the first layout puts copies right of their sources', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var tables = x.tables();
		var geo = function(id) { return tables[id].geometry; };

		t.eq(geo(x.wo).x, 40);
		t.eq(geo(x.assets).x, 40);
		t.ok(geo(x.assets).y >= geo(x.wo).y + geo(x.wo).height, 'stacked');
		t.eq(geo(x.copy).x, 40 + DataFlow.TABLE_WIDTH + DataFlow.TABLE_GAP_X, 'one column right');
	});

	test('model: positions are kept, new tables are placed, deleted ones go', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var table = x.tables()[x.assets];
		x.graph.moveCells([table], 500, 300);
		var moved = table.geometry.clone();

		x.df.setView('flow');
		var orders = DataFlowView.getId(x.df.placeDataset(x.sap, {name: 'Orders', attributes: ['Order_ID']}));
		x.df.setView('model');

		t.eq(x.tables()[x.assets].geometry.x, moved.x, 'moved table stays');
		var placed = x.tables()[orders];
		t.ok(placed != null, 'table for the new dataset');
		var overlaps = DataFlowView.getCells(x.graph, 'table').some(function(other)
		{
			return other != placed && mxUtils.intersects(new mxRectangle(placed.geometry.x, placed.geometry.y,
				placed.geometry.width, placed.geometry.height), other.geometry);
		});
		t.ok(!overlaps, 'placed without overlap');

		x.df.deleteEntity('dataset', orders);
		t.ok(x.tables()[orders] == null, 'deleted dataset, deleted table');

		x.df.arrangeModel();
		t.eq(x.tables()[x.assets].geometry.x, 40, 'Re-arrange lays out again');
	});

	test('model: attribute changes keep rows and their relationships', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var c = x.catalog();
		var row = x.graph.model.getChildCells(x.tables()[x.wo])[1];
		var ids = c.getDataset(x.wo).attributes;

		x.df.editDataset(x.wo, 'Work Orders', [{id: ids[1], name: 'Asset'}, {id: ids[0], name: 'WO_ID'}]);

		var rows = x.graph.model.getChildCells(x.tables()[x.wo]);
		t.ok(rows[0] === row, 'same row cell, moved to the top');
		t.eq(rows[0].value.getAttribute('label'), 'Asset');
		t.eq(rows.length, 2);
		var rel = DataFlowView.getCells(x.graph, 'relationship', x.manual)[0];
		t.ok(x.graph.model.getTerminal(rel, true) === row, 'relationship still attached');
		t.ok(x.tables()[x.wo].value.getAttribute('label').indexOf('Work Orders') >= 0);
	});

	test('model: drawing between two rows adds a relationship', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var a = x.graph.model.getChildCells(x.tables()[x.assets])[1];
		var b = x.graph.model.getChildCells(x.tables()[x.reg])[0];
		var before = Object.keys(x.catalog().relationships).length;

		t.ok(x.graph.getEdgeValidationError(null, a, b) == null);
		t.ok(x.graph.getEdgeValidationError(null, a, x.tables()[x.reg]) != null, 'row to table refused');
		t.ok(x.graph.getEdgeValidationError(null, a, a) != null, 'row to itself refused');

		t.ok(x.graph.connectionHandler.connect(a, b, null, null) == null, 'no plain edge');

		return DataFlowTest.wait(20).then(function()
		{
			var dlg = ui.dialog.container;
			t.eq(dlg.querySelector('h3').textContent, 'Add Relationship');
			t.ok(dlg.textContent.indexOf('From Assets.Plant to Register.Asset_No') >= 0);
			dlg.querySelector('select').value = 'M:M';
			dlg.querySelector('.gePrimaryBtn').click();

			var c = x.catalog();
			t.eq(Object.keys(c.relationships).length, before + 1);
			var rel = DataFlowView.getCells(x.graph, 'relationship').filter(function(e)
			{
				return x.graph.model.getTerminal(e, true) == a;
			})[0];
			t.ok(rel != null && rel.style.indexOf('startArrow=ERmany') >= 0 && rel.style.indexOf('endArrow=ERmany') >= 0);
			t.eq(c.getRelationship(DataFlowView.getId(rel)).source, 'manual');
			closeDialogs(ui);
		});
	});

	test('model: double-clicking a relationship changes its cardinality', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var rel = DataFlowView.getCells(x.graph, 'relationship', x.manual)[0];

		x.graph.dblClick(new MouseEvent('dblclick'), rel);
		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('h3').textContent, 'Change Cardinality');
		t.eq(dlg.querySelector('select').value, '1:M');
		dlg.querySelector('select').value = '1:1';
		dlg.querySelector('.gePrimaryBtn').click();

		t.eq(x.catalog().getRelationship(x.manual).cardinality, '1:1');
		t.ok(rel.style.indexOf('endArrow=ERmandOne') >= 0);
		closeDialogs(ui);
	});

	test('model: deleting a relationship edge removes it and flags its Addition', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var c = x.catalog();
		var relId = c.getRelationshipIds(null, DataFlowView.getId(x.add))[0];

		x.graph.deleteCells([DataFlowView.getCells(x.graph, 'relationship', relId)[0]]);
		c = x.catalog();
		t.ok(c.getRelationship(relId) == null);
		t.ok(c.needsAttention(DataFlowView.getId(x.add)), 'Addition needs attention');
		t.ok(x.add.value.getAttribute('label').indexOf('!') > 0);
	});

	test('model: deleting a table asks, then deletes the dataset everywhere', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var table = x.tables()[x.assets];

		x.graph.deleteCells([table]);
		t.ok(ui.dialog.container.textContent.indexOf('Delete 1 dataset(s) everywhere') >= 0);
		t.ok(x.catalog().getDataset(x.assets) != null, 'not yet');
		ui.dialog.container.querySelector('.gePrimaryBtn').click();

		t.ok(x.catalog().getDataset(x.assets) == null);
		t.eq(DataFlowView.getCells(x.graph, 'dataset', x.assets).length, 0, 'flow shape gone too');
		t.ok(x.catalog().getRelationship(x.manual) == null, 'its relationship too');
		closeDialogs(ui);
	});

	test('model: rows and tables cannot be dragged around or into', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var table = x.tables()[x.wo];
		var row = x.graph.model.getChildCells(table)[0];

		t.ok(!x.graph.isCellMovable(row));
		t.ok(!x.graph.isCellDeletable(row));
		t.ok(!x.graph.isValidDropTarget(table, [x.tables()[x.assets]]));
		t.ok(!x.graph.isCellDisconnectable(DataFlowView.getCells(x.graph, 'relationship', x.manual)[0], row, true));
	});

	test('model: double-clicking a table edits its dataset', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		x.graph.dblClick(new MouseEvent('dblclick'), x.graph.model.getChildCells(x.tables()[x.wo])[0]);

		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('h3').textContent, 'Edit Dataset');
		t.ok(dlg.textContent.indexOf('In SAP') >= 0);
		closeDialogs(ui);
	});

	test('model: the palette asks to switch back to the flow view', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var before = DataFlowView.getCells(x.graph, 'action').length;
		x.df.templateDropped('export', null, 100, 100, true);

		t.ok(ui.dialog.container.textContent.indexOf('Switch to the Flow view') >= 0);
		t.eq(DataFlowView.getCells(x.graph, 'action').length, before);
		closeDialogs(ui);
	});

	test('model: the view switch appears with a data flow and switches views', function(t, ui)
	{
		var bar = ui.dataFlow.viewBar;
		t.ok(bar != null && bar.style.display == 'none', 'hidden without a data flow');

		var x = setup(ui);
		t.ok(bar.style.display == '', 'shown');
		t.eq(ui.dataFlow.flowButton.getAttribute('aria-pressed'), 'true');
		t.ok(ui.dataFlow.arrangeButton.style.display == 'none', 'Re-arrange only in the model view');

		ui.dataFlow.modelButton.click();
		t.eq(DataFlowModel.getView(x.graph), 'model');
		t.eq(ui.dataFlow.modelButton.getAttribute('aria-pressed'), 'true');
		t.ok(ui.dataFlow.arrangeButton.style.display == '');

		ui.dataFlow.lineageBox.click();
		t.ok(!DataFlowModel.getLayer(x.graph, 'lineage').visible);

		var labels = [];
		x.graph.clearSelection();
		ui.dataFlow.addPopupMenuItems({addSeparator: function() {}, addItem: function(l) { labels.push(l); }}, null);
		t.eq(labels, ['Show Flow View']);
	});

	test('model: the view and the model survive save and load', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		x.graph.moveCells([x.tables()[x.assets]], 300, 0);
		var pos = x.tables()[x.assets].geometry.x;
		var data = ui.getFileData(true, null, null, null, null, null, null, null, null, true);

		ui.fileLoaded(new LocalFile(ui, data, 'model.drawio', true), true);
		var graph = ui.editor.graph;
		t.eq(DataFlowModel.getView(graph), 'model');
		var table = DataFlowView.getCells(graph, 'table', x.assets)[0];
		t.eq(table.geometry.x, pos);
		t.eq(DataFlowView.getCells(graph, 'relationship').length, 2);
		t.ok(ui.dataFlow.viewBar.style.display == '' &&
			ui.dataFlow.modelButton.getAttribute('aria-pressed') == 'true', 'switch reflects the loaded view');
	});
})();
