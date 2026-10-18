/**
 * Runs the data flow tests (*.test.js in this folder) inside the editor in a
 * headless browser and prints the results. Exits non-zero on any failure.
 *
 * Usage: node run.js [url] [test file name filter]
 *
 * The editor must be served over HTTP, e.g. from the repository root:
 *   python3 -m http.server 8080 --bind 127.0.0.1 --directory src/main/webapp
 * The default URL is http://127.0.0.1:8080/?dev=1 (sources). Run it without
 * dev=1 to test the built bundles.
 *
 * Environment:
 *   DATAFLOW_TEST_BROWSER     firefox (default) or chrome
 *   DATAFLOW_TEST_EXECUTABLE  browser executable (default /usr/bin/firefox)
 *   DATAFLOW_TEST_PROFILE     profile directory (needed for snap Firefox,
 *                             which cannot use /tmp: use a folder under
 *                             ~/snap/firefox/common)
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const url = process.argv[2] || 'http://127.0.0.1:8080/?dev=1';
const filter = process.argv[3] || '';

(async () =>
{
	const options = {browser: process.env.DATAFLOW_TEST_BROWSER || 'firefox',
		executablePath: process.env.DATAFLOW_TEST_EXECUTABLE || '/usr/bin/firefox',
		headless: true};

	if (process.env.DATAFLOW_TEST_PROFILE)
	{
		options.userDataDir = process.env.DATAFLOW_TEST_PROFILE;
	}

	const browser = await puppeteer.launch(options);
	let failed = 0;

	try
	{
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.setViewport({width: 1400, height: 900});
		await page.goto(url, {waitUntil: 'load', timeout: 120000});
		// Waits for the editor UI, which plugins receive once it exists
		await page.waitForFunction(() =>
		{
			if (window.App == null || !App.isMainCalled || window.DataFlowCatalog == null)
			{
				return false;
			}
			else if (!window.dataFlowTestQueued)
			{
				window.dataFlowTestQueued = true;
				Draw.loadPlugin((ui) => { window.dataFlowTestUi = ui; });
			}

			return window.dataFlowTestUi != null;
		}, {timeout: 120000, polling: 250});
		// Evaluated rather than added as script tags, which the editor's
		// Content-Security-Policy blocks
		await page.evaluate(fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8'));

		const files = fs.readdirSync(__dirname).filter((f) =>
			f.endsWith('.test.js') && f.indexOf(filter) >= 0).sort();

		for (const file of files)
		{
			await page.evaluate(fs.readFileSync(path.join(__dirname, file), 'utf8'));
		}

		const results = await page.evaluate(() => DataFlowTest.run());

		for (const r of results)
		{
			console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n      ' + r.error));
			failed += r.ok ? 0 : 1;
		}

		const notes = await page.evaluate(() => DataFlowTest.notes);

		if (notes.length > 0)
		{
			console.log('\nNotes:\n  ' + notes.join('\n  '));
		}

		if (errors.length > 0)
		{
			console.log('Page errors:\n  ' + errors.join('\n  '));
			failed += errors.length;
		}

		console.log('\n' + (results.length - (failed - errors.length)) + '/' + results.length +
			' passed (' + url + ')');
	}
	finally
	{
		await browser.close();
	}

	process.exit(failed > 0 ? 1 : 0);
})().catch((e) =>
{
	console.error('FAILED', e);
	process.exit(1);
});
