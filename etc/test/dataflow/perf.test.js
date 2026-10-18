/**
 * Performance at the size named in docs/DATAFLOW.md §11: 50 systems with 10
 * datasets of 8 attributes each (500 datasets, 4000 attributes) and 25
 * configured Exports. Budgets are generous; the timings are printed.
 */
(function()
{
	var test = DataFlowTest.test;

	function time(fn)
	{
		var t0 = performance.now();
		fn();

		return Math.round(performance.now() - t0);
	};

	test('perf: 50 systems, 500 datasets, 25 exports', function(t, ui)
	{
		var df = ui.dataFlow;
		var graph = ui.editor.graph;
		var systems = [];

		var build = time(function()
		{
			df.update(function(c)
			{
				for (var i = 0; i < 50; i++)
				{
					var id = c.addSystem({name: 'System ' + i, owner: 'Team ' + (i % 7), environment: ['SAP', 'Excel', 'SQL'][i % 3]});
					var cell = DataFlowView.createSystemCell(c, id, (i % 10) * 300, Math.floor(i / 10) * 700);
					graph.addCell(cell, graph.getDefaultParent());
					systems.push(cell);

					for (var j = 0; j < 10; j++)
					{
						var names = [];

						for (var k = 0; k < 8; k++)
						{
							names.push('Column_' + j + '_' + k);
						}

						graph.addCell(DataFlowView.createDatasetCell(c, c.addDataset(id, 'Dataset ' + i + '.' + j, names)), cell);
					}
				}
			});
		});

		var exports = [];
		var connect = time(function()
		{
			df.update(function(c)
			{
				for (var i = 0; i < 25; i++)
				{
					var a = c.addAction('export');
					var cell = DataFlowView.createActionCell(c, a, (i % 10) * 300 + 230, Math.floor(i / 10) * 700 + 300);
					graph.addCell(cell, graph.getDefaultParent());
					graph.insertEdge(graph.getDefaultParent(), null, '', systems[2 * i], cell);
					graph.insertEdge(graph.getDefaultParent(), null, '', cell, systems[2 * i + 1]);
					exports.push(cell);
				}
			});
		});

		var configure = time(function()
		{
			for (var i = 0; i < exports.length; i++)
			{
				var c = df.getCatalog();
				var source = c.getDataset(DataFlowView.getDatasetIds(graph, systems[2 * i])[0]);
				df.applyExport(exports[i], {name: 'Extract ' + i, attributes: source.attributes.slice(0, 4)});
			}
		}) / exports.length;

		var c = df.getCatalog();
		t.eq(c.getDatasetIds().length, 525);

		var rename = time(function()
		{
			df.editSystem(DataFlowView.getId(systems[0]), {name: 'Renamed'});
		});

		var ds = DataFlowView.getDatasetIds(graph, systems[0])[0];
		var attrs = c.getDataset(ds).attributes;
		var editDataset = time(function()
		{
			df.editDataset(ds, 'Renamed dataset', attrs.map(function(id, i)
			{
				return {id: id, name: (i == 0) ? 'Renamed column' : c.getAttribute(id).name};
			}));
		});

		var firstModel = time(function() { df.setView('model'); });
		var modelEdit = time(function()
		{
			df.editSystem(DataFlowView.getId(systems[1]), {name: 'Renamed again'});
		});
		var toFlow = time(function() { df.setView('flow'); });
		var toModel = time(function() { df.setView('model'); });
		var undo = time(function() { ui.editor.undoManager.undo(); });

		t.eq(DataFlowView.getCells(graph, 'table').length, 525);
		t.eq(DataFlowView.getCells(graph, 'lineage').length, 25);

		DataFlowTest.note('build 500 datasets: ' + build + ' ms, 25 exports placed and connected: ' + connect +
			' ms, configure one export: ' + Math.round(configure) + ' ms');
		DataFlowTest.note('rename a system: ' + rename + ' ms, edit a dataset: ' + editDataset + ' ms');
		DataFlowTest.note('first model view: ' + firstModel + ' ms, edit in the model view: ' + modelEdit +
			' ms, switch to flow: ' + toFlow + ' ms, back to model: ' + toModel + ' ms, undo: ' + undo + ' ms');

		t.ok(rename < 1500 && editDataset < 1500, 'edits within 1.5 s');
		t.ok(modelEdit < 2000, 'edit in the model view within 2 s');
		t.ok(firstModel < 8000, 'first model view within 8 s');
		t.ok(toFlow < 2000 && toModel < 2000, 'switching within 2 s');
	});
})();
