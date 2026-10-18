/**
 * Minimal in-page test harness for run.js. Test files call
 * DataFlowTest.test(name, fn), where fn receives the assertion helpers and
 * the EditorUi. Each test starts with a new blank file.
 */
var DataFlowTest = window.DataFlowTest = {tests: []};

DataFlowTest.test = function(name, fn)
{
	DataFlowTest.tests.push({name: name, fn: fn});
};

DataFlowTest.getUi = function()
{
	// Set by run.js
	return window.dataFlowTestUi;
};

/**
 * Opens a new blank file so that each test starts with one empty page.
 */
DataFlowTest.newFile = function(ui)
{
	ui.hideDialog();
	ui.fileLoaded(new LocalFile(ui, ui.emptyDiagramXml, 'test.drawio', true), true);
	ui.editor.undoManager.clear();
};

DataFlowTest.assert = {
	ok: function(value, message)
	{
		if (!value)
		{
			throw new Error(message || 'expected a true value');
		}
	},
	eq: function(actual, expected, message)
	{
		var a = JSON.stringify(actual);
		var e = JSON.stringify(expected);

		if (a !== e)
		{
			throw new Error((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a);
		}
	},
	throws: function(fn, message)
	{
		try
		{
			fn();
		}
		catch (e)
		{
			return;
		}

		throw new Error(message || 'expected an exception');
	}
};

DataFlowTest.run = function()
{
	var ui = DataFlowTest.getUi();
	var results = [];

	for (var i = 0; i < DataFlowTest.tests.length; i++)
	{
		var t = DataFlowTest.tests[i];

		try
		{
			DataFlowTest.newFile(ui);
			t.fn(DataFlowTest.assert, ui);
			results.push({name: t.name, ok: true});
		}
		catch (e)
		{
			results.push({name: t.name, ok: false, error: e.message +
				((e.stack != null) ? '\n      ' + e.stack.split('\n').slice(0, 3).join('\n      ') : '')});
		}
	}

	return results;
};
