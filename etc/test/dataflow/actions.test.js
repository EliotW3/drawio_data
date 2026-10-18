/**
 * Actions, connection rules and streams (docs/DATAFLOW.md §5.4, §6, phase 3).
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

	function names(c, ids)
	{
		return ids.map(function(id) { return c.getAttribute(id).name; });
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

	// SAP (Workorders, Assets), Staging (empty), CRM (Workorders, Accounts),
	// Asset Register (Asset Register) and Warehouse (empty)
	function setup(ui)
	{
		var df = ui.dataFlow;
		var graph = ui.editor.graph;
		var x = {df: df, graph: graph, ui: ui};
		x.sap = df.placeSystem({props: {name: 'SAP', environment: 'SAP'}}, 0, 0);
		x.wo = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Workorders',
			attributes: ['WO_ID', 'Asset_ID', 'Status', 'Priority']}));
		x.assets = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Assets', attributes: ['Asset_ID', 'Plant']}));
		x.staging = df.placeSystem({props: {name: 'Staging'}}, 600, 0);
		x.crm = df.placeSystem({props: {name: 'CRM'}}, 300, 300);
		x.crmWo = DataFlowView.getId(df.placeDataset(x.crm, {name: 'workorders', attributes: ['wo_id', 'State']}));
		df.placeDataset(x.crm, {name: 'Accounts', attributes: ['Account_ID']});
		x.register = df.placeSystem({props: {name: 'Asset Register', environment: 'Excel'}}, 600, 300);
		x.reg = DataFlowView.getId(df.placeDataset(x.register, {name: 'Asset Register', attributes: ['Asset_No', 'Location']}));
		x.warehouse = df.placeSystem({props: {name: 'Warehouse'}}, 900, 0);
		x.connect = function(source, target, secondary)
		{
			return graph.insertEdge(graph.getDefaultParent(), null, '', source, target,
				(secondary) ? 'entryX=0.5;entryY=1;' : null);
		};
		x.catalog = function() { return DataFlowCatalog.read(graph); };

		return x;
	};

	test('actions: the palette offers the four actions', function(t, ui)
	{
		var content = ui.sidebar.palettes['dataflow'][1];
		var tries = 0;

		// Palette contents are created lazily, so this waits for them
		function check()
		{
			var items = content.querySelectorAll('a.geItem');

			if (items.length < 6 && tries++ < 40)
			{
				return DataFlowTest.wait(50).then(check);
			}

			t.eq(items.length, 6, 'system, dataset and four actions');
		};

		return check();
	});

	test('actions: a placed action needs setup and says what is missing', function(t, ui)
	{
		ui.dataFlow.templateDropped('validation', null, 200, 200, true);
		var cell = ui.editor.graph.getSelectionCell();
		var c = DataFlowCatalog.read(ui.editor.graph);

		t.eq(DataFlowView.getType(cell), 'action');
		t.eq(c.getAction(DataFlowView.getId(cell)).type, 'validation');
		t.ok(cell.style.indexOf('dashed=1') >= 0 && cell.style.indexOf('fillColor=#FFFFFF') >= 0, 'outline');
		t.eq(cell.value.getAttribute('tooltip'), 'Connect an input on the left.\nConnect the reference system at the bottom.');
		t.ok(cell.value.getAttribute('label').indexOf('V1') > 0, 'numbered');
	});

	test('actions: connection rules', function(t, ui)
	{
		var x = setup(ui);
		var g = x.graph;
		var exp = x.df.placeAction('export', 300, 0);
		var val = x.df.placeAction('validation', 300, 150);
		var add = x.df.placeAction('addition', 450, 150);
		var row = g.model.getChildCells(g.model.getChildCells(x.sap)[0])[0];

		function err(s, tgt) { return g.getEdgeValidationError(null, s, tgt); }

		t.ok(err(x.sap, x.staging).indexOf('through an action') > 0, 'system to system');
		t.ok(err(x.sap, exp) == null, 'system to export');
		t.ok(err(g.model.getChildCells(x.sap)[0], exp).indexOf('not to a dataset') > 0, 'dataset');
		t.ok(err(row, exp) != null, 'attribute row');
		t.ok(err(val, x.staging).indexOf('not to a system') > 0, 'validation to system');
		t.ok(err(exp, val).indexOf('not to another action') > 0, 'export to action');

		x.connect(x.sap, exp);
		t.ok(err(x.crm, exp).indexOf('already has an input') >= 0, 'one input');
		x.connect(exp, x.warehouse);
		t.ok(err(exp, x.staging).indexOf('exactly one system') > 0, 'one output');

		x.connect(x.sap, val);
		t.ok(err(x.crm, val) == null, 'second input free');
		x.connect(x.crm, val, true);
		t.ok(err(x.register, val).indexOf('both inputs') > 0, 'both taken');

		x.connect(val, add);
		t.ok(err(add, val).indexOf('loop') > 0, 'loop');
		t.ok(g.getEdgeValidationError(null, g.insertVertex(g.getDefaultParent(), null, 'Note', 0, 500, 60, 30), x.sap) == null,
			'ordinary shapes are not restricted');
	});

	test('actions: edges get their role and style', function(t, ui)
	{
		var x = setup(ui);
		var val = x.df.placeAction('validation', 300, 150);
		var e1 = x.connect(x.sap, val);
		var e2 = x.connect(x.crm, val);
		var bad = x.connect(x.sap, x.staging);

		t.eq(DataFlowStreams.getRole(e1), 'primary');
		t.eq(DataFlowStreams.getRole(e2), 'secondary', 'second system becomes the second input');
		t.ok(e2.style.indexOf('dashed=1') >= 0 && e2.style.indexOf('entryY=1') >= 0);
		t.eq(DataFlowStreams.getRole(bad), 'invalid');
		t.ok(bad.style.indexOf('#DC2626') >= 0);
		t.ok(bad.value.getAttribute('tooltip').indexOf('through an action') > 0);
		t.ok(val.value.getAttribute('tooltip').indexOf('Double-click') >= 0, 'connected, not configured');
	});

	test('actions: export creates a dataset with lineage in the target system', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		x.connect(exp, x.warehouse);
		var c = x.catalog();
		var steps = ui.editor.undoManager.history.length;

		x.df.applyExport(exp, {name: 'WO Extract', attributes: [attr(c, x.wo, 'WO_ID'), attr(c, x.wo, 'Asset_ID'),
			attr(c, x.assets, 'Asset_ID'), attr(c, x.assets, 'Plant')]});

		c = x.catalog();
		var action = c.getAction(DataFlowView.getId(exp));
		var out = c.getDataset(action.config.dataset);
		t.eq(out.name, 'WO Extract');
		t.eq(out.system, DataFlowView.getId(x.warehouse));
		t.eq(out.origin, {action: DataFlowView.getId(exp)});
		t.eq(names(c, out.attributes), ['WO_ID', 'Asset_ID', 'Asset_ID (Assets)', 'Plant'], 'names made unique');
		t.eq(c.getAttribute(out.attributes[2]).derivedFrom, attr(c, x.assets, 'Asset_ID'));
		t.eq(DataFlowView.getDatasetIds(x.graph, x.warehouse), [action.config.dataset], 'shown in Warehouse');
		t.ok(exp.style.indexOf('fillColor=#2563EB') >= 0, 'filled once configured');
		t.eq(ui.editor.undoManager.history.length, steps + 1);

		// Reapplying keeps the attributes that are still selected
		var keep = out.attributes[0];
		x.df.applyExport(exp, {name: 'WO Extract', attributes: [attr(c, x.wo, 'WO_ID'), attr(c, x.wo, 'Status')]});
		c = x.catalog();
		t.eq(c.getDataset(action.config.dataset).attributes[0], keep);
		t.eq(names(c, c.getDataset(action.config.dataset).attributes), ['WO_ID', 'Status']);

		ui.editor.undoManager.undo();
		ui.editor.undoManager.undo();
		t.ok(x.catalog().getDataset(action.config.dataset) == null, 'undo removes the output');
		t.eq(DataFlowView.getDatasetIds(x.graph, x.warehouse), []);
	});

	test('actions: export dialog', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		x.connect(exp, x.warehouse);
		x.df.configureAction(exp);

		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('h3').textContent, 'Configure Export');
		var boxes = dlg.querySelectorAll('.geDataFlowTree input');
		t.eq(boxes.length, 2 + 4 + 2, 'two datasets and their attributes');
		t.ok([].every.call(boxes, function(b) { return !b.checked; }), 'nothing preselected for two datasets');

		dlg.querySelector('.gePrimaryBtn').click();
		t.ok(ui.dialog.container.textContent.indexOf('Enter a name') >= 0);
		ui.hideDialog();

		dlg.querySelector('input[type="text"]').value = 'Open orders';
		boxes[0].click();
		t.ok(boxes[1].checked && boxes[4].checked, 'dataset box selects its attributes');
		boxes[4].click();
		t.ok(boxes[0].indeterminate, 'partial');
		dlg.querySelector('.gePrimaryBtn').click();

		var c = x.catalog();
		var out = c.getDataset(c.getAction(DataFlowView.getId(exp)).config.dataset);
		t.eq(names(c, out.attributes), ['WO_ID', 'Asset_ID', 'Status']);
		closeDialogs(ui);
	});

	test('actions: filter copies what is kept and records what is dropped', function(t, ui)
	{
		var x = setup(ui);
		var filter = x.df.placeAction('filter', 300, 0);
		x.connect(x.sap, filter);
		x.connect(filter, x.staging);
		var c = x.catalog();
		var id = DataFlowView.getId(filter);

		x.df.applyFilter(filter, {kept: [{dataset: x.wo, attributes: [attr(c, x.wo, 'WO_ID'), attr(c, x.wo, 'Status')]}]});
		c = x.catalog();
		var config = c.getAction(id).config;
		var copy = c.getDataset(config.copies[x.wo]);
		t.eq(copy.name, 'Workorders', 'same name (D22)');
		t.eq(names(c, copy.attributes), ['WO_ID', 'Status']);
		t.eq(config.dropped.datasets, [x.assets]);
		t.eq(config.dropped.attributes, [attr(c, x.wo, 'Asset_ID'), attr(c, x.wo, 'Priority')]);
		t.eq(DataFlowView.getDatasetIds(x.graph, x.staging), [config.copies[x.wo]]);

		// Dialog shows the saved state
		x.df.configureAction(filter);
		var boxes = ui.dialog.container.querySelectorAll('.geDataFlowTree input');
		t.eq([].map.call(boxes, function(b) { return b.checked; }), [true, true, false, true, false, false, false, false]);
		closeDialogs(ui);

		// Keeping only Assets deletes the Workorders copy
		var oldCopy = config.copies[x.wo];
		x.df.applyFilter(filter, {kept: [{dataset: x.assets, attributes: c.getDataset(x.assets).attributes}]});
		c = x.catalog();
		t.ok(c.getDataset(oldCopy) == null);
		t.eq(DataFlowView.getDatasetIds(x.graph, x.staging), [c.getAction(id).config.copies[x.assets]]);
	});

	test('actions: validation pairs datasets and highlights them', function(t, ui)
	{
		var x = setup(ui);
		var val = x.df.placeAction('validation', 300, 150);
		x.connect(x.sap, val);
		x.connect(x.crm, val, true);
		x.df.configureAction(val);

		var dlg = ui.dialog.container;
		var selects = dlg.querySelectorAll('.geDialogFormRow select');
		t.eq(selects.length, 2, 'one per incoming dataset');
		t.eq(selects[0].value, x.crmWo, 'suggested by name, ignoring case');
		t.eq(selects[1].value, '');
		var maps = dlg.querySelectorAll('.geDataFlowMapRow select');
		t.eq(maps.length, 4, 'one row per Workorders attribute');
		t.eq(maps[0].selectedOptions[0].textContent, 'wo_id', 'attribute suggested by name');
		dlg.querySelector('.gePrimaryBtn').click();

		var c = x.catalog();
		var config = c.getAction(DataFlowView.getId(val)).config;
		t.eq(config.pairs, [{primary: x.wo, reference: x.crmWo,
			attributes: [[attr(c, x.wo, 'WO_ID'), attr(c, x.crmWo, 'wo_id')]]}]);

		var shapes = DataFlowView.getCells(x.graph, 'dataset', x.wo).concat(DataFlowView.getCells(x.graph, 'dataset', x.crmWo));
		t.ok(shapes.every(function(s)
		{
			return s.value.getAttribute('label').indexOf('V1') > 0 && s.style.indexOf('strokeColor=' + config.color) >= 0;
		}), 'compared datasets highlighted');
		t.ok(val.style.indexOf('fillColor=#059669') >= 0);

		// Selecting it dims the rest
		x.graph.setSelectionCell(val);
		var assets = x.graph.view.getState(DataFlowView.getCells(x.graph, 'dataset', x.assets)[0]);
		var wo = x.graph.view.getState(shapes[0]);
		t.eq(assets.shape.node.style.opacity, '0.18');
		t.eq(wo.shape.node.style.opacity, '');
		x.graph.clearSelection();
		t.eq(assets.shape.node.style.opacity, '');
	});

	test('actions: addition relates attributes and extends the stream', function(t, ui)
	{
		var x = setup(ui);
		var add = x.df.placeAction('addition', 300, 150);
		var exp = x.df.placeAction('export', 500, 150);
		x.connect(x.sap, add);
		x.connect(x.register, add, true);
		x.connect(add, exp);
		x.connect(exp, x.warehouse);
		var c = x.catalog();

		x.df.configureAction(add);
		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('select').value, x.reg);
		var maps = dlg.querySelectorAll('.geDataFlowMapRow');
		t.eq(maps.length, 6, 'one row per incoming attribute');
		maps[1].querySelectorAll('select')[0].value = attr(c, x.reg, 'Asset_No');
		maps[1].querySelectorAll('select')[1].value = 'N:1';
		dlg.querySelector('.gePrimaryBtn').click();

		c = x.catalog();
		var rels = c.getRelationshipIds(null, DataFlowView.getId(add));
		t.eq(rels.length, 1);
		t.eq(c.getRelationship(rels[0]), {from: attr(c, x.wo, 'Asset_ID'), to: attr(c, x.reg, 'Asset_No'),
			cardinality: 'N:1', source: 'addition', action: DataFlowView.getId(add)});

		var stream = DataFlowStreams.getInputStream(x.graph, c, exp);
		t.eq(stream.map(function(e) { return e.dataset; }), [x.wo, x.assets, x.reg], 'export sees the added dataset');
		closeDialogs(ui);
	});

	test('actions: upstream changes mark actions as needing attention', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		x.connect(exp, x.warehouse);
		var c = x.catalog();
		x.df.applyExport(exp, {name: 'Extract', attributes: [attr(c, x.wo, 'WO_ID'), attr(c, x.wo, 'Status')]});
		t.ok(exp.value.getAttribute('label').indexOf('!') < 0);

		// Status leaves Workorders: the copy keeps it, without lineage, and
		// the export no longer matches its input via the catalog flag
		var ids = c.getDataset(x.wo).attributes;
		x.df.editDataset(x.wo, 'Workorders', [{id: ids[0], name: 'WO_ID'}]);

		t.ok(exp.value.getAttribute('label').indexOf('!') > 0, 'badge');
		t.ok(exp.style.indexOf('strokeColor=' + DataFlow.COLORS.attention) >= 0);

		// Moving the Workorders shape out of the input also shows up
		var val = x.df.placeAction('validation', 300, 150);
		x.connect(x.sap, val);
		x.connect(x.crm, val, true);
		x.df.applyValidation(val, {pairs: [{primary: x.assets, reference: x.crmWo, attributes: []}]});
		t.ok(val.value.getAttribute('label').indexOf('!') < 0);
		x.graph.removeCells([DataFlowView.getCells(x.graph, 'dataset', x.crmWo)[0]]);
		t.ok(val.value.getAttribute('tooltip').indexOf('deleted') >= 0, val.value.getAttribute('tooltip'));
	});

	test('actions: deleting a dataset that actions use asks first', function(t, ui)
	{
		var x = setup(ui);
		var val = x.df.placeAction('validation', 300, 150);
		x.connect(x.sap, val);
		x.connect(x.crm, val, true);
		x.df.applyValidation(val, {pairs: [{primary: x.wo, reference: x.crmWo, attributes: []}]});
		var shape = DataFlowView.getCells(x.graph, 'dataset', x.crmWo)[0];

		x.graph.deleteCells([shape]);
		t.ok(ui.dialog != null && ui.dialog.container.textContent.indexOf('changes 1 action') >= 0, 'asked');
		t.ok(x.graph.model.contains(shape), 'not yet deleted');
		ui.dialog.container.querySelector('.gePrimaryBtn').click();
		t.ok(!x.graph.model.contains(shape) && x.catalog().getDataset(x.crmWo) == null, 'deleted after confirming');

		// A plain shape without consequences is deleted at once
		var other = x.df.placeSystem({id: DataFlowView.getId(x.sap), includeDatasets: true}, 0, 600);
		x.graph.deleteCells([other]);
		t.ok(!x.graph.model.contains(other));
		closeDialogs(ui);
	});

	test('actions: deleting an action keeps its output, copying gives a new action', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		x.connect(exp, x.warehouse);
		var c = x.catalog();
		x.df.applyExport(exp, {name: 'Extract', attributes: [attr(c, x.wo, 'WO_ID')]});
		var out = x.catalog().getAction(DataFlowView.getId(exp)).config.dataset;

		var copy = x.graph.moveCells([exp], 0, 100, true)[0];
		t.ok(DataFlowView.getId(copy) != DataFlowView.getId(exp), 'new action');
		t.ok(x.catalog().getAction(DataFlowView.getId(copy)) != null);
		t.ok(!DataFlowStreams.isConfigured(x.catalog(), DataFlowView.getId(copy)), 'starts unconfigured');

		x.graph.removeCells([exp]);
		c = x.catalog();
		t.ok(c.getAction(DataFlowView.getId(exp)) == null);
		t.ok(c.getDataset(out) != null && c.getDataset(out).origin == null, 'output kept, origin cleared');
	});

	test('actions: rewiring the output to another system is flagged', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		var out = x.connect(exp, x.warehouse);
		var c = x.catalog();
		x.df.applyExport(exp, {name: 'Extract', attributes: [attr(c, x.wo, 'WO_ID')]});

		x.graph.connectCell(out, x.staging, false);
		t.ok(exp.value.getAttribute('tooltip').indexOf('another system') > 0, exp.value.getAttribute('tooltip'));
	});

	test('actions: connecting the last input opens the dialog', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		var edge = x.connect(exp, x.warehouse);
		x.graph.connectionHandler.fireEvent(new mxEventObject(mxEvent.CONNECT, 'cell', edge));

		return DataFlowTest.wait(50).then(function()
		{
			t.ok(ui.dialog != null && ui.dialog.container.querySelector('h3').textContent == 'Configure Export');
			closeDialogs(ui);
		});
	});

	test('actions: configuring an unconnected action explains what is missing', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.df.configureAction(exp);
		t.ok(ui.dialog.container.textContent.indexOf('Connect the target system on the right') >= 0);
		closeDialogs(ui);
	});

	test('actions: flows survive save and load', function(t, ui)
	{
		var x = setup(ui);
		var exp = x.df.placeAction('export', 300, 0);
		x.connect(x.sap, exp);
		x.connect(exp, x.warehouse);
		var c = x.catalog();
		x.df.applyExport(exp, {name: 'Extract', attributes: [attr(c, x.wo, 'WO_ID')]});
		var data = ui.getFileData(true, null, null, null, null, null, null, null, null, true);

		ui.fileLoaded(new LocalFile(ui, data, 'flow.drawio', true), true);
		var graph = ui.editor.graph;
		var action = DataFlowView.getCells(graph, 'action')[0];
		t.eq(DataFlowStreams.getMissingConnections(graph, action), []);
		t.ok(!DataFlowStreams.getActionState(graph, DataFlowCatalog.read(graph), action).setup);
		t.eq(graph.model.getEdges(action).map(DataFlowStreams.getRole).sort(), ['output', 'primary']);
	});
})();
