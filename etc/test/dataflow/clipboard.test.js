/**
 * Copy, cut and paste of data flow shapes within a page, across pages and
 * files, and from untrusted clipboard data (docs/DATAFLOW.md §11, phase 5).
 */
(function()
{
	var test = DataFlowTest.test;

	// SAP (Workorders, Assets) -> Export -> Warehouse
	function setup(ui)
	{
		var df = ui.dataFlow;
		var graph = ui.editor.graph;
		var x = {df: df, graph: graph};
		x.catalog = function() { return DataFlowCatalog.read(ui.editor.graph); };
		x.sap = df.placeSystem({props: {name: 'SAP', owner: 'Finance', environment: 'SAP'}}, 0, 0);
		x.wo = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Workorders', attributes: ['WO_ID', 'Status']}));
		x.assets = DataFlowView.getId(df.placeDataset(x.sap, {name: 'Assets', attributes: ['Asset_ID']}));
		x.warehouse = df.placeSystem({props: {name: 'Warehouse'}}, 600, 0);
		x.exp = df.placeAction('export', 300, 0);
		graph.insertEdge(graph.getDefaultParent(), null, '', x.sap, x.exp);
		graph.insertEdge(graph.getDefaultParent(), null, '', x.exp, x.warehouse);
		df.applyExport(x.exp, {name: 'Extract', attributes: x.catalog().getDataset(x.wo).attributes.slice()});

		return x;
	};

	// Copies like Edit > Copy (encoded XML) and pastes like Edit > Paste
	function copy(graph, cells)
	{
		return mxUtils.getXml(graph.encodeCells(cells));
	};

	function paste(ui, xml)
	{
		return ui.importXml(xml, 20, 20);
	};

	test('clipboard: copied cells carry their entities', function(t, ui)
	{
		var x = setup(ui);
		var xml = copy(x.graph, [x.sap]);
		var doc = mxUtils.parseXml(xml);
		var elts = [].filter.call(doc.getElementsByTagName('*'), function(e) { return e.getAttribute('dfType') == 'dataset'; });

		t.eq(elts.length, 2);
		var data = JSON.parse(elts[0].getAttribute('dfData'));
		t.eq(Object.keys(data.datasets), [x.wo]);
		t.eq(Object.keys(data.attributes).length, 2, 'with its attributes');
		t.eq(Object.keys(data.systems), [DataFlowView.getId(x.sap)], 'and its system');
		t.ok(x.sap.value.getAttribute('dfData') == null, 'the shapes themselves are unchanged');
	});

	test('clipboard: paste on the same page adds another shape of the same system', function(t, ui)
	{
		var x = setup(ui);
		var before = x.catalog().stringify();
		var cells = paste(ui, copy(x.graph, [x.sap]));

		t.eq(cells.length, 1);
		t.eq(DataFlowView.getId(cells[0]), DataFlowView.getId(x.sap));
		t.eq(DataFlowView.getCells(x.graph, 'system', DataFlowView.getId(x.sap)).length, 2);
		t.eq(x.catalog().stringify(), before, 'catalog unchanged');
		t.ok(cells[0].value.getAttribute('dfData') == null, 'dfData is not kept');
	});

	test('clipboard: cut and paste restores the entities with their IDs', function(t, ui)
	{
		var x = setup(ui);
		var c = x.catalog();
		var attrs = c.getDataset(x.wo).attributes.slice();
		var out = c.getAction(DataFlowView.getId(x.exp)).config.dataset;
		var xml = copy(x.graph, [x.sap]);
		x.graph.removeCells([x.sap], false);

		t.ok(x.catalog().getDataset(x.wo) == null, 'cut removed it');

		paste(ui, xml);
		c = x.catalog();
		t.eq(c.getDataset(x.wo).attributes, attrs, 'same attribute IDs');
		t.eq(c.getSystem(DataFlowView.getId(x.sap)).owner, 'Finance');
		t.eq(c.getAttribute(c.getDataset(out).attributes[0]).derivedFrom, null,
			'lineage cleared by the cut stays cleared');
		t.eq(DataFlowView.getCells(x.graph, 'dataset', x.wo).length, 1);
	});

	test('clipboard: paste into another page imports the entities', function(t, ui)
	{
		var x = setup(ui);
		var xml = copy(x.graph, [x.sap, x.exp, x.warehouse].concat(x.graph.model.getEdges(x.exp)));
		var first = ui.currentPage;
		var page = ui.insertPage();
		ui.selectPage(page);

		paste(ui, xml);
		var graph = ui.editor.graph;
		var c = DataFlowCatalog.read(graph);
		t.eq(c.getSystemIds().length, 2);
		t.eq(c.getDataset(x.wo).name, 'Workorders');
		t.eq(c.getDatasetIds(DataFlowView.getId(x.sap)).length, 2);

		var action = DataFlowView.getCells(graph, 'action')[0];
		t.ok(DataFlowStreams.getMissingConnections(graph, action).length == 0, 'edges came along');
		t.ok(c.getAction(DataFlowView.getId(action)) != null);

		ui.selectPage(first);
		t.eq(DataFlowCatalog.read(ui.editor.graph).getSystemIds().length, 2, 'source page unchanged');
	});

	test('clipboard: paste into another file', function(t, ui)
	{
		var x = setup(ui);
		var xml = copy(x.graph, [x.exp]);
		DataFlowTest.newFile(ui);

		var cells = paste(ui, xml);
		var c = DataFlowCatalog.read(ui.editor.graph);
		var action = c.getAction(DataFlowView.getId(cells[0]));
		t.ok(action != null && action.type == 'export');
		t.ok(action.config.dataset == null, 'its output did not come along, so it is unconfigured');
		t.ok(cells[0].style.indexOf('dashed=1') >= 0, 'needs setup');
	});

	test('clipboard: a dataset pasted on its own goes into a shape of its system', function(t, ui)
	{
		var x = setup(ui);
		var other = x.df.placeSystem({id: DataFlowView.getId(x.sap)}, 0, 400);
		var ds = DataFlowView.getCells(x.graph, 'dataset', x.wo)[0];
		var cells = paste(ui, copy(x.graph, [ds]));

		t.ok(x.graph.model.getParent(cells[0]) === other, 'moved into the SAP shape without it');

		// No SAP shape without Assets: the pasted copy is dropped
		var before = DataFlowView.getCells(x.graph, 'dataset').length;
		ds = DataFlowView.getCells(x.graph, 'dataset', x.assets)[0];
		x.df.placeDataset(other, {id: x.assets});
		paste(ui, copy(x.graph, [ds]));
		t.eq(DataFlowView.getCells(x.graph, 'dataset').length, before + 1, 'only the placed one');

		// In another file without its system it is dropped with its entities
		var xml = copy(x.graph, [ds]);
		DataFlowTest.newFile(ui);
		paste(ui, xml);
		t.ok(DataFlowCatalog.read(ui.editor.graph).isEmpty(), 'nothing imported');
	});

	test('clipboard: model view cells pasted into the flow are dropped', function(t, ui)
	{
		var x = setup(ui);
		x.df.setView('model');
		var table = DataFlowView.getCells(x.graph, 'table', x.wo)[0];
		var xml = copy(x.graph, [table]);
		var tables = DataFlowView.getCells(x.graph, 'table').length;
		x.df.setView('flow');

		paste(ui, xml);
		t.eq(DataFlowView.getCells(x.graph, 'table').length, tables, 'no extra table');
		t.eq(DataFlowView.getCells(x.graph, 'column').filter(function(c)
		{
			return DataFlowModel.getLayer(x.graph, 'flow') == x.graph.model.getParent(x.graph.model.getParent(c));
		}).length, 0);
	});

	test('clipboard: hostile clipboard data is sanitized', function(t, ui)
	{
		var data = JSON.stringify({systems: {'__proto__': {name: 'P', polluted: true}, s1: {name: '<b>SAP</b>'}},
			datasets: {d1: {name: 'D', system: 's1', attributes: ['a1', 'constructor']}},
			attributes: {a1: {name: 'A', dataset: 'd1', derivedFrom: 'nope'}, constructor: {name: 'X', dataset: 'd1'}}});
		var xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
			'<object label="x" dfType="system" dfId="s1" dfData="' + mxUtils.htmlEntities(data) + '" id="2">' +
			'<mxCell style="' + DataFlow.SYSTEM_STYLE + '" vertex="1" parent="1"><mxGeometry width="220" height="80" as="geometry"/></mxCell></object>' +
			'<object label="y" dfType="dataset" dfId="d1" dfData="' + mxUtils.htmlEntities(data) + '" id="3">' +
			'<mxCell style="' + DataFlow.DATASET_STYLE + '" vertex="1" parent="2"><mxGeometry width="200" height="30" as="geometry"/></mxCell></object>' +
			'</root></mxGraphModel>';

		paste(ui, xml);
		var c = DataFlowCatalog.read(ui.editor.graph);
		t.ok(({}).polluted === undefined);
		t.eq(c.getSystemIds(), ['s1']);
		t.eq(c.getDataset('d1').attributes, ['a1'], 'invalid IDs dropped');
		t.ok(c.getAttribute('a1').derivedFrom == null);

		var sys = DataFlowView.getCells(ui.editor.graph, 'system')[0];
		t.ok(sys.value.getAttribute('label').indexOf('&lt;b&gt;SAP') >= 0, 'label re-rendered from the catalog, escaped');
	});

	test('clipboard: shapes from a library keep their entities', function(t, ui)
	{
		var x = setup(ui);
		var xml = copy(x.graph, [x.sap]);
		DataFlowTest.newFile(ui);

		var graph = ui.editor.graph;
		var cells = ui.stringToCells(xml);
		graph.importCells(cells, 100, 100, graph.getDefaultParent());

		var c = DataFlowCatalog.read(graph);
		t.eq(c.getDatasetIds().sort(), [x.wo, x.assets].sort());
		t.eq(DataFlowView.getCells(graph, 'dataset').length, 2);
	});
})();
