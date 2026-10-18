/**
 * Catalog storage on the page root: persistence, undo/redo and pages
 * (docs/DATAFLOW.md §4.1).
 */
(function()
{
	var test = DataFlowTest.test;

	function addSap(graph)
	{
		return DataFlowCatalog.edit(graph, function(c)
		{
			var s = c.addSystem({name: 'SAP', environment: 'SAP'});
			c.addDataset(s, 'Workorders', ['WO_ID', 'Status']);

			return s;
		});
	};

	test('storage: a new page has no catalog', function(t, ui)
	{
		var graph = ui.editor.graph;

		t.ok(!DataFlowCatalog.hasCatalog(graph));
		t.ok(DataFlowCatalog.read(graph).isEmpty());
	});

	test('storage: edit stores the catalog on the page root', function(t, ui)
	{
		var graph = ui.editor.graph;
		var s = addSap(graph);
		var root = graph.model.getRoot();

		t.ok(DataFlowCatalog.hasCatalog(graph));
		t.eq(JSON.parse(root.value.getAttribute('dataflow')).systems[s].name, 'SAP');
		t.eq(DataFlowCatalog.read(graph).getSystem(s).name, 'SAP');
		t.eq(root.getAttribute('label'), '', 'root label stays empty');
	});

	test('storage: page data set with Edit Data is kept', function(t, ui)
	{
		var graph = ui.editor.graph;
		graph.setAttributeForCell(graph.model.getRoot(), 'project', 'Alpha');
		addSap(graph);

		t.eq(graph.model.getRoot().getAttribute('project'), 'Alpha');
	});

	test('storage: one edit is one undo step, with cell changes', function(t, ui)
	{
		var graph = ui.editor.graph;
		var undo = ui.editor.undoManager;
		var s = addSap(graph);
		var before = DataFlowCatalog.getText(graph);
		var steps = undo.history.length;

		DataFlowCatalog.edit(graph, function(c)
		{
			c.updateSystem(s, {name: 'SAP ECC'});
			graph.insertVertex(graph.getDefaultParent(), null, 'SAP ECC', 10, 10, 120, 60);
		});

		t.eq(undo.history.length, steps + 1);
		t.eq(graph.getChildCells(graph.getDefaultParent()).length, 1);

		undo.undo();
		t.eq(DataFlowCatalog.getText(graph), before);
		t.eq(graph.getChildCells(graph.getDefaultParent()).length, 0, 'cell undone too');

		undo.redo();
		t.eq(DataFlowCatalog.read(graph).getSystem(s).name, 'SAP ECC');
		t.eq(graph.getChildCells(graph.getDefaultParent()).length, 1);
	});

	test('storage: an edit without changes adds no undo step', function(t, ui)
	{
		var graph = ui.editor.graph;
		addSap(graph);
		var steps = ui.editor.undoManager.history.length;

		DataFlowCatalog.edit(graph, function(c) { c.getSystemIds(); });
		t.eq(ui.editor.undoManager.history.length, steps);
	});

	test('storage: a failed edit stores nothing', function(t, ui)
	{
		var graph = ui.editor.graph;
		addSap(graph);
		var before = DataFlowCatalog.getText(graph);
		var steps = ui.editor.undoManager.history.length;

		t.throws(function()
		{
			DataFlowCatalog.edit(graph, function(c)
			{
				c.addSystem({name: 'Excel'});
				c.addSystem({name: ''});
			});
		});

		t.eq(DataFlowCatalog.getText(graph), before);
		t.eq(ui.editor.undoManager.history.length, steps);
	});

	test('storage: the catalog survives save and load', function(t, ui)
	{
		var graph = ui.editor.graph;
		var s = addSap(graph);
		var data = ui.getFileData(true, null, null, null, null, null, null, null, null, true);

		t.ok(data.indexOf('dataflow=') > 0, 'in the file');

		DataFlowTest.newFile(ui);
		t.ok(!DataFlowCatalog.hasCatalog(ui.editor.graph));

		ui.fileLoaded(new LocalFile(ui, data, 'reloaded.drawio', true), true);
		var c = DataFlowCatalog.read(ui.editor.graph);
		t.eq(c.getSystem(s).name, 'SAP');
		t.eq(c.getDataset(c.getDatasetIds(s)[0]).name, 'Workorders');
	});

	test('storage: compressed files keep the catalog', function(t, ui)
	{
		var graph = ui.editor.graph;
		var s = addSap(graph);
		var data = ui.getFileData(true, null, null, null, null, null, null, null, null, false);

		t.ok(data.indexOf('dataflow=') < 0, 'compressed');

		ui.fileLoaded(new LocalFile(ui, data, 'compressed.drawio', true), true);
		t.eq(DataFlowCatalog.read(ui.editor.graph).getSystem(s).name, 'SAP');
	});

	test('storage: each page has its own catalog, duplicates copy it', function(t, ui)
	{
		var graph = ui.editor.graph;
		var first = ui.currentPage;
		var s = addSap(graph);

		var second = ui.insertPage();
		ui.selectPage(second);
		t.ok(!DataFlowCatalog.hasCatalog(graph), 'new page is empty');

		DataFlowCatalog.edit(graph, function(c) { c.addSystem({name: 'Excel'}); });
		t.eq(DataFlowCatalog.read(graph).getSystemIds().length, 1);

		ui.selectPage(first);
		t.eq(DataFlowCatalog.read(graph).getSystem(s).name, 'SAP', 'first page unchanged');

		var copy = ui.duplicatePage(first);
		ui.selectPage(copy);
		t.eq(DataFlowCatalog.read(graph).getSystem(s).name, 'SAP', 'duplicate has the catalog');

		DataFlowCatalog.edit(graph, function(c) { c.updateSystem(s, {name: 'Copy'}); });
		ui.selectPage(first);
		t.eq(DataFlowCatalog.read(graph).getSystem(s).name, 'SAP', 'duplicate is independent');
	});

	test('storage: a damaged catalog in a file loads safely', function(t, ui)
	{
		var xml = '<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root>' +
			'<UserObject label="" dataflow="{&quot;systems&quot;:{&quot;s1&quot;:{&quot;name&quot;:&quot;SAP&quot;}},' +
			'&quot;datasets&quot;:{&quot;d1&quot;:{&quot;name&quot;:&quot;X&quot;,&quot;system&quot;:&quot;s9&quot;}}}" id="0">' +
			'<mxCell/></UserObject><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

		ui.fileLoaded(new LocalFile(ui, xml, 'damaged.drawio', true), true);
		var c = DataFlowCatalog.read(ui.editor.graph);

		t.eq(c.getSystemIds(), ['s1']);
		t.eq(c.getDatasetIds(), []);
		t.ok(c.warnings.length == 1);

		ui.fileLoaded(new LocalFile(ui, xml.replace('{&quot;systems', '{{'), 'broken.drawio', true), true);
		t.ok(DataFlowCatalog.read(ui.editor.graph).isEmpty(), 'invalid JSON reads as empty');
	});
})();
