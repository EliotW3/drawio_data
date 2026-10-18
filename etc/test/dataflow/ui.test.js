/**
 * Systems and datasets on the canvas: placement, rendering, editing,
 * deletion, drop rules and dialogs (docs/DATAFLOW.md §5, phase 2).
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

	// SAP with Workorders (3 attributes) in one system shape
	function sap(ui)
	{
		var df = ui.dataFlow;
		var sys = df.placeSystem({props: {name: 'SAP ECC', owner: 'Finance IT', environment: 'SAP'}}, 40, 40);
		var ds = df.placeDataset(sys, {name: 'Workorders', attributes: ['WO_ID', 'Status', 'Plant']});

		return {df: df, graph: ui.editor.graph, sys: sys, ds: ds,
			sysId: DataFlowView.getId(sys), dsId: DataFlowView.getId(ds)};
	};

	function rowNames(graph, ds)
	{
		return graph.model.getChildCells(ds).map(function(row)
		{
			return row.value.getAttribute('label');
		});
	};

	test('ui: the Data Flow palette is above General', function(t, ui)
	{
		var sb = ui.sidebar;
		t.ok(sb.palettes['dataflow'] != null, 'palette exists');

		var title = sb.palettes['dataflow'][0];
		var general = sb.palettes['general'][0];
		t.ok(title.compareDocumentPosition(general) & Node.DOCUMENT_POSITION_FOLLOWING, 'before General');
		t.ok(title.textContent.indexOf('Data Flow') >= 0);
	});

	test('ui: placing a system creates the entity and the shape in one undo step', function(t, ui)
	{
		var graph = ui.editor.graph;
		var cell = ui.dataFlow.placeSystem({props: {name: 'SAP ECC', owner: 'Finance IT',
			environment: 'SAP', notes: 'Client 100'}}, 40, 40);
		var c = DataFlowCatalog.read(graph);
		var id = DataFlowView.getId(cell);

		t.eq(DataFlowView.getType(cell), 'system');
		t.eq(c.getSystem(id).name, 'SAP ECC');
		t.ok(cell.value.getAttribute('label').indexOf('<b>SAP ECC</b>') >= 0);
		t.ok(cell.value.getAttribute('label').indexOf('Finance IT') > 0);
		t.eq(cell.value.getAttribute('tooltip'), 'Client 100');
		t.ok(graph.getSelectionCell() === cell, 'selected');
		t.eq(ui.editor.undoManager.history.length, 1);

		ui.editor.undoManager.undo();
		t.ok(!graph.model.contains(cell));
		t.ok(DataFlowCatalog.read(graph).getSystem(id) == null, 'entity undone too');
	});

	test('ui: entity text is escaped in labels', function(t, ui)
	{
		var df = ui.dataFlow;
		var sys = df.placeSystem({props: {name: '<img src=x onerror=alert(1)>', environment: '"><b>'}}, 0, 0);
		var ds = df.placeDataset(sys, {name: 'A&B', attributes: ['<script>']});
		var label = sys.value.getAttribute('label');

		t.ok(label.indexOf('<img') < 0 && label.indexOf('&lt;img') >= 0, label);
		t.ok(label.indexOf('&quot;&gt;&lt;b&gt;') >= 0, label);
		t.ok(ds.value.getAttribute('label').indexOf('A&amp;B') >= 0);
		t.eq(rowNames(ui.editor.graph, ds), ['&lt;script&gt;']);
	});

	test('ui: a dataset is collapsed with one row per attribute and the system grows', function(t, ui)
	{
		var x = sap(ui);
		var geo = x.graph.getCellGeometry(x.ds);

		t.ok(x.graph.model.getParent(x.ds) === x.sys, 'inside the system');
		t.ok(x.ds.collapsed, 'collapsed by default');
		t.eq(geo.height, DataFlow.DATASET_HEADER);
		t.eq(geo.alternateBounds.height, DataFlow.DATASET_HEADER + 3 * DataFlow.ATTRIBUTE_HEIGHT + 4);
		t.eq(rowNames(x.graph, x.ds), ['WO_ID', 'Status', 'Plant']);
		t.ok(x.ds.value.getAttribute('label').indexOf('(3)') > 0);

		var sysGeo = x.graph.getCellGeometry(x.sys);
		t.eq(sysGeo.height, DataFlow.SYSTEM_HEADER + 10 + DataFlow.DATASET_HEADER + 10, 'stack layout fits the system');
		t.eq(geo.width, DataFlow.SYSTEM_WIDTH - 20, 'dataset fills the system');
	});

	test('ui: expanding a dataset shows its rows and grows the system', function(t, ui)
	{
		var x = sap(ui);
		var before = x.graph.getCellGeometry(x.sys).height;

		x.graph.foldCells(false, false, [x.ds]);

		t.ok(!x.ds.collapsed);
		t.eq(x.graph.getCellGeometry(x.ds).height, DataFlow.DATASET_HEADER + 3 * DataFlow.ATTRIBUTE_HEIGHT + 4);
		t.eq(x.graph.getCellGeometry(x.sys).height, before + 3 * DataFlow.ATTRIBUTE_HEIGHT + 4);

		var rows = x.graph.model.getChildCells(x.ds);
		t.ok(x.graph.view.getState(rows[0]) != null, 'rows are visible');
		t.eq(x.graph.getCellGeometry(rows[1]).y, DataFlow.DATASET_HEADER + DataFlow.ATTRIBUTE_HEIGHT);
	});

	test('ui: an existing system can be placed again with its datasets', function(t, ui)
	{
		var x = sap(ui);
		var second = x.df.placeSystem({id: x.sysId, includeDatasets: true}, 400, 40);

		t.eq(DataFlowView.getId(second), x.sysId);
		t.eq(DataFlowView.getDatasetIds(x.graph, second), [x.dsId]);
		t.eq(DataFlowCatalog.read(x.graph).getSystemIds(), [x.sysId], 'still one system');

		var third = x.df.placeSystem({id: x.sysId, includeDatasets: false}, 800, 40);
		t.eq(DataFlowView.getDatasetIds(x.graph, third), []);
	});

	test('ui: editing updates every shape of the entity in one undo step', function(t, ui)
	{
		var x = sap(ui);
		var second = x.df.placeSystem({id: x.sysId, includeDatasets: true}, 400, 40);
		var other = x.graph.model.getChildCells(second)[0];
		var ids = DataFlowCatalog.read(x.graph).getDataset(x.dsId).attributes;
		var steps = ui.editor.undoManager.history.length;

		x.df.editSystem(x.sysId, {name: 'SAP S/4', environment: 'SAP HANA'});
		x.df.editDataset(x.dsId, 'Work Orders', [{id: ids[2], name: 'Plant'},
			{id: ids[0], name: 'Order ID'}, {id: null, name: 'Priority'}]);

		t.ok(second.value.getAttribute('label').indexOf('SAP S/4') >= 0);
		t.ok(second.value.getAttribute('label').indexOf('SAP HANA') >= 0);
		t.eq(rowNames(x.graph, x.ds), ['Plant', 'Order ID', 'Priority']);
		t.eq(rowNames(x.graph, other), ['Plant', 'Order ID', 'Priority']);
		t.ok(other.value.getAttribute('label').indexOf('Work Orders') >= 0);
		t.eq(ui.editor.undoManager.history.length, steps + 2);

		ui.editor.undoManager.undo();
		t.eq(rowNames(x.graph, other), ['WO_ID', 'Status', 'Plant']);
		t.eq(DataFlowCatalog.read(x.graph).getDataset(x.dsId).name, 'Workorders');
	});

	test('ui: rows of an expanded dataset follow attribute changes', function(t, ui)
	{
		var x = sap(ui);
		x.graph.foldCells(false, false, [x.ds]);
		var ids = DataFlowCatalog.read(x.graph).getDataset(x.dsId).attributes;

		x.df.editDataset(x.dsId, 'Workorders', [{id: ids[0], name: 'WO_ID'}]);

		t.eq(rowNames(x.graph, x.ds), ['WO_ID']);
		t.eq(x.graph.getCellGeometry(x.ds).height, DataFlow.DATASET_HEADER + DataFlow.ATTRIBUTE_HEIGHT + 4);
	});

	test('ui: deleting the last shape deletes the entity', function(t, ui)
	{
		var x = sap(ui);
		var second = x.df.placeSystem({id: x.sysId, includeDatasets: true}, 400, 40);
		var other = x.graph.model.getChildCells(second)[0];

		x.graph.removeCells([other]);
		t.ok(DataFlowCatalog.read(x.graph).getDataset(x.dsId) != null, 'another shape remains');

		x.graph.removeCells([x.ds]);
		t.ok(DataFlowCatalog.read(x.graph).getDataset(x.dsId) == null, 'last shape gone');

		ui.editor.undoManager.undo();
		t.ok(DataFlowCatalog.read(x.graph).getDataset(x.dsId) != null, 'undo restores the dataset');
		t.ok(x.graph.model.contains(x.ds));

		x.graph.removeCells([x.sys, second]);
		var c = DataFlowCatalog.read(x.graph);
		t.ok(c.getSystem(x.sysId) == null && c.getDataset(x.dsId) == null, 'system and its datasets');
	});

	test('ui: delete everywhere removes every shape', function(t, ui)
	{
		var x = sap(ui);
		var second = x.df.placeSystem({id: x.sysId, includeDatasets: true}, 400, 40);

		x.df.deleteEntity('dataset', x.dsId);
		t.eq(DataFlowView.getCells(x.graph, 'dataset').length, 0);
		t.eq(x.graph.model.getChildCount(second), 0);

		x.df.deleteEntity('system', x.sysId);
		t.eq(DataFlowView.getCells(x.graph, 'system').length, 0);
		t.ok(DataFlowCatalog.read(x.graph).isEmpty());
	});

	test('ui: systems only accept their own datasets', function(t, ui)
	{
		var x = sap(ui);
		var crm = x.df.placeSystem({props: {name: 'CRM'}}, 400, 40);
		var orders = x.df.placeDataset(crm, {name: 'Orders', attributes: []});
		var second = x.df.placeSystem({id: x.sysId}, 800, 40);
		var shape = x.graph.insertVertex(x.graph.getDefaultParent(), null, 'Box', 0, 300, 80, 40);
		var template = DataFlowUi.createTemplate('dataset');

		t.ok(x.graph.isValidDropTarget(second, [x.ds]), 'own dataset into another SAP shape');
		t.ok(!x.graph.isValidDropTarget(crm, [x.ds]), 'SAP dataset into CRM');
		t.ok(!x.graph.isValidDropTarget(x.sys, [orders]));
		t.ok(!x.graph.isValidDropTarget(x.sys, [shape]), 'ordinary shape');
		t.ok(!x.graph.isValidDropTarget(x.ds, [x.ds]), 'into a dataset');
		t.ok(x.graph.isValidDropTarget(x.sys, [template]), 'palette dataset');
		t.ok(!x.graph.graphHandler.shouldRemoveCellsFromParent(x.sys, [x.ds], null), 'not out of the system');
	});

	test('ui: double click opens the editor, not label editing', function(t, ui)
	{
		var x = sap(ui);
		var row = x.graph.model.getChildCells(x.ds)[0];

		x.graph.dblClick(new MouseEvent('dblclick'), x.sys);
		t.ok(!x.graph.isEditing(), 'no label editing');
		t.eq(ui.dialog.container.querySelector('h3').textContent, 'Edit System');
		closeDialogs(ui);

		x.graph.dblClick(new MouseEvent('dblclick'), row);
		t.eq(ui.dialog.container.querySelector('h3').textContent, 'Edit Dataset', 'row edits its dataset');
		closeDialogs(ui);
	});

	test('dialog: add a new system from the palette', function(t, ui)
	{
		var graph = ui.editor.graph;
		ui.dataFlow.templateDropped('system', null, 300, 200, false);

		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('h3').textContent, 'Add System');
		t.ok(dlg.querySelector('select') == null, 'no existing systems to offer');

		var inputs = dlg.querySelectorAll('input[type="text"]');
		dlg.querySelector('.gePrimaryBtn').click();
		t.ok(ui.dialog != null && DataFlowView.getCells(graph, 'system').length == 0, 'name is required');
		closeDialogs(ui);

		ui.dataFlow.templateDropped('system', null, 300, 200, false);
		dlg = ui.dialog.container;
		inputs = dlg.querySelectorAll('input[type="text"]');
		inputs[0].value = 'Asset Register';
		inputs[1].value = 'Maintenance';
		inputs[2].value = 'Excel';
		dlg.querySelector('textarea').value = 'Kept by the planners';
		dlg.querySelector('.gePrimaryBtn').click();

		var cells = DataFlowView.getCells(graph, 'system');
		t.eq(cells.length, 1);
		t.eq(DataFlowCatalog.read(graph).getSystem(DataFlowView.getId(cells[0])),
			{name: 'Asset Register', owner: 'Maintenance', environment: 'Excel', notes: 'Kept by the planners'});
		t.eq(graph.getCellGeometry(cells[0]).x, 300 - DataFlow.SYSTEM_WIDTH / 2, 'centred on the drop');
		closeDialogs(ui);
	});

	test('dialog: place an existing system, environments are suggested', function(t, ui)
	{
		var x = sap(ui);
		x.df.placeSystem({props: {name: 'Sheet', environment: 'Excel'}}, 400, 40);
		ui.dataFlow.templateDropped('system', null, 300, 400, false);

		var dlg = ui.dialog.container;
		var options = [].map.call(dlg.querySelectorAll('datalist option'), function(o) { return o.value; });
		t.eq(options, ['Excel', 'SAP']);

		var select = dlg.querySelector('select');
		t.ok(select.disabled, 'new system is the default');
		var radios = dlg.querySelectorAll('input[type="radio"]');
		radios[0].click();
		t.ok(!select.disabled);
		select.value = x.sysId;
		dlg.querySelector('.gePrimaryBtn').click();

		t.eq(DataFlowView.getCells(x.graph, 'system', x.sysId).length, 2);
		t.eq(DataFlowView.getCells(x.graph, 'dataset', x.dsId).length, 2, 'with its datasets');
		closeDialogs(ui);
	});

	test('dialog: add a dataset with pasted attributes', function(t, ui)
	{
		var x = sap(ui);
		x.graph.setSelectionCell(x.sys);
		ui.dataFlow.templateDropped('dataset', null, 0, 0, true);

		var dlg = ui.dialog.container;
		t.eq(dlg.querySelector('h3').textContent, 'Add Dataset');
		t.ok(dlg.textContent.indexOf('In SAP ECC') >= 0);

		var name = dlg.querySelector('input[type="text"]');
		name.value = 'Assets';

		var first = dlg.querySelector('.geDataFlowAttrRow input');
		var paste = new Event('paste', {bubbles: true, cancelable: true});
		paste.clipboardData = {getData: function() { return 'Asset_ID\tPlant, Install_Date\n'; }};
		first.dispatchEvent(paste);

		var values = [].map.call(dlg.querySelectorAll('.geDataFlowAttrRow input'), function(i) { return i.value; });
		t.eq(values, ['Asset_ID', 'Plant', 'Install_Date']);

		dlg.querySelector('.gePrimaryBtn').click();

		var ids = DataFlowView.getDatasetIds(x.graph, x.sys);
		t.eq(ids.length, 2);
		var c = DataFlowCatalog.read(x.graph);
		t.eq(c.getDataset(ids[1]).attributes.map(function(a) { return c.getAttribute(a).name; }),
			['Asset_ID', 'Plant', 'Install_Date']);
		closeDialogs(ui);
	});

	test('dialog: a dataset needs a system', function(t, ui)
	{
		ui.editor.graph.clearSelection();
		ui.dataFlow.templateDropped('dataset', null, 0, 0, true);

		t.ok(ui.dialog != null && ui.dialog.container.textContent.indexOf('Drop the dataset onto a system') >= 0);
		closeDialogs(ui);
	});

	test('dialog: dataset editor validation and existing datasets', function(t, ui)
	{
		var x = sap(ui);
		var second = x.df.placeSystem({id: x.sysId}, 400, 40);

		// The SAP shape that lacks Workorders offers it
		ui.dataFlow.showDatasetDialog(second, null);
		var dlg = ui.dialog.container;
		var select = dlg.querySelector('select');
		t.ok(select != null && select.options.length == 1 && select.value == x.dsId);
		closeDialogs(ui);

		// The SAP shape that has it offers nothing existing
		ui.dataFlow.showDatasetDialog(x.sys, null);
		t.ok(ui.dialog.container.querySelector('select') == null);
		closeDialogs(ui);

		// Editing: duplicate and emptied names are refused
		ui.dataFlow.editCell(x.ds);
		dlg = ui.dialog.container;
		var inputs = dlg.querySelectorAll('.geDataFlowAttrRow input');
		t.eq(inputs.length, 3);
		inputs[1].value = 'wo_id';
		dlg.querySelector('.gePrimaryBtn').click();
		t.ok(ui.dialogs.length == 2 && ui.dialog.container.textContent.indexOf('listed twice') >= 0, 'duplicate');
		ui.hideDialog();

		inputs[1].value = ' ';
		dlg.querySelector('.gePrimaryBtn').click();
		t.ok(ui.dialog.container.textContent.indexOf('Enter a name for every attribute') >= 0, 'emptied');
		ui.hideDialog();

		inputs[1].value = 'State';
		dlg.querySelector('.gePrimaryBtn').click();
		t.eq(rowNames(x.graph, x.ds), ['WO_ID', 'State', 'Plant']);
		closeDialogs(ui);
	});

	test('dialog: removing an attribute in use asks first', function(t, ui)
	{
		var x = sap(ui);
		var assets = x.df.placeDataset(x.sys, {name: 'Assets', attributes: ['Plant']});

		DataFlowView.update(x.graph, function(c)
		{
			c.addRelationship(c.getDataset(x.dsId).attributes[2],
				c.getDataset(DataFlowView.getId(assets)).attributes[0], 'M:1');
		});

		ui.dataFlow.editCell(x.ds);
		var dlg = ui.dialog.container;
		var rows = dlg.querySelectorAll('.geDataFlowAttrRow');
		rows[2].querySelectorAll('button')[2].click();
		dlg.querySelector('.gePrimaryBtn').click();

		t.ok(ui.dialog.container.textContent.indexOf('1 relationship') >= 0, 'confirmation shown');
		t.eq(rowNames(x.graph, x.ds).length, 3, 'nothing changed yet');
		ui.dialog.container.querySelector('.gePrimaryBtn').click();
		t.eq(rowNames(x.graph, x.ds), ['WO_ID', 'Status']);
		t.eq(Object.keys(DataFlowCatalog.read(x.graph).relationships), []);
		closeDialogs(ui);
	});

	test('ui: context menu items', function(t, ui)
	{
		var x = sap(ui);
		var labels = [];
		var menu = {addSeparator: function() {}, addItem: function(label) { labels.push(label); }};

		x.graph.setSelectionCell(x.sys);
		x.df.addPopupMenuItems(menu, x.sys);
		t.eq(labels, ['Edit System...', 'Add Dataset...', 'Delete Everywhere...']);

		labels = [];
		x.df.addPopupMenuItems(menu, x.graph.model.getChildCells(x.ds)[0]);
		t.eq(labels, ['Edit Dataset...', 'Delete Everywhere...']);
	});

	test('ui: shapes and catalog survive save and load', function(t, ui)
	{
		var x = sap(ui);
		x.graph.foldCells(false, false, [x.ds]);
		var data = ui.getFileData(true, null, null, null, null, null, null, null, null, true);

		ui.fileLoaded(new LocalFile(ui, data, 'saved.drawio', true), true);
		var graph = ui.editor.graph;
		var ds = DataFlowView.getCells(graph, 'dataset', x.dsId)[0];

		t.ok(ds != null && !ds.collapsed, 'expanded state kept');
		t.eq(rowNames(graph, ds), ['WO_ID', 'Status', 'Plant']);

		ui.dataFlow.editDataset(x.dsId, 'Orders', [{id: null, name: 'ID'}]);
		t.eq(rowNames(graph, ds), ['ID']);
	});
})();
