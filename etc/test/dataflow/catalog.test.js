/**
 * DataFlowCatalog: entities, integrity cascades and load-time repair
 * (docs/DATAFLOW.md §4).
 */
(function()
{
	var test = DataFlowTest.test;

	// SAP with Workorders (WO_ID, Status, Plant) and Assets (Asset_ID, Plant)
	function sample()
	{
		var c = new DataFlowCatalog();
		var s = c.addSystem({name: ' SAP ', owner: 'Finance IT', environment: 'SAP', notes: 'n'});
		var wo = c.addDataset(s, 'Workorders', ['WO_ID', 'Status', 'Plant']);
		var as = c.addDataset(s, 'Assets', ['Asset_ID', 'Plant']);

		return {c: c, s: s, wo: wo, as: as};
	};

	test('catalog: add and look up entities', function(t)
	{
		var x = sample();
		var c = x.c;

		t.eq(c.getSystem(x.s).name, 'SAP', 'name is trimmed');
		t.eq(c.getDatasetIds(x.s), [x.wo, x.as]);
		t.eq(c.getDataset(x.wo).attributes.map(function(a) { return c.getAttribute(a).name; }),
			['WO_ID', 'Status', 'Plant']);
		t.eq(c.getAttribute(c.getDataset(x.wo).attributes[0]).dataset, x.wo);
		t.ok(c.getSystem('nope') == null && c.getSystem('__proto__') == null);
		t.ok(!c.isEmpty());

		var other = c.addSystem({name: 'Excel', environment: 'Excel'});
		c.addSystem({name: 'Paper', environment: 'manual'});
		c.addSystem({name: 'ERP2', environment: 'sap'});
		t.eq(c.getEnvironments(), ['Excel', 'manual', 'SAP'], 'distinct, case-insensitive, sorted');
		t.ok(other != x.s);
	});

	test('catalog: names are required', function(t)
	{
		var x = sample();

		t.throws(function() { x.c.addSystem({name: '  '}); });
		t.throws(function() { x.c.addDataset(x.s, ''); });
		t.throws(function() { x.c.addAttribute(x.wo, null); });
		t.throws(function() { x.c.addDataset('unknown', 'D'); });
		t.throws(function() { x.c.renameDataset(x.wo, ' '); });
	});

	test('catalog: update a system', function(t)
	{
		var x = sample();
		x.c.updateSystem(x.s, {owner: ' Ops ', notes: 'line 1\nline 2'});

		t.eq(x.c.getSystem(x.s), {name: 'SAP', owner: 'Ops', environment: 'SAP', notes: 'line 1\nline 2'});
	});

	test('catalog: attribute editor renames, reorders, adds and removes', function(t)
	{
		var x = sample();
		var c = x.c;
		var ids = c.getDataset(x.wo).attributes.slice();
		var rel = c.addRelationship(ids[1], c.getDataset(x.as).attributes[0], '1:N');

		var result = c.setDatasetAttributes(x.wo, [{id: ids[2], name: 'Plant code'},
			{id: null, name: 'Priority'}, {id: ids[0], name: 'WO_ID'}]);

		t.eq(result.ids.length, 3);
		t.eq(result.ids[0], ids[2]);
		t.eq(result.ids[2], ids[0]);
		t.eq(result.ids.map(function(a) { return c.getAttribute(a).name; }),
			['Plant code', 'Priority', 'WO_ID']);
		t.eq(result.report.attributes, [ids[1]], 'Status removed');
		t.eq(result.report.relationships, [rel], 'its relationship removed');
		t.ok(c.getRelationship(rel) == null);
	});

	test('catalog: attribute editor validates before changing anything', function(t)
	{
		var x = sample();
		var before = x.c.stringify();
		var other = x.c.getDataset(x.as).attributes[0];

		t.throws(function() { x.c.setDatasetAttributes(x.wo, [{id: other, name: 'X'}]); }, 'foreign attribute');
		t.throws(function() { x.c.setDatasetAttributes(x.wo, [{id: null, name: ''}]); }, 'empty name');
		t.eq(x.c.stringify(), before);
	});

	test('catalog: removing an attribute cascades', function(t)
	{
		var x = sample();
		var c = x.c;
		var woId = c.getDataset(x.wo).attributes[0];
		var assetId = c.getDataset(x.as).attributes[0];
		var target = c.addSystem({name: 'Warehouse'});
		var exp = c.addAction(DataFlow.ACTION_EXPORT);
		var copy = c.addDataset(target, 'WO Extract', null, exp);
		var derived = c.addAttribute(copy, 'WO_ID', null, woId);
		var val = c.addAction(DataFlow.ACTION_VALIDATION, {pairs: [{primary: x.wo, reference: x.as,
			attributes: [[woId, assetId]]}]});
		var filter = c.addAction(DataFlow.ACTION_FILTER, {dropped: {attributes: [woId]}});
		var rel = c.addRelationship(woId, assetId, 'N:1');

		var report = c.removeAttribute(woId);

		t.eq(report.attributes, [woId]);
		t.eq(report.relationships, [rel]);
		t.eq(report.flagged.sort(), [val, filter].sort());
		t.ok(c.getAttribute(derived).derivedFrom == null, 'lineage cleared');
		t.ok(c.getAttribute(derived) != null, 'copy kept');
		t.eq(c.getAction(val).config.pairs[0].attributes, []);
		t.eq(c.getAction(filter).config.dropped.attributes, []);
		t.ok(c.needsAttention(val) && c.needsAttention(filter) && !c.needsAttention(exp));
		t.eq(c.getAction(val).attention, [{code: 'attributeRemoved', id: woId}]);
		t.eq(c.getDataset(x.wo).attributes.length, 2);
	});

	test('catalog: removing a dataset cascades', function(t)
	{
		var x = sample();
		var c = x.c;
		var target = c.addSystem({name: 'Warehouse'});
		var exp = c.addAction(DataFlow.ACTION_EXPORT);
		var out = c.addDataset(target, 'WO Extract', ['WO_ID'], exp);
		c.setActionConfig(exp, {dataset: out});
		var filter = c.addAction(DataFlow.ACTION_FILTER);
		var copy = c.addDataset(target, 'Workorders', ['WO_ID'], filter);
		c.setActionConfig(filter, {copies: {}, dropped: {datasets: [x.as]}});
		c.getAction(filter).config.copies[x.wo] = copy;
		var val = c.addAction(DataFlow.ACTION_VALIDATION, {pairs: [{primary: x.wo, reference: copy}]});
		var add = c.addAction(DataFlow.ACTION_ADDITION, {dataset: x.as});

		var report = c.removeDataset(x.wo);
		t.eq(report.datasets, [x.wo]);
		t.eq(report.attributes.length, 3);
		t.eq(report.flagged.sort(), [filter, val].sort());
		t.eq(Object.keys(c.getAction(filter).config.copies), []);
		t.eq(c.getAction(val).config.pairs, []);

		report = c.removeDataset(out);
		t.eq(report.flagged, [exp]);
		t.ok(c.getAction(exp).config.dataset == null);

		report = c.removeDataset(x.as);
		t.eq(report.flagged.sort(), [filter, add].sort());
		t.ok(c.getAction(add).config.dataset == null);
		t.eq(c.getAction(filter).config.dropped.datasets, []);
	});

	test('catalog: removing a system removes its datasets', function(t)
	{
		var x = sample();
		var report = x.c.removeSystem(x.s);

		t.eq(report.systems, [x.s]);
		t.eq(report.datasets, [x.wo, x.as]);
		t.eq(report.attributes.length, 5);
		t.ok(x.c.isEmpty());
		t.eq(Object.keys(x.c.attributes), []);
	});

	test('catalog: relationships', function(t)
	{
		var x = sample();
		var c = x.c;
		var a = c.getDataset(x.wo).attributes[2];
		var b = c.getDataset(x.as).attributes[1];

		t.throws(function() { c.addRelationship(a, a, '1:1'); }, 'self');
		t.throws(function() { c.addRelationship(a, b, '2:3'); }, 'cardinality');
		t.throws(function() { c.addRelationship(a, b, '1:1', c.addAction(DataFlow.ACTION_EXPORT)); }, 'not an addition');

		var r = c.addRelationship(a, b, 'N:1');
		t.eq(c.getRelationship(r), {from: a, to: b, cardinality: 'N:1', source: 'manual'});
		c.setCardinality(r, 'N:M');
		t.eq(c.getRelationship(r).cardinality, 'N:M');
		t.eq(c.getRelationshipIds(b), [r]);
	});

	test('catalog: removing an addition removes its relationships, not its datasets', function(t)
	{
		var x = sample();
		var c = x.c;
		var add = c.addAction(DataFlow.ACTION_ADDITION, {dataset: x.as});
		var r = c.addRelationship(c.getDataset(x.wo).attributes[2], c.getDataset(x.as).attributes[1], '1:N', add);
		var exp = c.addAction(DataFlow.ACTION_EXPORT);
		var out = c.addDataset(x.s, 'Out', ['WO_ID'], exp);
		c.setDerivedFrom(c.getDataset(out).attributes[0], c.getDataset(x.wo).attributes[0]);

		t.eq(c.getRelationship(r).source, 'addition');
		t.eq(c.getRelationshipIds(null, add), [r]);

		var report = c.removeAction(add);
		t.eq(report.actions, [add]);
		t.eq(report.relationships, [r]);
		t.eq(report.flagged, [], 'a removed action is not flagged');

		c.removeAction(exp);
		t.ok(c.getDataset(out) != null && c.getDataset(out).origin == null, 'output kept, origin cleared');
		t.ok(c.getAttribute(c.getDataset(out).attributes[0]).derivedFrom != null, 'lineage kept');
	});

	test('catalog: removing an addition relationship flags the addition', function(t)
	{
		var x = sample();
		var c = x.c;
		var add = c.addAction(DataFlow.ACTION_ADDITION, {dataset: x.as});
		var r = c.addRelationship(c.getDataset(x.wo).attributes[2], c.getDataset(x.as).attributes[1], '1:N', add);

		t.eq(c.removeRelationship(r).flagged, [add]);
		t.eq(c.getAction(add).attention, [{code: 'relationshipRemoved', id: r}]);

		c.setActionConfig(add, {dataset: x.as});
		t.ok(!c.needsAttention(add), 'confirming the dialog clears attention');
	});

	test('catalog: removal impact does not change the catalog', function(t)
	{
		var x = sample();
		var before = x.c.stringify();
		var impact = x.c.getRemovalImpact('system', x.s);

		t.eq(impact.datasets, [x.wo, x.as]);
		t.eq(x.c.stringify(), before);
		t.throws(function() { x.c.getRemovalImpact('bogus', x.s); });
	});

	test('catalog: action configs are sanitized', function(t)
	{
		var x = sample();
		var c = x.c;

		t.throws(function() { c.addAction('delete'); });

		var exp = c.addAction(DataFlow.ACTION_EXPORT, {dataset: 'missing', extra: 1});
		t.eq(c.getAction(exp).config, {dataset: null});

		var wo = c.getDataset(x.wo).attributes;
		var as = c.getDataset(x.as).attributes;
		var v1 = c.addAction(DataFlow.ACTION_VALIDATION, {pairs: [
			{primary: x.wo, reference: x.as, attributes: [[wo[0], as[0]], [as[0], wo[0]], [wo[0], as[0]]]},
			{primary: x.wo, reference: x.wo}, {primary: 'x', reference: x.as}]});
		t.eq(c.getAction(v1).config.pairs, [{primary: x.wo, reference: x.as, attributes: [[wo[0], as[0]]]}],
			'wrong-side and duplicate attribute pairs and invalid dataset pairs dropped');

		var v2 = c.addAction(DataFlow.ACTION_VALIDATION, {color: 'red'});
		var v3 = c.addAction(DataFlow.ACTION_VALIDATION, {color: '#123456'});
		t.eq([c.getAction(v1).config.color, c.getAction(v2).config.color, c.getAction(v3).config.color],
			[DataFlow.VALIDATION_COLORS[0], DataFlow.VALIDATION_COLORS[1], '#123456']);

		var f = c.addAction(DataFlow.ACTION_FILTER, {copies: {'__proto__': x.wo}, dropped: {datasets: [x.as, x.as, 'x']}});
		t.eq(c.getAction(f).config.dropped.datasets, [x.as]);
		t.eq(Object.keys(c.getAction(f).config.copies), []);
	});

	test('catalog: JSON round trip', function(t)
	{
		var x = sample();
		var c = x.c;
		var add = c.addAction(DataFlow.ACTION_ADDITION, {dataset: x.as});
		c.addRelationship(c.getDataset(x.wo).attributes[2], c.getDataset(x.as).attributes[1], '1:N', add);
		var f = c.addAction(DataFlow.ACTION_FILTER);
		var copy = c.addDataset(x.s, 'Copy', ['WO_ID'], f);
		c.setActionConfig(f, {copies: (function() { var m = {}; m[x.wo] = copy; return m; })()});
		c.flagAction(f, 'datasetRemoved', x.wo);

		var text = c.stringify();
		var parsed = DataFlowCatalog.parse(text);
		t.eq(parsed.warnings, []);
		t.eq(parsed.stringify(), text);
		t.eq(JSON.parse(text).version, DataFlow.CATALOG_VERSION);
	});

	test('catalog: invalid JSON gives an empty catalog', function(t)
	{
		var c = DataFlowCatalog.parse('{not json');

		t.ok(c.isEmpty());
		t.ok(c.warnings.length == 1 && c.warnings[0].indexOf('invalid JSON') == 0);
		t.ok(DataFlowCatalog.parse('[1,2]').warnings.length == 1);
		t.eq(DataFlowCatalog.parse(null).warnings, []);
		t.eq(DataFlowCatalog.parse('').warnings, []);
	});

	test('catalog: load drops dangling references and repairs entries', function(t)
	{
		var json = {
			version: 1,
			systems: {s1: {name: 'SAP', owner: 5, environment: {}, notes: null}, 'bad id!': {name: 'X'}, s2: 'nope'},
			datasets: {d1: {name: 'WO', system: 's1', attributes: ['a1', 'a1', 'a9', 'a3']},
				d2: {name: 'Orphan', system: 's9'}, d3: {name: '', system: 's1', origin: {action: 'x9'}}},
			attributes: {a1: {name: 'ID', dataset: 'd1', derivedFrom: 'a1'}, a2: {name: 'Unlisted', dataset: 'd1'},
				a3: {name: 'Other', dataset: 'd3'}, a4: {name: 'Gone', dataset: 'd2'},
				a5: {name: 'Copy', dataset: 'd3', derivedFrom: 'a2'}},
			actions: {x1: {type: 'addition', config: {dataset: 'd3'}, attention: [{code: 'x', id: 'a1'}, 7]},
				x2: {type: 'teleport'}},
			relationships: {r1: {from: 'a1', to: 'a5', cardinality: '9:9', source: 'addition', action: 'x1'},
				r2: {from: 'a1', to: 'a4', cardinality: '1:1'}, r3: {from: 'a1', to: 'a5', source: 'addition', action: 'x2'}}
		};

		var c = new DataFlowCatalog(json);

		t.eq(c.getSystemIds(), ['s1']);
		t.eq(c.getSystem('s1'), {name: 'SAP', owner: '5', environment: '', notes: ''});
		t.eq(c.getDatasetIds(), ['d1', 'd3']);
		t.eq(c.getDataset('d1').attributes, ['a1', 'a2'], 'duplicate, unknown and foreign dropped, unlisted appended');
		t.eq(c.getDataset('d3').attributes, ['a3', 'a5']);
		t.eq(c.getDataset('d3').name, '?');
		t.ok(c.getDataset('d3').origin == null, 'unknown origin dropped');
		t.ok(c.getAttribute('a4') == null, 'attribute of a dropped dataset dropped');
		t.ok(c.getAttribute('a1').derivedFrom == null, 'self lineage dropped');
		t.eq(c.getAttribute('a5').derivedFrom, 'a2');
		t.eq(c.getActionIds(), ['x1']);
		t.eq(c.getAction('x1').attention, [{code: 'x', id: 'a1'}]);
		t.eq(Object.keys(c.relationships), ['r1']);
		t.eq(c.getRelationship('r1').cardinality, '1:N');
		t.ok(c.warnings.length >= 10, 'warnings: ' + c.warnings.length);
	});

	test('catalog: hostile keys cannot pollute prototypes', function(t)
	{
		var text = '{"systems":{"__proto__":{"name":"P","polluted":true},"constructor":{"name":"C"}},' +
			'"datasets":{"d1":{"name":"D","system":"__proto__"}},' +
			'"actions":{"x1":{"type":"filter","config":{"copies":{"__proto__":"d1"}}}}}';
		var c = DataFlowCatalog.parse(text);

		t.ok(({}).polluted === undefined && ({}).name === undefined);
		t.eq(c.getSystemIds(), []);
		t.eq(c.getDatasetIds(), []);
		t.eq(Object.keys(c.getAction('x1').config.copies), []);
		t.ok(Object.getPrototypeOf(c.systems) === null);
		t.ok(!DataFlowCatalog.isValidId('__proto__') && !DataFlowCatalog.isValidId('a b') &&
			DataFlowCatalog.isValidId(Editor.guid()));
	});

	test('catalog: a newer version loads with a warning', function(t)
	{
		var c = DataFlowCatalog.parse('{"version":99,"systems":{"s1":{"name":"SAP","future":1}}}');

		t.eq(c.getSystem('s1').name, 'SAP');
		t.ok(c.warnings[0].indexOf('newer') > 0);
		t.ok(c.getSystem('s1').future === undefined);
	});
})();
