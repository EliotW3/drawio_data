/**
 * Prepares the desktop app build (replaces upstream's sync.cjs, which
 * expected the web app as a git submodule):
 * - copies the web app of this repository (../src/main/webapp) to
 *   drawio/src/main/webapp, where src/main/electron.js loads it from;
 * - copies ../VERSION to drawio/VERSION and into package.json;
 * - turns automatic updates off. They would download upstream draw.io
 *   releases and replace this fork.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const source = path.join(repo, 'src', 'main', 'webapp');
const target = path.join(root, 'drawio', 'src', 'main', 'webapp');
const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();

if (!/^\d+\.\d+\.\d+$/.test(version))
{
	console.error('Invalid VERSION: "' + version + '"');
	process.exit(1);
}

if (!fs.existsSync(path.join(source, 'js', 'app.min.js')))
{
	console.error('Missing ' + path.join(source, 'js', 'app.min.js') + ': build the web app first (cd etc/build && ant).');
	process.exit(1);
}

fs.rmSync(path.join(root, 'drawio'), {recursive: true, force: true});
fs.mkdirSync(target, {recursive: true});
fs.cpSync(source, target, {recursive: true, filter: function(src)
{
	// Server-side files are not part of the desktop app
	return path.basename(src) != 'WEB-INF';
}});
fs.writeFileSync(path.join(root, 'drawio', 'VERSION'), version + '\n', 'utf8');

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

fs.writeFileSync(path.join(root, 'src', 'main', 'disableUpdate.js'),
	'export function disableUpdate() { return true; }\n', 'utf8');

console.log('Prepared drawio-data ' + version + ' from ' + source);
