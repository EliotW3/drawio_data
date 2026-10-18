# draw.io (`drawio_data`) — Architecture and Code Guide

> A reference to how this fork of draw.io works, organised so that each subsystem has a stable section number to cite in discussions and change requests (e.g. "see §7.1 file format"). Code locations are given as repository-relative links. The document was written against upstream **version 32.5.5** (see [VERSION](../VERSION)). Line numbers were last updated with CHG-007 and will drift as the code changes. Function names are the reliable anchors.
>
> **Fork changes** are recorded in [CHANGES.md](CHANGES.md) (one `CHG-NNN` entry per change, with its impact). When a change alters behaviour described here, the relevant section is updated in the same change and notes the entry ID.

## Contents

1. [Overview](#1-overview)
2. [Repository Map](#2-repository-map)
3. [Build System and Release Artefacts](#3-build-system-and-release-artefacts)
4. [Startup and Bootstrapping](#4-startup-and-bootstrapping)
5. [mxGraph Core Library](#5-mxgraph-core-library-mxgraph)
6. [The Graph Editor Layer](#6-the-graph-editor-layer-jsgrapheditor)
7. [The Application Layer](#7-the-application-layer-jsdiagramly)
8. [Shapes, Stencils and Shape Libraries](#8-shapes-stencils-and-shape-libraries)
9. [Embedding and Integration](#9-embedding-and-integration)
10. [Files, Storage Back-ends and Libraries](#10-files-storage-back-ends-and-libraries)
11. [Synchronisation and Real-time Collaboration](#11-synchronisation-and-real-time-collaboration)
12. [Import, Export, Layout and Text-to-Diagram Extensions](#12-import-export-layout-and-text-to-diagram-extensions)
13. [Static Assets, Styling, UI Text and Offline Support](#13-static-assets-styling-ui-text-and-offline-support)
14. [Plugins](#14-plugins)
15. [Java Server (Servlets)](#15-java-server-servlets)
16. [Security Model](#16-security-model)
17. [Cross-cutting Conventions](#17-cross-cutting-conventions)
18. [How-to Guide for Common Changes](#18-how-to-guide-for-common-changes)
19. [Glossary](#19-glossary)
20. [Data Flow Diagrams (fork feature)](#20-data-flow-diagrams-fork-feature)

---

## 1. Overview

draw.io is a **browser-based diagram editor written in plain JavaScript**: global constructors, prototype inheritance, ES5 style, no framework and no module system. An optional, very small **Java servlet backend** handles OAuth token exchange, a CORS/image proxy, export proxying and logging. The same front-end code runs as:

- the full web app (app.diagrams.net),
- an editor embedded in other products via `postMessage` (Confluence, Jira, VS Code, Nextcloud, …),
- a read-only viewer and lightbox (`viewer.min.js`),
- the Electron desktop app (drawio-desktop, a separate repository), and
- a headless export renderer (`export3.html`).

The front end is a stack of four layers. Each upper layer **patches the prototypes of the layers below it** rather than wrapping them:

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ App (js/diagramly/App.js)                                                │  storage clients, start-up flow,
 │   App.main → new App(new Editor(...))                                    │  splash, plugins, licensing
 ├──────────────────────────────────────────────────────────────────────────┤
 │ diagramly layer (js/diagramly/*)                                         │  multi-page files, file classes,
 │   Editor/EditorUi/Graph extensions, Pages, DrawioFile*, sync, dialogs,   │  sync & collaboration, import/export,
 │   menus, themes, sidebars, embed protocol, viewer                        │  embed protocol, AI, themes
 ├──────────────────────────────────────────────────────────────────────────┤
 │ grapheditor layer (js/grapheditor/*)                                     │  generic editor: Graph, EditorUi,
 │   Editor, EditorUi, Graph, Shapes, Actions, Menus, Toolbar, Sidebar,     │  actions/menus, format panel,
 │   Format, Dialogs, InlineToolbar                                         │  sidebar, shapes, handlers
 ├──────────────────────────────────────────────────────────────────────────┤
 │ mxGraph (mxgraph/src/*)                                                  │  model, view, renderer, SVG canvas,
 │   mxGraphModel, mxGraph, mxGraphView, mxCellRenderer, handlers, codecs   │  interaction handlers, XML codec
 └──────────────────────────────────────────────────────────────────────────┘
        + vendored libraries: DOMPurify, pako, CryptoJS, rough.js, perfect-freehand, spin.js,
          JSZip, MathJax, ELK, libavoid, Mermaid/PlantUML/Gliffy/VSD converters, SimplePeer
```

**The flow of one edit, end to end:**

1. A user gesture (a handler in `mxgraph/src/handler`, or an action in `Actions.js`) calls a `Graph` method, which mutates `mxGraphModel` inside `beginUpdate()/endUpdate()` ([§5.1](#51-model-model)).
2. `endUpdate` fires `mxEvent.CHANGE`. `mxGraph` invalidates and revalidates the `mxGraphView`, and `mxCellRenderer` repaints the SVG ([§5.3](#53-view-and-rendering-pipeline-view-shape)).
3. The same event fires `UNDO`, and `Editor.undoManager` records the edit ([§6.1](#61-editor-grapheditoreditorjs)).
4. `EditorUi` refreshes action states, the Format panel and the status bar ([§6.2](#62-editorui-grapheditoreditoruijs)).
5. The current `DrawioFile` hears the change through `fileChanged()`, marks itself modified and schedules **autosave**. In collaborative mode it also diffs the pages and sends a live patch ([§10](#10-files-storage-back-ends-and-libraries), [§11](#11-synchronisation-and-real-time-collaboration)).
6. Saving serialises all pages to an `<mxfile>` ([§7.1](#71-the-file-format-mxfile--diagram--mxgraphmodel)) and writes it through the storage client: Google Drive, OneDrive, GitHub, device, browser, or the embedding host.

**Things specific to this public build** that you will meet:

- `PreConfig.js`, which is loaded on any host other than the official ones and therefore on a self-hosted copy, forces `sync = manual`.
- **All export is client-side.** VSDX export and server-side (export-service) export have been removed from this fork (CHG-001, [CHANGES.md](CHANGES.md)). PDF uses the browser print dialog.
- **The UI is English only.** All translations and the language picker have been removed; `resources/dia.txt` is the single string bundle (CHG-002, [§13.3](#133-ui-text-resources)).
- The stencil XML sources, the collaboration relay and cache servers, `OrgSettings.js` and the Atlassian/monday plugins are **not in this repository**.
- The committed `js/*.min.js` bundles were rebuilt after CHG-001 and CHG-002, so normal mode and `?dev=1` run the same code. Rebuild them (`cd etc/build && ant`, [§3](#3-build-system-and-release-artefacts)) whenever you change a source file.
- Upstream does not accept pull requests (README). This fork is the place to make changes.

---

## 2. Repository Map

```
drawio_data/
├── README.md, LICENSE, SECURITY.md, CODE_OF_CONDUCT.md, CITATION.cff
├── VERSION                      current release (32.5.5), stamped into bundles at build time
├── ChangeLog                    release-by-release change log (the "why" behind most code)
├── teams.html                   placeholder ("dummy")
├── .github/                     CI (war.yml: build the WAR on tags), stale bot, issue templates
├── .travis.yml                  legacy CI (ant war → GitHub release)
├── docs/
│   ├── ARCHITECTURE.md          ← this document
│   ├── CHANGES.md               log of every change made in this fork (CHG-NNN)
│   ├── DATAFLOW.md              design spec of the data flow diagrams                   §20
│   ├── code-review.md           review checklist
│   └── dialog-style-guide.md    rules for building dialogs (§17.6)
├── etc/
│   ├── build/                   build.xml, build.properties, compiler.jar (Closure)      §3
│   ├── integrate/Integrate.js   bootstrap appended to integrate.min.js                   §3.3
│   ├── dependencies/            vendored-library manifest + DOMPurify smoke test        §3.3
│   ├── imageResize/             Node CLI to shrink embedded images in .drawio files      §3.3
│   └── test/dataflow/           headless browser tests of the data flow diagrams        §20.8
└── src/main/
    ├── server/java/com/mxgraph/online/   Java servlets (OAuth, proxy, embed, log)          §15
    └── webapp/                            the deployable web root (= the WAR contents)
        ├── index.html, teams.html         editor entry pages                              §4.1
        ├── export3.html, open.html, clear.html, onedrive3.html, vsdxImporter.html
        ├── service-worker.js, workbox-*   generated PWA service worker                     §13.7
        ├── WEB-INF/                        web.xml, appengine-web.xml, lib/*.jar, secret placeholders
        ├── js/
        │   ├── bootstrap.js, main.js, PreConfig.js, PostConfig.js                          §4
        │   ├── grapheditor/   generic editor layer (Editor, EditorUi, Graph, Format, …)    §6
        │   ├── diagramly/     application layer (App, files, sync, dialogs, menus, …)      §7–§12
        │   │   ├── dataflow/  data flow diagrams (fork feature)                            §20
        │   │   ├── sidebar/   68 shape-library definitions + sidebar extensions            §8.4
        │   │   ├── vsdx/ emf/ graphml/ miro/   importers                                    §12.1
        │   │   ├── gif/       animated GIF/MP4 export                                      §12.2
        │   │   └── util/      extra canvases (mxJsCanvas, mxAsyncCanvas)                   §12.2
        │   ├── onedrive/      OneDrive SDK + inline picker
        │   ├── orgchart/ elk/ libavoid-js/   layout engines                                 §12.3
        │   ├── mermaid/ plantuml/ gliffy/ vsd/   prebuilt text/format converters            §12.1
        │   ├── deflate/ sanitizer/ cryptojs/ rough/ freehand/ spin/ jszip/ jquery/ simplepeer/   vendor libs
        │   ├── export.js, export-init.js, open.js, clear.js, vsdxImporter.js, math-print.js, embed.dev.js
        │   └── *.min.js       COMMITTED BUILD OUTPUTS: app, viewer, viewer-static, extensions,
        │                      integrate, shapes-14-6-5, stencils, orgchart                     §3.2
        ├── mxgraph/           mxGraph library: src/ (sources), mxClient.js (bundle), css/, images/   §5
        ├── shapes/            49 domain shape files (AWS3D, BPMN, mockups, P&ID, …)            §8.1
        ├── stencils/          only LICENSE + clipart (XML sources not public, see stencils.min.js)
        ├── styles/            grapheditor.css, default.xml stylesheet, high-contrast, fonts    §13.1
        ├── resources/         dia.txt: every UI string (English only, CHG-002)                §13.3
        ├── templates/         index.xml + 155 template diagrams with previews                  §13.4
        ├── plugins/           optional plugins loaded with ?p=                                 §14
        ├── connect/common/js/mxReader.js   Atlassian Connect viewer                            §9.4
        ├── img/               ~2,100 shape icons and clip art (img/lib/…)                       §8.3
        ├── images/            UI icons, logos, PWA manifest                                    §13.2
        └── math4/es5/         MathJax 4 bundle                                                 §13.5
```

**Size**: about 3,140 tracked files. About 2,400 of them are images, template diagrams and other assets. The hand-written JavaScript is about 510k lines: mxGraph ≈ 90k (`mxgraph/src`), grapheditor ≈ 95k, diagramly ≈ 237k (including the sidebars, the Visio/Lucid/GraphML importers and the realtime code), domain shapes ≈ 77k, and other scripts and plugins ≈ 12k. The Java servlets are about 4.7k lines. The rest is committed minified bundles and vendor libraries.

---

## 3. Build System and Release Artefacts

### 3.1 Toolchain

The build is a single Apache Ant file, [etc/build/build.xml](../etc/build/build.xml), which drives the Google Closure Compiler ([etc/build/compiler.jar](../etc/build/compiler.jar)) in `SIMPLE` mode. Paths come from [etc/build/build.properties](../etc/build/build.properties) (an optional `build.properties.local` overrides it):

```properties
src.dir=${basedir}/../../src/main/server/java
war.dir=${basedir}/../../src/main/webapp
grapheditor.dir=${war.dir}/js/grapheditor
javac.dir=${war.dir}/WEB-INF/classes
war.name=draw.war
```

There is **no npm/webpack build** for the application. Every source file is plain ES5-style JavaScript using global constructors and `prototype` assignment, and the minified bundles are concatenations of Closure-compiled sources plus pre-minified vendor libraries. The compiled bundles are **committed to the repository** (`js/app.min.js`, `js/viewer.min.js`, …). If you edit a source file and run in production mode without rebuilding, your change will not be visible. Use `?dev=1` (see [§4.3](#43-development-mode-dev1)) while developing, and rebuild before committing. On the development machine a per-user JDK 21 and Ant 1.10.14 are installed in `~/.local/opt`: `export JAVA_HOME=~/.local/opt/jdk-21.0.12.1+1 PATH=$JAVA_HOME/bin:~/.local/opt/apache-ant-1.10.14/bin:$PATH`, then `cd etc/build && ant` (about 35 s).

CI ([.github/workflows/war.yml](../.github/workflows/war.yml), and the legacy [.travis.yml](../.travis.yml)) runs `ant war` on JDK 8 when a `v*` tag is pushed and attaches `build/draw.war` to a GitHub release. [.github/workflows/stale.yml](../.github/workflows/stale.yml) is an issue-housekeeping bot.

### 3.2 Ant targets and the bundles they produce

The dependency chain is `merge → extensions → app → atlas → integrate → all`, with `javac` and `war` as separate targets.

| Target | Inputs | Output (in `src/main/webapp/js/`) |
|---|---|---|
| `merge` | every `shapes/**/*.js` (+ `stencils/**/*.js`) | `shapes-14-6-5.min.js`. `stencils.min.js` is only regenerated (via `Xml2Js`) if stencil XML sources exist; the public repo ships the prebuilt file. |
| `extensions` | `diagramly/Extensions.js`, `vsdx/bmpDecoder.js`, `vsdx/importer.js`, `emf/emf-svg.js`, `graphml/mxGraphMlCodec.js`, `miro/MiroImporter.js`, then appends JSZip, `vsd/drawio-vsd.min.js`, ELK + `ElkLayout.js`, Mermaid, `orgchart.min.js`, libavoid + `LibavoidRouting.js` | `extensions.min.js` (lazy-loaded import/export/layout features), `orgchart.min.js` |
| `app` | see below | `viewer.min.js`, `viewer-static.min.js`, `app.min.js` |
| `atlas` | `base.min.js` + `extensions.min.js` + `connect/common/js/mxReader.js` + `Simple.js` | `atlas.min.js`, `atlas-viewer.min.js` (temporary, deleted by `all`) |
| `integrate` | `atlas.min.js` + shapes + stencils + [etc/integrate/Integrate.js](../etc/integrate/Integrate.js) | `integrate.min.js` (a self-contained bundle for third-party integrations) |
| `javac` | `src/main/server/java/**` | `WEB-INF/classes` |
| `war` | `app` + `javac` | `build/draw.war` (a zip of `src/main/webapp`) |

The `app` target does the main work:

1. It writes a runtime-config snippet that sets `PROXY_URL`, `STYLE_PATH`, `SHAPES_PATH`, `STENCIL_PATH`, `DRAW_MATH_URL`, `GRAPH_IMAGE_PATH`, `mxBasePath` and so on, defaulting to `https://viewer.diagrams.net/...`. This snippet is used only by the viewer bundles.
2. It generates `Graph-Stylesheet.js` by inlining [styles/default.xml](../src/main/webapp/styles/default.xml) as `Graph.prototype.defaultThemes['default-style2']`. The same theme is aliased as `darkTheme`.
3. It generates `Graph-Resources.js` by inlining [resources/dia.txt](../src/main/webapp/resources/dia.txt) as `mxResources.parse(...)`. This means the English strings are baked into the viewer.
4. It compiles `grapheditor/*.js` → `grapheditor.min.js` in this order: `Editor, EditorUi, Sidebar, Graph, InlineToolbar, Format, Shapes, Actions, Menus, Toolbar, Dialogs`.
5. It compiles all `diagramly/sidebar/Sidebar-*.js` → `sidebar.min.js`.
6. It compiles `deflate/base64.js`, `diagramly/Init.js`, `grapheditor/Init.js` and `mxgraph/mxClient.js` → `client.min.js`.
7. **Viewer**: it builds `base-viewer.min.js` from the config, `spin`, `purify`, `pako`, `rough`, the client and a viewer-only subset (`grapheditor/{Editor,EditorUi,Graph,Shapes,Actions}`, `diagramly/{DrawioFile,LocalFile,Editor,EditorUi,Pages,Trees,Minimal,DrawioComment,DrawioUser}`, the generated resources/stylesheet, and `GraphViewer.js`). It then appends a bootstrap that calls `Editor.initMath()` followed by `GraphViewer.processElements()` (or `window.onDrawioViewerLoad`). The result is `viewer.min.js`. `viewer-static.min.js` additionally embeds `shapes-14-6-5.min.js`, sets `mxStencilRegistry.allowEval = false`, and registers the service worker.
8. **App**: it compiles all of `diagramly/*` (files, editor, UI, sync, cloud clients, `App.js`, `Menus.js`, `Pages.js`, `Trees.js`, `Minimal.js`, `mxRuler.js`, `mxFreehand.js`, `P2PCollab.js`, `Simple.js`, gif/mp4 export, `mxODPicker.js`), concatenates them with vendor libraries (`spin`, `purify`, `aes` (crypto-js), `pako`, `rough`, `perfect-freehand`) and `client` + `grapheditor` + `sidebar` → `app.min.js`. The token `@DRAWIO-VERSION@` is replaced with the contents of [VERSION](../VERSION) (currently `32.5.5`).

> **Load-order matters.** Because everything is global and prototype-patched, the order in `build.xml` and in `Devel.js` *is* the dependency graph: the `grapheditor` layer must load before the `diagramly` layer, which overrides it. If you add a new source file, add it to **both** `etc/build/build.xml` and `js/diagramly/Devel.js`.

### 3.3 Helper scripts in `etc/`

| Path | Purpose |
|---|---|
| [etc/integrate/Integrate.js](../etc/integrate/Integrate.js) | Appended to `integrate.min.js`. It disables eval for stencils, turns off the page view and scrollbars by default, enables settings and the scratchpad, overrides `EditorUi.convertImageToDataUri` (using `PROXY_URL` with `&base64=1` to avoid tainted canvases), then calls `window.mxIntegrateCallback()`. |
| [etc/dependencies/package.json](../etc/dependencies/package.json) | A dummy manifest listing the vendored JS libraries (jsZip, perfect-freehand, jQuery, pako, crypto-js, DOMPurify, spin.js, roughjs, MathJax) so that GitHub's dependency scanning can flag CVEs. Nothing installs from it. |
| [etc/dependencies/dompurify-smoke.js](../etc/dependencies/dompurify-smoke.js) | A Node/jsdom regression harness to run when upgrading DOMPurify. It extracts `DOM_PURIFY_CONFIG` from `grapheditor/Init.js`, reproduces the `afterSanitizeAttributes` hooks from `Graph.js`, checks that a list of XSS payloads is neutralised (including mutation-XSS after a re-parse), and diffs sanitiser output for every HTML label in `templates/`. |
| [etc/imageResize/](../etc/imageResize/) | A standalone Node CLI (`sharp` + `yargs`) that shrinks embedded `data:image/png|jpeg` URIs inside an *uncompressed* `.drawio` file. |
| [etc/build/compiler.jar](../etc/build/compiler.jar) | The Closure Compiler. |

### 3.4 Repository metadata

[README.md](../README.md) (licence: Apache 2.0 for code, with restricted use of icons/stencils in Atlassian products; no PRs accepted upstream), [SECURITY.md](../SECURITY.md), [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md), [CITATION.cff](../CITATION.cff), [LICENSE](../LICENSE), [VERSION](../VERSION) and [ChangeLog](../ChangeLog), which is a 16k-line reverse-chronological release log and is the best place to find *why* a behaviour exists (search it for an issue number or a feature name). [docs/code-review.md](code-review.md) is a generic review checklist. [docs/dialog-style-guide.md](dialog-style-guide.md) is the authoritative guide to building dialogs (see [§17.6](#176-dialog-conventions)). The root `teams.html` contains the single word `dummy`.

---

## 4. Startup and Bootstrapping

### 4.1 Entry pages

| Page | Purpose |
|---|---|
| [index.html](../src/main/webapp/index.html) | The editor. It contains only a splash logo (`#geInfo`), a `#geStatus` area for load errors, `styles/grapheditor.css`, the high-contrast stylesheet, and two scripts: `js/bootstrap.js` and `js/main.js`. Everything else is injected. |
| [teams.html](../src/main/webapp/teams.html) | A copy of `index.html` that differs only in its `<noscript>` text (by its name, the entry page for the Microsoft Teams integration). |
| [open.html](../src/main/webapp/open.html) + [js/open.js](../src/main/webapp/js/open.js) | A legacy `<form>` upload dialog (used in an iframe). The uploaded file reaches the editor through `window.parent.openFile` (see `OpenFile` in [§6.1](#61-editor-grapheditoreditorjs)). |
| [export3.html](../src/main/webapp/export3.html) + [js/export-init.js](../src/main/webapp/js/export-init.js) + [js/export.js](../src/main/webapp/js/export.js) | A headless rendering page that loads `app.min.js` + `extensions.min.js`. The web app no longer uses it (CHG-001); it is kept for drawio-desktop's local export pipeline (see [§13.6](#136-headless-rendering-page-export3html)). |
| [clear.html](../src/main/webapp/clear.html) + [js/clear.js](../src/main/webapp/js/clear.js) | Unregisters all service workers (clearing the offline cache), then loads `clear.draw.io` or `clear.diagrams.net` in a hidden iframe to clear the sibling domain too. |
| [onedrive3.html](../src/main/webapp/onedrive3.html) | The OAuth popup redirect for the OneDrive implicit flow. It reads `access_token` from the URL fragment and calls `window.opener.onOneDriveCallback(token, window)`. |
| [vsdxImporter.html](../src/main/webapp/vsdxImporter.html) + [js/vsdxImporter.js](../src/main/webapp/js/vsdxImporter.js) | A headless VSDX→XML importer. Nothing in this repo links to it. drawio-desktop's command-line export uses it through Electron messages (`import` → `import-success`/`import-error`), and headless tools can drive its file input. |
| [js/math-print.js](../src/main/webapp/js/math-print.js) | Loaded into the print-preview window. It configures the `DrawioMathJax` bundle from `window.opener.DRAW_MATH_URL` and adds the selectable text layer for math in printed PDFs. |
| [js/embed.dev.js](../src/main/webapp/js/embed.dev.js) | The unminified client of the legacy embed script. It is an IIFE `(stylesheet, stencils)` that finds `.mxgraph` divs on a host page, creates a read-only graph in each (with toolbar, lightbox and MathJax support), and calls the `mxClientOnLoad`/`mxClientOnCreate` callbacks. `EmbedServlet2` serves the equivalent for `/embed2.js` ([§15.4](#154-embedservlet2)). |
| [service-worker.js](../src/main/webapp/service-worker.js) | The generated PWA service worker (precache manifest; see [§13.7](#137-pwa--service-worker)). `workbox-05b6c01b.js` and the `.map` files are unreferenced leftovers of the earlier Workbox runtime. |

### 4.2 `bootstrap.js`: URL parameters, redirects and script loading

[js/bootstrap.js](../src/main/webapp/js/bootstrap.js) runs first. It:

1. Parses `window.location.search` into the global **`urlParams`** object. Almost every feature reads `urlParams[...]`. A hash of the form `#P{json}` can also carry parameters, which lets CDN-cached URLs pass parameters.
2. Detects Electron (`mxIsElectron`) and redirects the old hosts (`draw.io`, `rt.draw.io`, `drive.draw.io`) to `app.diagrams.net` unless `dev=1`.
3. Defines the global loader helpers **`mxscript(src, onLoad, id, dataAppKey, noWrite, onError)`** (a deferred `<script>`, or `document.write` in dev mode), `mxinclude` (async) and `mxmeta`.
4. Sets `isLocalStorage` and handles the `?channel=stable|beta` release-channel pin.
5. Loads the code in one of two ways:
   - **Production**: `js/PreConfig.js` (on non-`*.draw.io`/`*.diagrams.net` hosts, or in Electron), then `js/app.min.js`, then (Electron only) `DesktopLibrary`, `ElectronApp`, `extensions`, `stencils`, `shapes`, `plantuml`, then `PostConfig.js` (again only off the official hosts or in Electron). Once `app.min.js` has loaded **and** `window.load` has fired, `checkAllLoaded()` calls **`App.main()`**.
   - **Development (`?dev=1`)**: `PreConfig.js`, `diagramly/Init.js`, `grapheditor/Init.js`, `mxgraph/src/mxClient.js` (which itself includes every mxGraph source file), then **`js/diagramly/Devel.js`**, which `mxscript`s every unminified source file in dependency order, then `PostConfig.js`.

[js/main.js](../src/main/webapp/js/main.js) adds the `load` listener that sets `mxWinLoaded` and calls `checkAllLoaded()`.

### 4.3 Development mode (`?dev=1`)

[js/diagramly/Devel.js](../src/main/webapp/js/diagramly/Devel.js) is the **dev-mode manifest**, the unminified equivalent of the bundles in `build.xml`. It also contains the canonical **Content-Security-Policy** definitions (the `CSP-POLICIES-BEGIN/END` block) for every production host. With `?print-csp=1` it prints them to the console. The CSP whitelists Google APIs, GitHub, GitLab, Microsoft Graph/OneDrive/SharePoint, Trello, OpenAI and Anthropic (`api.anthropic.com`) for the AI features, and Google Fonts.

To run the app from source, serve `src/main/webapp` over HTTP and open `index.html?dev=1`. No build step is needed. Useful developer parameters, documented at the top of `bootstrap.js` and throughout the code, include `test=1` (debug logging via `EditorUi.debug`), `ui=classic|kennedy|sketch|simple|min|atlas`, `offline=1`, `local=1`, `embed=1`, `lightbox=1`, `chrome=0`, `p=<plugin ids>`, `sync=none|manual|auto`, `math=0`, `splash=0`, `mode=google|onedrive|github|gitlab|device|browser`.

### 4.4 Runtime configuration globals (`PreConfig.js`, `Init.js` × 2, `PostConfig.js`)

Configuration is layered through **global `window.*` variables**. Most files set a value only if it is still unset (`window.X = window.X || default`), so the earliest assignment usually wins. `PostConfig.js` is the exception:

1. [js/PreConfig.js](../src/main/webapp/js/PreConfig.js) is the **deployment hook**. It is loaded on every host except `*.draw.io`/`*.diagrams.net` and in Electron, so it always applies to a self-hosted copy. It sets `DRAWIO_PUBLIC_BUILD = true`, `DRAWIO_BASE_URL`, `DRAWIO_VIEWER_URL`, `DRAWIO_LIGHTBOX_URL`, `DRAW_MATH_URL = 'math4/es5'`, `DRAWIO_CONFIG = null` (a global JSON configuration, see [§7.2](#72-editorconfigure-and-the-configuration-object)), and forces `urlParams['sync'] = 'manual'`. **This is the file to edit for a self-hosted deployment.**
2. [js/diagramly/Init.js](../src/main/webapp/js/diagramly/Init.js) sets the URLs (`DRAWIO_SERVER_URL`, `PROXY_URL`, `SAVE_URL`, `REALTIME_URL`, `RT_WEBSOCKET_URL`, `NOTIFICATIONS_URL`, `ICONSEARCH_PATH`, `ICON_SERVICE_PATH`, `TEMPLATE_PATH`, `SHAPES_PATH`, `RESOURCES_PATH`, GitHub/GitLab client IDs) and `ALLOW_CUSTOM_PLUGINS`. The UI is English only ([CHG-002](CHANGES.md#chg-002--english-only-user-interface)): it sets `mxLanguage = 'en'` and `mxLanguages = []`, so `?lang`, stored settings and the browser language are ignored. It also resolves `uiTheme` (`?ui` or the stored setting) and normalises the parameter combinations:
   - `lightbox=1` ⇒ `chrome=0`
   - `embedInline=1` ⇒ `embed=1, ui=sketch, plugins=0, proto=json`
   - `configure=1` without `embed=1` is ignored (a security measure)
   - `offline`/`demo`/`stealth`/`local`/`lockdown` ⇒ all cloud storages disabled
   - the `viewer.diagrams.net` host ⇒ lightbox; the `embed.diagrams.net` host ⇒ embed

3. [js/grapheditor/Init.js](../src/main/webapp/js/grapheditor/Init.js) defines **`DOM_PURIFY_CONFIG`** (the HTML sanitiser policy for labels: data attributes are denied by default, an explicit allow-list follows, and `javascript:` is rejected anywhere), `MAX_REQUEST_SIZE`, `MAX_AREA`, and the base paths (`STENCIL_PATH`, `IMAGE_PATH`, `STYLE_PATH`, `mxBasePath`).
4. [js/PostConfig.js](../src/main/webapp/js/PostConfig.js) (loaded on the same hosts as `PreConfig.js`) runs last and unconditionally nulls `ICONSEARCH_PATH`/`ICON_SERVICE_PATH` (there is no icon search backend in the public build).

### 4.5 `App.main()`: the startup sequence

[App.main](../src/main/webapp/js/diagramly/App.js#L949) (in `diagramly/App.js`) is the real program entry point. In order:

1. It guards against being called twice and checks the Electron runtime. It calls `Editor.loadCompatibleCss()` (a fallback for browsers without `light-dark()`) and installs a pre-app `window.onerror`.
2. It blocks stand-alone use of `import.diagrams.net`, `ac.draw.io` and `aj.draw.io`, removes the splash for embed/lightbox, and adds the `geEmbed` body class.
3. **Service worker**: it registers `service-worker.js` (or `stable/service-worker.js` on the stable channel), updates it, or uninstalls it (`offline=0`, dev mode). Failures are counted per day, and after 14 days of failures the stable channel reverts to beta.
4. It loads SimplePeer (for `fast-sync=1`) and **plugins**: `?p=id;id` through `App.pluginRegistry`, plus `mxSettings.getPlugins()` (only same-domain plugins, and only built-in ones unless `ALLOW_CUSTOM_PLUGINS`). Plugins call `Draw.loadPlugin(function(ui){...})`. Until the UI exists they are queued in `App.DrawPlugins` ([§14](#14-plugins)).
5. It loads the Google API (`gapi`) if Drive is enabled, and starts MathJax with `Editor.initMath()`.
6. **Configuration**:
   - With `configure=1` it posts `{event:'configure'}` to the opener/parent and waits for `{action:'configure', config}`.
   - Otherwise it applies `window.DRAWIO_CONFIG`, then `localStorage[Editor.configurationKey]` (merged on top of any cached organisation settings), through `Editor.configure()` and then `mxSettings.load()`.
7. `doMain()` applies `autosaveDelay`/`defaultEdgeLength` from settings, prefetches the default fonts, then `doLoad(bundle)`:
   - It fetches the **UI string bundle** `resources/dia.txt` (and in dev mode `styles/default.xml`) and calls `mxResources.parse()`.
   - It handles `#_CONFIG_<compressed json>` links, which set the local configuration after two confirmations.
   - In production it loads `shapes-14-6-5.min.js`, `stencils.min.js` and `extensions.min.js` (with `mxStencilRegistry.allowEval = false`), then calls `realMain()`.
8. `realMain()` picks the UI theme (`Editor.currentTheme`, which falls back to `kennedy`; `simple` is preferred on small screens on the official hosts), then creates the UI:

```js
var ui = (createUi != null) ? createUi() : new App(new Editor(
    urlParams['chrome'] == '0' || uiTheme == 'min',   // chromeless
    null, null, null, urlParams['chrome'] != '0'));    // editable
```

It also wires `window.launchQueue` (OS "open with" for the installed PWA) and lazy-loads Trello.

### 4.6 `App` construction → `init()` → `load()` → `start()`

[`App`](../src/main/webapp/js/diagramly/App.js#L10) extends `EditorUi` (`mxUtils.extend(App, EditorUi)`). The `EditorUi` constructor builds the DOM and calls `this.init()`, which `App.prototype.init` overrides ([App.js:1917](../src/main/webapp/js/diagramly/App.js#L1896)) to:

- create the **storage clients**: `this.gitHub`, `this.gitLab`, `this.oneDrive`, `this.m365` (both `OneDriveClient`), `this.trello`, and `this.drive` (`DriveClient`, once `gapi` has loaded). Each fires `clientLoaded`, and its `userChanged` refreshes the header and restores libraries.
- set the initial storage **mode** (`App.mode` from `?mode` or the stored `.mode`). It discards modes for removed storages such as Dropbox.
- run `DrawioFileSync.checkCacheAlive`, install the "fit on `fileLoaded`" listener, and run `updateHeader()`.

After `init`, the constructor runs plugin callbacks and calls **`this.load()`**, which (if not embedded) shows the "starting" spinner, waits for `gapi` when Drive is enabled, and then calls **`this.start()`** ([App.js:3943](../src/main/webapp/js/diagramly/App.js#L3922)). `start()`:

- restores libraries and installs the final `window.onerror` (errors are logged through `EditorUi.logError` and shown with `handleError`)
- listens to `hashchange` → `loadFile(newId)` (or a page switch if only `#…#{"pageId":…}` changed)
- handles, in priority order: `?desc=` (a CSV/descriptor import), legacy `?url=` → `#U…`, `client=1` (waits for XML via `postMessage`), `?create=` / `#create=` / `?smart-template=` (`executeCreateObject`, the create-from-template/AI flow), the Google Drive `state` parameter (open or create from Drive's UI), and otherwise either checks for **drafts**, loads the hash ID, shows the **splash/storage dialog**, or creates a blank file.

### 4.7 File addressing: the URL hash

The current diagram is identified by **`window.location.hash`**. The first character selects the storage ([App.loadFile](../src/main/webapp/js/diagramly/App.js#L6490), [App.storages](../src/main/webapp/js/diagramly/App.js#L266)):

| Prefix | Storage / meaning | Handled by |
|---|---|---|
| `#G<id>` | Google Drive file | `DriveClient.getFile` |
| `#W<id>` | OneDrive (personal) | `OneDriveClient` |
| `#M<id>` | Microsoft 365 / SharePoint | `OneDriveClient` (m365 instance) |
| `#H<owner/repo/ref/path>` | GitHub | `GitHubClient` |
| `#A<…>` | GitLab | `GitLabClient` |
| `#T<id>` | Trello attachment | `TrelloClient` |
| `#L<title>` | Browser storage (IndexedDB/localStorage) | `StorageFile` |
| `#U<url>` | Read-only URL (fetched directly or through `PROXY_URL`) | `App.loadTemplate` → `LocalFile` |
| `#R<data>` | Raw diagram XML (or compressed) in the URL | `LocalFile` |
| `#E…` | Embed draft (re-requested from the host through `remoteInvoke`) | `EmbedFile` |
| `#create=<json>` | Create from a JSON object (XML/CSV/Mermaid/AI prompt) | `executeCreateObject` |
| `#D…` | Dropbox (support ended, shows a notice) | — |
| `#S…` | Deprecated | — |

An optional second segment `#…#<encoded JSON>` stores view state such as `{"pageId": …}` (`getHashObject`/`setHashObject`). Opening a different file while the current one has unsaved changes asks for confirmation, or offers to open it in a new window (`PopupDialog`).

---

## 5. mxGraph Core Library (`mxgraph/`)

draw.io is built on **mxGraph**, JGraph's diagramming library. This repo carries a **heavily modernised fork** of it in [src/main/webapp/mxgraph/src/](../src/main/webapp/mxgraph/src/), and [mxgraph/mxClient.js](../src/main/webapp/mxgraph/mxClient.js) is its prebuilt single-file bundle (the one used by `build.xml`). The upstream overview is in [mxgraph/src/index.txt](../src/main/webapp/mxgraph/src/index.txt). [mxgraph/src/mxClient.js](../src/main/webapp/mxgraph/src/mxClient.js) defines the `mxClient` global (version, browser/OS flags such as `IS_IOS`, `IS_TOUCH` and `IS_SVG`, and `mxClient.include`), and in dev mode it includes every source file in dependency order. [mxgraph/css/](../src/main/webapp/mxgraph/css/) and [mxgraph/images/](../src/main/webapp/mxgraph/images/) hold the library's default CSS and handle/cursor images.

Everything is a global constructor. Classes inherit with `mxUtils.extend(Sub, Base)` and are customised by **monkey-patching prototypes**, which the draw.io layers above do extensively. The pattern used everywhere is:

```js
var graphFoo = Graph.prototype.foo;        // keep the original
Graph.prototype.foo = function()
{
    var result = graphFoo.apply(this, arguments);   // call super
    // ...extra behaviour...
    return result;
};
```

### 5.1 Model (`model/`)

- **[mxCell](../src/main/webapp/mxgraph/src/model/mxCell.js)** is a node in the diagram tree. Its fields are `id`, `value` (a string **or an XML element**: draw.io stores custom properties as attributes of an `<object>`/`<UserObject>` element), `geometry`, `style` (a string), `vertex`/`edge` flags, `parent`, `children`, `source`/`target` (for edges), `edges`, `visible`, `collapsed` and `connectable`.
- **[mxGeometry](../src/main/webapp/mxgraph/src/model/mxGeometry.js)** holds `x, y, width, height`, `relative` (relative children and edge labels), `offset`, `points` (edge waypoints), `sourcePoint`/`targetPoint`, and `alternateBounds` (folding).
- **[mxGraphModel](../src/main/webapp/mxgraph/src/model/mxGraphModel.js)** owns the tree. The structure is always **root cell → layers → content**, so the root's children are the layers (`isLayer`). Every mutation goes through an **undoable change object** (`mxChildChange`, `mxTerminalChange`, `mxValueChange`, `mxStyleChange`, `mxGeometryChange`, `mxCollapseChange`, `mxVisibleChange`, `mxRootChange`, `mxCellAttributeChange`), executed by `model.execute(change)` inside a transaction:

```js
model.beginUpdate();
try { model.setValue(cell, 'x'); model.setStyle(cell, 'fillColor=red'); }
finally { model.endUpdate(); }   // fires mxEvent.CHANGE once, then mxEvent.UNDO
```

`endUpdate()` at level 0 fires `BEFORE_UNDO`, then `CHANGE`/`NOTIFY` (via `edit.notify()`), then `UNDO` with the `mxUndoableEdit`. **Every feature that reacts to edits (autosave, realtime sync, Format panel refresh, action states) listens for these events.**
- [mxCellPath](../src/main/webapp/mxgraph/src/model/mxCellPath.js) provides path-based temporary cell IDs.

### 5.2 Serialisation (`io/`)

[mxCodec](../src/main/webapp/mxgraph/src/io/mxCodec.js) uses the per-class codecs in [mxCodecRegistry](../src/main/webapp/mxgraph/src/io/mxCodecRegistry.js) to turn objects into XML and back. [mxObjectCodec](../src/main/webapp/mxgraph/src/io/mxObjectCodec.js) is the generic reflective codec, hardened against prototype pollution (`isPollutionKey`) and restricted to an allow-list of constructors (`isConstructorAllowed`). [mxModelCodec](../src/main/webapp/mxgraph/src/io/mxModelCodec.js) writes the model as a **flat** `<root>` of `<mxCell>` elements, each with a `parent` attribute. When decoding it:

- ignores everything except `<root>` and `<defs>` (so malicious files cannot overwrite model internals),
- picks the real root among orphan cells (`selectRoot`, preferring id `0`) and adopts other orphans into the first layer (`adoptOrphanedCells`),
- supports optional **style compression**: repeated `image=data:…` or `shape=stencil(…)` values are moved into `<defs><def data="…"/></defs>` and referenced as `def(n)`.

[mxCellCodec](../src/main/webapp/mxgraph/src/io/mxCellCodec.js) handles user-object values: `<UserObject label="…" foo="bar"><mxCell …/></UserObject>`. The other codecs (`mxChildChangeCodec`, `mxTerminalChangeCodec`, `mxGenericChangeCodec`, `mxRootChangeCodec`) serialise change objects, and `mxStylesheetCodec` reads `styles/default.xml`.

A single-page diagram therefore serialises as:

```xml
<mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169" ...>
  <root>
    <mxCell id="0"/>                       <!-- root -->
    <mxCell id="1" parent="0"/>            <!-- default layer -->
    <mxCell id="2" value="Hello" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="3" edge="1" source="2" target="4" parent="1" style="edgeStyle=orthogonalEdgeStyle;">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

The multi-page `<mxfile>` wrapper is added by the draw.io layer ([§7.1](#71-the-file-format-mxfile--diagram--mxgraphmodel)).

### 5.3 View and rendering pipeline (`view/`, `shape/`)

The pipeline runs **model change → view invalidation → validation → render**:

1. [mxGraph.graphModelChanged](../src/main/webapp/mxgraph/src/view/mxGraph.js#L1961) calls `processChange()` for each change. This invalidates the affected [mxCellState](../src/main/webapp/mxgraph/src/view/mxCellState.js)s (a style change also sets `state.invalidStyle`) and then calls `view.validate()`.
2. [mxGraphView.validate](../src/main/webapp/mxgraph/src/view/mxGraphView.js#L1075) walks the invalid cells. The fork adds **incremental validation** (`invalidCells`, up to `maxInvalidCells = 1000`, otherwise a full walk) and stack-based dependency validation (`maxDependencyDepth`) for long chains of edges connected to edges. For each state it runs `validateCellStyle`, which calls `graph.getCellStyle(cell)`, then `updateCellState`, which computes absolute `x/y/width/height` from the parent origin, the relative geometry and `scale`/`translate`. For edges it also runs `updateEdgeState`, which computes terminal points, perimeter points and the edge-style routing into `state.absolutePoints`.
3. **Style resolution** ([mxGraph.getCellStyle](../src/main/webapp/mxgraph/src/view/mxGraph.js#L3416), [mxStylesheet.getCellStyle](../src/main/webapp/mxgraph/src/view/mxStylesheet.js#L217)) starts from the stylesheet's default vertex/edge style, then applies the cell's style string `name;key=value;key2=value2`. Bare tokens merge named styles from the stylesheet, `value=none` deletes a key, and numbers are parsed. `postProcessCellStyle` resolves image bundles and normalises data URIs. The draw.io `Graph` overrides this further ([§6.3](#63-graph-grapheditorgraphjs)).
4. [mxCellRenderer](../src/main/webapp/mxgraph/src/view/mxCellRenderer.js) creates and updates the DOM. In `createShape`, `style.shape` is looked up first in `mxCellRenderer.defaultShapes` (registered with `mxCellRenderer.registerShape(name, Ctor)`), then in **`mxStencilRegistry`** (XML stencils), and otherwise falls back to a rectangle (vertex) or `mxConnector` (edge). `configureShape` → `shape.apply(state)` copies style values onto the shape, then `redrawShape`, `redrawLabel` (an [mxText](../src/main/webapp/mxgraph/src/shape/mxText.js) shape), overlays and the folding control.
5. **Shapes** ([mxShape](../src/main/webapp/mxgraph/src/shape/mxShape.js) and subclasses: `mxRectangleShape`, `mxEllipse`, `mxRhombus`, `mxCylinder`, `mxActor`, `mxCloud`, `mxTriangle`, `mxHexagon`, `mxLine`, `mxPolyline`, `mxConnector`, `mxArrow`, `mxArrowConnector`, `mxSwimlane`, `mxLabel`, `mxImageShape`, `mxDoubleEllipse`, `mxText`) paint through an abstract **canvas** API: `c.rect()`, `c.moveTo()/lineTo()/curveTo()`, `c.fillAndStroke()`, `c.text()`. The live canvas is [mxSvgCanvas2D](../src/main/webapp/mxgraph/src/util/mxSvgCanvas2D.js) (SVG DOM). Because the same `paint()` code also draws into [mxXmlCanvas2D](../src/main/webapp/mxgraph/src/util/mxXmlCanvas2D.js) and the canvases in `diagramly/util/`, **one shape implementation serves the editor, SVG export, PDF and VSDX**. Subclasses usually override only `paintVertexShape(c, x, y, w, h)` or `redrawPath(path, x, y, w, h)`.
6. [mxStencil](../src/main/webapp/mxgraph/src/shape/mxStencil.js) interprets the XML stencil language (`<shape name w h aspect><connections/><background/><foreground/></shape>` with `path`, `rect`, `ellipse`, `text`, `image`, `fillstroke`, …). [mxStencilRegistry](../src/main/webapp/mxgraph/src/shape/mxStencilRegistry.js) maps `shape=mxgraph.aws4.lambda`-style names to stencils (draw.io adds dynamic loading, see [§6.3](#63-graph-grapheditorgraphjs)). [mxMarker](../src/main/webapp/mxgraph/src/shape/mxMarker.js) is the arrowhead registry.
7. **Model coordinates**: this fork's [mxGraphView.modelCoordinates](../src/main/webapp/mxgraph/src/view/mxGraphView.js#L137) option paints cells in model units inside a single transformed `drawPane`, so zooming and panning update one transform instead of repainting every cell.
8. **Colours**: [mxUtils](../src/main/webapp/mxgraph/src/util/mxUtils.js) handles CSS `light-dark(a, b)`, `var(--x)` and system colours (`isLightDarkColor`, `getLightDarkColor`, `getInverseColor`, `lightDarkColorSupported`). This is the basis of draw.io's dark mode and "adaptive colours".

Other view classes: [mxEdgeStyle](../src/main/webapp/mxgraph/src/view/mxEdgeStyle.js) (routing functions such as `orthogonalEdgeStyle`, `elbowEdgeStyle`, `entityRelationEdgeStyle`, `SegmentConnector`, `Loop`), [mxPerimeter](../src/main/webapp/mxgraph/src/view/mxPerimeter.js) (where edges meet a shape), [mxStyleRegistry](../src/main/webapp/mxgraph/src/view/mxStyleRegistry.js) (string → function lookup for edge styles and perimeters, with a null prototype), [mxCellEditor](../src/main/webapp/mxgraph/src/view/mxCellEditor.js) (in-place `contentEditable` label editor), [mxGraphSelectionModel](../src/main/webapp/mxgraph/src/view/mxGraphSelectionModel.js), [mxLayoutManager](../src/main/webapp/mxgraph/src/view/mxLayoutManager.js) (runs a cell's layout after changes, which drives `childLayout` styles), [mxSwimlaneManager](../src/main/webapp/mxgraph/src/view/mxSwimlaneManager.js), [mxOutline](../src/main/webapp/mxgraph/src/view/mxOutline.js) (the minimap), [mxPrintPreview](../src/main/webapp/mxgraph/src/view/mxPrintPreview.js) (multi-page printing), [mxTemporaryCellStates](../src/main/webapp/mxgraph/src/view/mxTemporaryCellStates.js) (off-screen states for export), [mxCellOverlay](../src/main/webapp/mxgraph/src/view/mxCellOverlay.js), [mxMultiplicity](../src/main/webapp/mxgraph/src/view/mxMultiplicity.js), [mxConnectionConstraint](../src/main/webapp/mxgraph/src/view/mxConnectionConstraint.js) (fixed connection points), [mxCellStatePreview](../src/main/webapp/mxgraph/src/view/mxCellStatePreview.js).

### 5.4 Interaction handlers (`handler/`)

[mxGraph.fireMouseEvent](../src/main/webapp/mxgraph/src/view/mxGraph.js#L14331) normalises mouse, touch and pointer events into [mxMouseEvent](../src/main/webapp/mxgraph/src/util/mxMouseEvent.js) objects, detects double-taps, and dispatches to `graph.mouseListeners` in registration order. That order is the creation order in [mxGraph.createHandlers](../src/main/webapp/mxgraph/src/view/mxGraph.js#L1689): `tooltipHandler`, `selectionCellsHandler`, `connectionHandler`, `graphHandler`, `panningHandler`, `popupMenuHandler`. draw.io then adds an `mxRubberband` in the `Graph` constructor.

| Handler | Role |
|---|---|
| [mxGraphHandler](../src/main/webapp/mxgraph/src/handler/mxGraphHandler.js) | Moving and cloning selected cells, drop targets, guides |
| [mxVertexHandler](../src/main/webapp/mxgraph/src/handler/mxVertexHandler.js) | Resize, rotate and custom handles ([mxHandle](../src/main/webapp/mxgraph/src/handler/mxHandle.js)) for a selected vertex |
| [mxEdgeHandler](../src/main/webapp/mxgraph/src/handler/mxEdgeHandler.js), [mxEdgeSegmentHandler](../src/main/webapp/mxgraph/src/handler/mxEdgeSegmentHandler.js), [mxElbowEdgeHandler](../src/main/webapp/mxgraph/src/handler/mxElbowEdgeHandler.js) | Waypoints, segments, reconnecting ends, label moves |
| [mxConnectionHandler](../src/main/webapp/mxgraph/src/handler/mxConnectionHandler.js) + [mxConstraintHandler](../src/main/webapp/mxgraph/src/handler/mxConstraintHandler.js) | Drawing new edges, fixed connection points |
| [mxSelectionCellsHandler](../src/main/webapp/mxgraph/src/handler/mxSelectionCellsHandler.js) | Creates and holds one handler per selected cell (through `graph.createHandler`) |
| [mxRubberband](../src/main/webapp/mxgraph/src/handler/mxRubberband.js) | Marquee selection |
| [mxPanningHandler](../src/main/webapp/mxgraph/src/handler/mxPanningHandler.js), [mxPopupMenuHandler](../src/main/webapp/mxgraph/src/handler/mxPopupMenuHandler.js) | Panning, pinch-zoom, context menu |
| [mxKeyHandler](../src/main/webapp/mxgraph/src/handler/mxKeyHandler.js) | Keyboard shortcut bindings (wrapped by `EditorUi.createKeyHandler`) |
| [mxTooltipHandler](../src/main/webapp/mxgraph/src/handler/mxTooltipHandler.js), [mxCellMarker](../src/main/webapp/mxgraph/src/handler/mxCellMarker.js), [mxCellHighlight](../src/main/webapp/mxgraph/src/handler/mxCellHighlight.js), [mxCellTracker](../src/main/webapp/mxgraph/src/handler/mxCellTracker.js) | Tooltips and hover highlighting |

### 5.5 Layouts (`layout/`)

Only a few layouts remain in the core: [mxGraphLayout](../src/main/webapp/mxgraph/src/layout/mxGraphLayout.js) (the base class), [mxStackLayout](../src/main/webapp/mxgraph/src/layout/mxStackLayout.js) (used for lists, swimlane pools and table rows), [mxCircleLayout](../src/main/webapp/mxgraph/src/layout/mxCircleLayout.js), [mxParallelEdgeLayout](../src/main/webapp/mxgraph/src/layout/mxParallelEdgeLayout.js) and [mxCompositeLayout](../src/main/webapp/mxgraph/src/layout/mxCompositeLayout.js). The old hierarchical, tree, organic and radial layouts were **removed and replaced by ELK** ([§12.3](#123-automatic-layout-elk-org-chart-libavoid)). `Graph.replaceLegacyLayout` maps old `childLayout` styles to ELK equivalents.

### 5.6 Utilities (`util/`)

[mxUtils](../src/main/webapp/mxgraph/src/util/mxUtils.js) is the grab-bag helper: XML parsing (`parseXml`, `getXml`, `getPrettyXml`), DOM helpers, HTTP (`get`, `post`, `getAll` built on [mxXmlRequest](../src/main/webapp/mxgraph/src/util/mxXmlRequest.js)), geometry maths, colour parsing and light/dark handling, style-string editing (`setStyle`, `setCellStyles`), and HTML→SVG text conversion (`convertHtmlToSvg`, used when exporting labels without `foreignObject`). [mxConstants](../src/main/webapp/mxgraph/src/util/mxConstants.js) defines every style key (`STYLE_FILLCOLOR = 'fillColor'`, …) and constant. Also here: [mxEvent](../src/main/webapp/mxgraph/src/util/mxEvent.js) (cross-browser DOM events and event-name constants), [mxEventSource](../src/main/webapp/mxgraph/src/util/mxEventSource.js)/[mxEventObject](../src/main/webapp/mxgraph/src/util/mxEventObject.js) (the observer pattern used everywhere: `addListener(name, fn(sender, evt))`, `fireEvent`), [mxUndoManager](../src/main/webapp/mxgraph/src/util/mxUndoManager.js)/[mxUndoableEdit](../src/main/webapp/mxgraph/src/util/mxUndoableEdit.js), [mxClipboard](../src/main/webapp/mxgraph/src/util/mxClipboard.js), [mxResources](../src/main/webapp/mxgraph/src/util/mxResources.js) (i18n key/value store, see [§13.3](#133-ui-text-resources)), [mxGuide](../src/main/webapp/mxgraph/src/util/mxGuide.js) (alignment and equal-spacing guides), [mxDragSource](../src/main/webapp/mxgraph/src/util/mxDragSource.js) (sidebar drag and drop), [mxPopupMenu](../src/main/webapp/mxgraph/src/util/mxPopupMenu.js), [mxWindow](../src/main/webapp/mxgraph/src/util/mxWindow.js) (floating panels), [mxImageExport](../src/main/webapp/mxgraph/src/util/mxImageExport.js) (draws cell states onto any canvas), [mxAbstractCanvas2D](../src/main/webapp/mxgraph/src/util/mxAbstractCanvas2D.js), [mxSvgCanvas2D](../src/main/webapp/mxgraph/src/util/mxSvgCanvas2D.js), [mxXmlCanvas2D](../src/main/webapp/mxgraph/src/util/mxXmlCanvas2D.js), [mxMorphing](../src/main/webapp/mxgraph/src/util/mxMorphing.js)/[mxAnimation](../src/main/webapp/mxgraph/src/util/mxAnimation.js)/[mxEffects](../src/main/webapp/mxgraph/src/util/mxEffects.js), [mxPanningManager](../src/main/webapp/mxgraph/src/util/mxPanningManager.js), [mxAutoSaveManager](../src/main/webapp/mxgraph/src/util/mxAutoSaveManager.js), and small value types (`mxPoint`, `mxRectangle`, `mxImage`, `mxDictionary`, `mxObjectIdentity`, `mxUrlConverter`, `mxImageBundle`, `mxForm`, `mxToolbar`, `mxDivResizer`, `mxLog`).

---

## 6. The Graph Editor Layer (`js/grapheditor/`)

`grapheditor` is the generic, storage-agnostic diagram editor on top of mxGraph. It knows nothing about cloud files or pages. It provides the `Graph` subclass, the editor UI shell, the menus, toolbar, sidebar, Format panel, shapes and dialogs. The draw.io application layer (`js/diagramly/`, [§7](#7-the-application-layer-jsdiagramly)) then **re-opens these same classes** and adds to them, rather than subclassing (except `App`). When you look for behaviour, check both `grapheditor/X.js` and `diagramly/X.js`.

```
Editor  ── owns ──>  Graph (extends mxGraph)  ── owns ──>  mxGraphModel, mxGraphView, handlers
  ▲
EditorUi ── owns ──>  Actions, Menus, Toolbar, Sidebar, Format, HoverIcons, InlineToolbar, KeyHandler, dialogs
  ▲
App (diagramly) ── adds storage clients, files, splash, plugins
```

### 6.1 `Editor` (`grapheditor/Editor.js`)

[Editor](../src/main/webapp/js/grapheditor/Editor.js#L7) is an `mxEventSource` that holds **one `Graph`**, the `undoManager`, the `chromeless`/`editable` flags, `modified`, `filename` and `status` (`setStatus` fires `statusChanged`).

- `createGraph()` builds `new Graph(...)`, and `resetGraph()` restores the default view settings.
- **`setGraphXml(node)`** decodes an `<mxGraphModel>` into the model inside a transaction and applies its attributes (grid, page, background, …) through `readGraphState`. **`getGraphXml()`** encodes the model and writes the view attributes back (`dx`, `dy`, `grid`, `gridSize`, `guides`, `tooltips`, `connect`, `arrows`, `fold`, `page`, `pageScale`, `pageWidth`, `pageHeight`, `background`, `backgroundGradient`, `measureScale`). `savedGraphState` keeps the file's original values when URL parameters override them, so forced runtime state is not persisted.
- `createUndoManager()` connects `mxEvent.UNDO` from the model and view to `mxUndoManager`, and re-selects the affected cells on undo/redo.
- The file also contains the shared base UI classes: **`Dialog`** (modal container, focus trap, resize handles), `PrintDialog`, `PageSetupDialog`, `FilenameDialog`, `OpenFile` (the cross-window file hand-off used by `open.html` and "open in new window"), and several mxGraph patches (background page/grid rendering in `mxGraphView.validateBackgroundPage`/`createSvgGrid`, `panGraph`, `updatePageBreaks`).
- Static helpers: unit conversion (`Editor.toUnit`/`fromUnit`, `mxConstants.POINTS/MILLIMETERS/INCHES/METERS/CENTIMETERS`), PNG/JPEG detection and **metadata stripping**, `extractGraphModelFromPng` (reads the `mxfile` zTXt/tEXt chunk), `repairTruncatedXml`, `getShapeForegroundColor`/`getShapeBackgroundColor` (light-dark defaults), and `soundex` (used by sidebar search).

### 6.2 `EditorUi` (`grapheditor/EditorUi.js`)

[EditorUi](../src/main/webapp/js/grapheditor/EditorUi.js#L7) builds and wires the whole user interface around `editor.graph`. The constructor:

1. installs the selection-state cache (`getSelectionState()` → `createSelectionState()`, which summarises the selection: vertices, edges, common style, table info, custom properties), cleared on every selection, model or edit change.
2. creates **`this.actions = new Actions(this)`** and **`this.menus = this.createMenus()`**.
3. defines `setDefaultStyle` (Edit → Set as Default Style) and the `currentVertexStyle`/`currentEdgeStyle` bookkeeping that the toolbar uses for new shapes.
4. **`createDivs()` → `createUi()` → `refresh()`**. `createUi` creates the menubar (`menus.createMenubar`), status container, sidebar (`createSidebar` → `new Sidebar`), format panel (`createFormat` → `new Format`), diagram container, tab container (pages) and toolbar (`new Toolbar`), plus the draggable split handlers.
5. creates the hover icons (`createHoverIcons` → `new HoverIcons(graph)`, the blue arrows for quick connect), the inline toolbar, the key handler (`createKeyHandler`), the context-menu factory (`graph.popupMenuHandler.factoryMethod` → `menus.createPopupMenu`), resize/orientation listeners, and finally `this.init()`.

`EditorUi.init()` installs the shape picker (a popup of shapes when you drop an edge on empty space or double-click the background), the line-marker menu, keyboard handling, the **typing shim** (a hidden textarea that keeps focus while a cell is selected so that typing or IME input starts label editing), undo and before-unload listeners, `updateActionStates` on every selection or model change, the clipboard overrides (`initClipboard`) and `initCanvas`. `initCanvas` implements the **infinite canvas**: page-sized scroll padding, `lazyZoom` (debounced wheel zoom with a CSS-transform preview), and the chromeless/lightbox toolbar and resize behaviour.

Other notable responsibilities: `showDialog`/`hideDialog` (a stack of `Dialog`s), `handleError`/`showError`/`alert`/`confirm`/`prompt`, `pickColor`, `save`/`saveFile` (generic, overridden by `App`), `executeLayout(s)`, `createOutline`, `addSplitHandler`, `createZoomInput`, `setPageVisible`/`setBackgroundColor`/`setPageFormat`/`setGridColor`/`setMeasureScale` (implemented as undoable changes `ChangePageSetup` and `ChangeGridColor`), and fit helpers (`fitDiagramToWindow`, `setFitWindowEnabled`). **`createKeyHandler`** maps keystrokes to actions. It works by physical key position (`createUsKeyEvent`) so that shortcuts work on non-US layouts, ignores IME composition, and implements arrow-key nudging.

### 6.3 `Graph` (`grapheditor/Graph.js`)

[Graph](../src/main/webapp/js/grapheditor/Graph.js#L441) extends `mxGraph` and is the largest file in the project (≈40k lines). Its constructor configures the immediate-handling mouse logic (clicking table borders and edge segments without selecting first), label sanitising, guides, the rubberband, outline-connect timers, locked cells and layers, tooltips, links and the touch UI. Major areas:

| Area | Key members |
|---|---|
| **Labels & HTML** | `isHtmlLabel` (`html=1` or `whiteSpace=wrap`), `cellRenderer.getLabelValue` → **`Graph.sanitizeHtml` → `Graph.domPurify`** (DOMPurify with `DOM_PURIFY_CONFIG` plus two `afterSanitizeAttributes` hooks that drop markup-looking attributes, `url()` in styles, external `<use>` and `@import`). `Graph.isStyleAllowed`, `sanitizeLink`, `optimizeHtml`, `scopeStyleElements`, `addLightDarkColors`. Placeholders `%name%` (`replacePlaceholders`, `placeholderPattern`, `getGlobalVariable`, `%date{…}%`) |
| **Styles** | Defaults `defaultVertexStyle`/`defaultEdgeStyle`, `currentVertexStyle`/`currentEdgeStyle`, theme stylesheets (`defaultThemes`, `loadStylesheet` from [styles/default.xml](../src/main/webapp/styles/default.xml)), `postProcessCellStyle`/`replaceDefaultColors` (`default*Color`, `invert`), `pasteStyle`/`copyStyle`, `updateCellStyles`, `Graph.cellStyles`/`edgeStyles`/`textStyles` lists |
| **Dark mode / adaptive colours** | `adaptiveColors` (`auto`/`simple`/`none`), `shapeForegroundColor`/`shapeBackgroundColor` as `light-dark()`, `Graph.addAdaptiveColors` (rewrites exported SVG to CSS variables `--ge-adaptive-bg`/`--ge-adaptive-fg`), `getPageBackgroundColor`, `backgroundGradient` |
| **Compression** | `Graph.compress`/`decompress` (deflate-raw via pako + base64 + `encodeURIComponent`), `compressNode`, `zapGremlins`, base64 Unicode helpers |
| **Tables** | `createTable`, `isTable`/`isTableRow`/`isTableCell`, `insertTableRow/Column`, `deleteTableRow/Column`, `setTableRowHeight`/`setTableColumnWidth`, `distributeRows/Columns`, the **`TableLayout`** class (an `mxStackLayout` subclass that lays out rows and cells), and collapsed-table rendering (`tableRender=collapsed`) |
| **Layouts by style** | `initLayoutManager`: a container's `childLayout` style (`stackLayout`, `circleLayout`, `tableLayout`, a legacy name such as `treeLayout` mapped to ELK by `Graph.getChildLayouts`, or a URL-encoded JSON custom-layout list decoded by `Graph.decodeChildLayout`) runs automatically after changes, including async ELK/libavoid layouts (`scheduleAsyncLayout`, `runAsyncLayout`). Also `createLayouts`, `Graph.elkLayoutAlgorithms`, `Graph.replaceLegacyLayout` |
| **Sequence diagrams** | `isLifeline`, `isSequenceMessage`, `mxEdgeStyle.SequenceMessage`, `makeSequenceMessages`, `getSequenceMessageRow`, `growSequenceCell` |
| **Containers** | `transparentBounds` groups (bounds derived from children plus `groupPadding`), `lockedGroup`, `isPart` (`part=1`, composite shapes), `isContainer`, `getBorderContainer`, `normalizeModel` (repairs AI-generated or imported models) |
| **Edges** | `connectVertex` (hover-arrow connect and clone), `applyNewEdgeStyle`/`newEdgeStyle`, line jumps (`updateLineJumps`, `jumpStyle`), curved edges (`getCurvePoints`), self-loops, `followTerminals` (waypoints that follow moved terminals), rounded perimeters, `getOutlineConstraint` |
| **Shape text flow** | `shapeInside` (text that wraps inside non-rectangular shapes via CSS floats: `getShapeInsideOutline`, `computeShapeInsideFontSize`), `autosizeText` |
| **Insert / edit** | `insertImage`, `insertLink`, `addText`, `duplicateCells`, `deleteCells`, `alignCells`, `distributeCells`, `turnShapes`, `rotateCell`, `scaleCellsToBounds`, `flipCells`, `moveCells`/`removeCells` overrides, `importGraphModel`/`encodeCells` (clipboard XML), `getDropTarget` |
| **Links & metadata** | `getLinkForCell`, `openLink` (sanitised, with `linkPolicy` and `linkTarget`), custom links `data:page/id,…` and `data:action/json,…`, tooltips (`getTooltipForCell`, which shows metadata), notes, `setAttributeForCell` (user-object attributes), `Graph.reservedDataNames` |
| **SVG export** | **`getSvg(background, scale, border, nocrop, crisp, ignoreSelection, showText, imgExport, linkTarget, hasShadow, incExtFonts, theme, exportType, cells, noCssClass, disableLinks, …)`** renders the cells through `mxImageExport` into an `mxSvgCanvas2D` and returns an `<svg>` element. `createSvgImageExport`, `addForeignObjectWarning` (for labels that need `<foreignObject>`), `disableSvgLinks`/`updateSvgLinks` |
| **Zoom & view** | `zoom` (1%–16000%), `getZoomSteps`, `isFineZoom`, `fitWindow`, `fitPages`, `getPageLayout`, `getPageSize`, `updateMinimumSize`, trackpad and wheel detection (`isZoomWheelEvent`, `Graph.zoomWheel`) |
| **Animation** | `createWipeAnimations`, `createPopAnimations`, `executeAnimations` (used by insert animations and the step animation player), flow animation (`flowAnimation=1` dashes) |
| **Browser translation** | A mirror of the label text in normal DOM so that Chrome's translator can translate SVG `foreignObject` labels (`initBrowserTranslate`, …) |
| **Handlers (2nd half of the file)** | Large overrides of `mxVertexHandler` (custom handles, size and distance guides, move/connect/edit icons, child live preview, table column moves), `mxEdgeHandler` (angle guides, virtual bends), `mxConnectionHandler` (edge preview with the current edge style), `mxGraphHandler` (live preview, hints), `mxRubberband`, `mxCellEditor` (contentEditable rich text, `shapeInside` floats, view-source toggle), and the **`MultiSelectionHandler`** (one bounding box to resize or rotate a multi-selection) |
| **Stencil loading** | `mxStencilRegistry.getStencil` is overridden for **dynamic loading**: `shape=mxgraph.<pkg>.<name>` → `getBasenameForStencil` → `mxStencilRegistry.libraries[pkg]` (a list of `shapes/*.js` and `stencils/*.xml`, populated in `diagramly/Editor.js`) → `loadStencilSet` (XML) or `eval` of the JS (only if `mxStencilRegistry.allowEval`, which is off in production because `shapes-14-6-5.min.js` is preloaded). `HoverIcons` is also defined here |

### 6.4 Shapes (`grapheditor/Shapes.js`)

[Shapes.js](../src/main/webapp/js/grapheditor/Shapes.js) registers about 100 built-in shape classes with `mxCellRenderer.registerShape`. Examples: `table`, `tableRow`, `cube`, `isoCube`, `cylinder3`, `note`, `folder`, `card`, `document`, `process`, `parallelogram`, `trapezoid`, `step`, `hexagon`, `callout`, `umlActor`, `umlLifeline`, `umlFrame`, the `seq*` sequence shapes, `flexArrow`, `link`, `taperedArrow`, `curvedText`, `dimension`, `partialRectangle`, `delay`, `display`, git and mermaid helper shapes, and many more. It also defines custom perimeters (`lifelinePerimeter`, `calloutPerimeter`, `parallelogramPerimeter`, `trapezoidPerimeter`, `stepPerimeter`, `hexagonPerimeter2`, `cloudPerimeter`, …), edge styles (`SequenceMessage` = `sequenceEdgeStyle`, `IsometricConnector` = `isometricEdgeStyle`), extra markers (`dash`, `box`, `cross`, `circle`, `circlePlus`, `halfCircle`, `async`, `openAsync`, mermaid markers), default **connection points** (`mxRectangleShape.prototype.constraints`, …), stencil `labelBounds`, and **`Graph.handleFactory`**: per-shape yellow diamond handles that edit style values such as `size`, `arcSize`, `dx` and `dy`, built with `createHandle(state, keys, getPositionFn, setPositionFn)`. To add a new built-in shape, subclass `mxActor`/`mxShape`, implement `paintVertexShape` or `redrawPath`, call `mxCellRenderer.registerShape('myShape', MyShape)`, and optionally add constraints and a handle-factory entry.

### 6.5 Actions, Menus, Toolbar, InlineToolbar

- **[Actions](../src/main/webapp/js/grapheditor/Actions.js)** is the command registry. `addAction(key, funct, enabled, iconCls, shortcut)` stores an `Action` (an `mxEventSource` with `funct`, `enabled`, `visible`, `toggle`/`selected` state). The key `'save...'` is registered as `save` with the label "Save…". Built-in actions include `new`, `open`, `save`, `saveAs`, `export`, `editDiagram`, `pageSetup`, `print`, `undo`/`redo`, `cut`/`copy`/`paste`/`pasteHere`, `delete`/`deleteAll`, `duplicate`, selection actions, `lockUnlock`, `group`/`ungroup`, `toFront`/`toBack`, `align*`/`distribute*`, `edit`/`editData`/`editStyle`/`editTooltip`/`editLink`/`editImage`, `zoomIn`/`zoomOut`/`fitWindow`/`resetView`, toggles (`grid`, `guides`, `pageView`, `connectionArrows`, `connectionPoints`, `autosave`, `formattedText`, `wordWrap`), colour actions, waypoint actions, `layers`, `format` and `outline`. Callers use `ui.actions.get('name').funct()`. `diagramly/Actions`-style additions live in `diagramly/Menus.js` and `diagramly/EditorUi.js`.
- **[Menus](../src/main/webapp/js/grapheditor/Menus.js)** is the menu registry: `put(name, new Menu(fn(menu, parent)))`. Menus are built lazily each time they open, using `addMenuItems(menu, ['actionName', '-', …])`, `styleChange`/`edgeStyleChange` (one-click style setters), `promptChange` and `pickColor`. It covers the edge style, edge shape, line start/end, spacing, direction, layout, navigation, arrange, view, font, table and context (popup) menus. `createPopupMenu` builds the right-click menu from the selection. `Menubar`/`Menu` are the classes, and plugins can append items with `addPluginMenuItems`.
- **[Toolbar](../src/main/webapp/js/grapheditor/Toolbar.js)** is the classic-theme toolbar (zoom, undo, delete, front/back, colours, shadow, edge style, insert, table) and the rich-text editing toolbar (`createTextToolbar`).
- **[InlineToolbar](../src/main/webapp/js/grapheditor/InlineToolbar.js)** is a floating toolbar shown at the midpoint of a single selected edge. It offers popovers for line style, line ends and routing. It is enabled by the `enableInlineToolbar` configuration.

### 6.6 Sidebar (`grapheditor/Sidebar.js`)

[Sidebar](../src/main/webapp/js/grapheditor/Sidebar.js#L7) is the shape library panel. A palette is a titled, collapsible section: `addPalette(id, title, expanded, onInit)`. Palette content is created lazily when it first scrolls into view (`deferPaletteInit`, `IntersectionObserver`). Each entry is a **template**, created by `createVertexTemplateEntry(style, w, h, value, title, showLabel, showTitle, tags)` or `createVertexTemplateFromCells`/`createEdgeTemplateEntry`, and becomes an `mxDragSource` (`createDragSource`) with:

- click-to-insert (`itemClicked`), which inserts at the centre, connects to the selection, or replaces the selected shape's style when Shift is held.
- drag-and-drop with **drop-and-connect** (dropping on a blue hover arrow connects the new shape to the target), splitting edges, dropping onto edges as labels, and live edge previews.
- hover tooltips with a rendered preview (`createTooltip`).

`addStencilPalette(id, title, stencilFile, style, ...)` creates one entry per shape in an XML stencil file, named `shape=<package><name>`. **Search**: every entry is indexed by tags (`addEntry`), stored with Soundex normalisation (`getNormalizedTag`). `searchEntries` combines exact, prefix, partial and Soundex matches and ranks them with `librarySearchWeights`. The base sidebar defines the General, Misc, Advanced, Basic and UML palettes. All other libraries are in `diagramly/sidebar/` ([§8.4](#84-sidebar-libraries-jsdiagramlysidebar)).

### 6.7 Format panel (`grapheditor/Format.js`)

[Format](../src/main/webapp/js/grapheditor/Format.js#L4) is the right-hand properties panel. `refresh()` is debounced and calls `immediateRefresh()`, which rebuilds the tabs from `EditorUi.getSelectionState()`:

| Selection | Tabs (panel classes) |
|---|---|
| Nothing selected | **Diagram** (`DiagramFormatPanel`: view, grid, page view, background, paper size, options) and **Style** (`DiagramStylePanel`: global themes and colour schemes) |
| Editing text | **Text** (`TextFormatPanel`) |
| Cells | **Style** (`StyleFormatPanel`: fill, stroke, line jumps, effects, SVG colours/CSS vars, edit ops), **Text** (`TextFormatPanel`: font, alignment, spacing, label position), **Arrange** (`ArrangePanel`: geometry, waypoints, angle, align, distribute, flip, group padding, tables, layers) |

All panels inherit `BaseFormatPanel` helpers: `createCellOption` (checkbox bound to a style key), `createColorOption`, `installInputHandler` (number inputs with units and steppers), `createRelativeOption`, `createCollapsibleSection` (collapsed state persisted through `getCollapsedSections`), and `addUnitInput`. Values are written with `graph.setCellStyles(key, value, cells)` inside `model.beginUpdate`, and the panel fires `styleChanged` on the `EditorUi`.

### 6.8 Dialogs (`grapheditor/Dialogs.js`)

[grapheditor/Dialogs.js](../src/main/webapp/js/grapheditor/Dialogs.js) holds the base dialogs: `OpenDialog`, `ColorPicker`/`ColorDialog`/`ColorWindow`, `AboutDialog`, `SimpleTextareaDialog`/`TextareaDialog`, `MarkupDialog`, **`EditDiagramDialog`** (edit raw XML), `ExportDialog` (the generic exporter), **`EditDataDialog`** (edit a cell's ID, tooltip, placeholders and custom properties, which converts the value into a `UserObject`), `LinkDialog`, `OutlineWindow` and **`LayersWindow`**. Dialog layout must follow [docs/dialog-style-guide.md](dialog-style-guide.md) ([§17.6](#176-dialog-conventions)).

---

## 7. The Application Layer (`js/diagramly/`)

`diagramly` ("draw.io") turns the generic editor into the full product. Most of its files are IIFEs that **extend the grapheditor classes in place**. For example, `diagramly/Editor.js` adds to `Editor`, `Graph`, `mxStencilRegistry` and `PrintDialog`, and `diagramly/EditorUi.js` adds about 470 methods to `EditorUi`. `App` (in [App.js](../src/main/webapp/js/diagramly/App.js)) is the only real subclass.

### 7.1 The file format: `<mxfile>` → `<diagram>` → `<mxGraphModel>`

A `.drawio` file is an XML document with one `<diagram>` per **page**:

```xml
<mxfile host="app.diagrams.net" agent="…" version="32.5.5" pages="2" compressed="false">
  <diagram id="kX0…" name="Page-1">
    <mxGraphModel dx="…" dy="…" grid="1" …> <root> … </root> </mxGraphModel>
  </diagram>
  <diagram id="9aB…" name="Page-2">7ZhNb9swDIb/jY4b…</diagram>   <!-- compressed page -->
</mxfile>
```

- **Compressed pages**: a page's content may be the text `base64(deflateRaw(encodeURIComponent(xml)))` instead of a child `<mxGraphModel>`. This is produced by [Graph.compress](../src/main/webapp/js/grapheditor/Graph.js#L3364) and read by `Graph.decompress`/`Editor.parseDiagramNode`. `Editor.defaultCompressed` is `false`, so new files are uncompressed and pretty-printed. The `compressXml` configuration and the file's `compressed` attribute override this.
- **Write path**: [EditorUi.getXmlFileData](../src/main/webapp/js/diagramly/EditorUi.js#L2514) writes the current page's model into `currentPage.node`, clones `this.fileNode`, and appends every page (re-encoding stale pages, compressing or decompressing as required). `getFileData` → `createFileData` then sets `host` and `pages`, strips legacy attributes, and wraps the result for the target format:
  - **`.drawio`/`.xml`**: plain XML.
  - **`.svg`**: an SVG whose `content` attribute holds the `mxfile` (`getEmbeddedSvg`).
  - **`.png`**: a PNG with the `mxfile` in a zTXt/tEXt chunk (`Editor.writeGraphModelToPng`, `getEmbeddedPng`). This is used for `.drawio.png` editable images.
  - **`.html`**: a page with a `.mxgraph` div and `data-mxgraph` JSON for the viewer (`getHtml2`).
- **Read path**: [EditorUi.setFileData](../src/main/webapp/js/diagramly/EditorUi.js#L3261) validates and parses the data, then `editor.extractGraphModel(node, true)` → [Editor.extractGraphModel](../src/main/webapp/js/diagramly/Editor.js#L2449) unwraps HTML (`.mxgraph` div), SVG (`content` attribute) and `<diagram>` nodes. It builds `this.pages` as an array of [DiagramPage](../src/main/webapp/js/diagramly/Pages.js#L12), rejects duplicate page IDs, and picks the current page from `#…{"pageId"}`, `?page-id` or `?page`. Finally it calls `editor.setGraphXml()` for that page. PDF (`extractGraphModelFromPdf`), PNG (`extractGraphModelFromPng`) and JPEG metadata can also carry diagrams.
- Corrupt files go through `validateFileData` → `repairFileData` → `getRecoveryData`/`RecoveryDialog`, which offers earlier revisions or repaired copies.

### 7.2 `Editor.configure()` and the configuration object

[Editor.configure(config)](../src/main/webapp/js/diagramly/Editor.js#L2964) applies the documented **draw.io configuration JSON**. The configuration comes from `DRAWIO_CONFIG`, from `localStorage['.configuration']` (edited in *Extras → Configuration* through `ConfigEditor`), or from the embed `configure` message. It recognises around 150 keys, including:

- **Look & feel**: `css`, `customCss`, `darkColor`, `lightColor`, `systemColors`, `defaultColorSchemes`/`customColorSchemes`, `presetColors`, `defaultColors`, `customFonts`, `defaultFonts`, `fontCss`, `colorNames`, `sidebarWidth`, `sidebarTitles`, `foldingIconSize`
- **Defaults**: `defaultVertexStyle`, `defaultEdgeStyle`, `defaultTextStyle`, `styles`, `defaultPageVisible`, `defaultGridEnabled`, `defaultGridSize`, `pageFormat`, `defaultEdgeLength`, `defaultAdaptiveColors`, `emptyDiagramXml`, `xml`, `compressXml`, `defaultFileType`
- **Libraries & templates**: `defaultLibraries`, `enabledLibraries`, `libraries` (custom palettes), `defaultCustomLibraries`, `enableCustomLibraries`, `expandLibraries`, `templateFile`, `customTemplates`, `enabledTemplateSections`
- **Behaviour**: `autosaveDelay`, `zoomWheel`, `zoomFactor`, `gridSteps`, `enableSizeGuides`/`enableDistanceGuides`/`enablePositionGuides`, `enableAnimations`, `insertAnimations`, `enableInlineToolbar`, `shapePicker`, `pasteAtMousePointer`, `stopEditingOnEnter`, `keyboardShortcuts`, `passThroughKeys`, `hideMenus`/`hideMenuItems`, `restrictExport`, `enableExportUrl`, `maxImageSize`/`maxImageBytes`, `removeImageMetadata`
- **AI**: `enableAi`, `aiModels`, `aiConfigs`, `aiGlobals`, `aiActions`, `gptApiKey`/`geminiApiKey`/`claudeApiKey` (configuration-only, never read from URLs), `gptUrl`
- **Other**: `mermaid`, `globalVars`, `resources` (string overrides), `settingsName` (namespaces the localStorage keys), `debug`, `plugins`

Keys are stored on `Editor.*` statics or prototype defaults. Per-user preferences (theme, recent colours, plugins, units, panel widths, …) are kept separately in **`mxSettings`** ([Settings.js](../src/main/webapp/js/diagramly/Settings.js), localStorage key `.drawio-config`, versioned by `currentVersion`).

### 7.3 Other `diagramly/Editor.js` extensions

[diagramly/Editor.js](../src/main/webapp/js/diagramly/Editor.js) also provides:

- **Feature flags**: `Editor.enableServiceWorker`, `enableRealtime`, `enableRealtimeCache`, `compressXml`, `useCanvasForExport`, `enableAi`.
- **Fonts**: Google and custom web fonts (`Graph.addFont`, `isValidFontUrl`, `getExtFontCss`, `embedFonts` for SVG export).
- **Math**: MathJax (`Editor.initMath` loads `math4/es5`, `containsMath`, math cell sizing). When `math=1`, labels containing TeX (`$…$`/`$$…$$`, `\(…\)`, `\[…\]`, `\begin{…}`) or AsciiMath (`` `…` ``) are typeset (`Editor.containsMath`).
- **Image handling**: `convertImages`/`convertImageToDataUri` (inline images for export, via the proxy if needed), `getProxiedUrl`, `isCorsEnabledForUrl`, `loadUrl`.
- **CSV import helpers** (`csvToArray`), CRC32, and `writeGraphModelToPng`.
- **Rough.js "sketch" rendering**: `Editor.createRoughCanvas` wraps the canvas when `sketch=1` (hand-drawn style), and `Editor.expandSvgPatterns` handles fill patterns.
- **Tags**: `getAllTags`, `getCellsForTags`, `setHiddenTags`, and the Tags window/dialog (`createTagsDialog`).
- **Custom link actions**: [Graph.executeCustomActions](../src/main/webapp/js/diagramly/Editor.js#L11372) implements `data:action/json,{"actions":[…]}` links, which can toggle, show, hide, highlight, select, scroll, change styles or switch pages. They are also the engine of the **step animation player** (`Editor.AnimationPlayer`, `parseAnimationData`, flow animation), edited in `AnimationDialog`.
- **Stencil library registration**: `mxStencilRegistry.libraries[...]` maps each `mxgraph.<pkg>` prefix to its `shapes/*.js` and `stencils/*.xml` files ([Editor.js:12906](../src/main/webapp/js/diagramly/Editor.js#L12885)).
- **Enumeration** (numbered shapes), shadows, `selectUnlockedLayer`, and the multi-page `PrintDialog`.

### 7.4 `diagramly/EditorUi.js`: the application UI

[diagramly/EditorUi.js](../src/main/webapp/js/diagramly/EditorUi.js) (36k lines) is the core of the application. Its main groups of responsibility:

| Group | Key methods |
|---|---|
| **Logging & diagnostics** | `EditorUi.logError`, `logEvent`, `sendReport` (to `DRAWIO_LOG_URL`), `EditorUi.debug` (with `?test=1`), anonymisation (`anonymizeXml`) |
| **File lifecycle** | `fileLoaded(file)` (closes the old file, `file.open()`, sets the mode, updates the UI, restores libraries, shows layers), `setCurrentFile`/`getCurrentFile`, `descriptorChanged`, `getFileData`/`setFileData`, `replaceFileData`, `synchronizeCurrentFile`, `getHashObject`/`setHashObject`, `loadDescriptor` (CSV/URL descriptors) |
| **Import** | `openFiles`/`openLocalFile`/`openFileHandle` (drag-drop and file picker), `importXml`, `importVisio` (+ `convertBinaryVisio` for `.vsd`), `importGraphML`, `importGliffy`, `convertLucidChart`, `importZipFile`, `importCsv`/`doImportCsv` (the CSV-to-diagram language: `# key: value` header directives such as `# label:`, `# style:`, `# connect:` and `# layout:`, `##` comment lines, then CSV rows), `insertTextAt` (paste/insert text, URLs, images, Mermaid, PlantUML), `pasteXml`/`pasteCells`/`installImagePasteHandler`, `readGraphModelFromClipboard` |
| **Export** | `saveLocalFile`/`doSaveLocalFile`, `saveData`/`saveRequest`, `exportToCanvas` (PNG/JPEG/WebP via `<canvas>`), `getEmbeddedPng`, `getEmbeddedSvg`, `exportAnimatedGif`/`exportPageAnimation`, `createJsonForExport`, `showHtmlDialog`, `showEmbedImageDialog`, `createEmbedSvg`, `print`, export presets, `downloadFile` (XML/HTML/SVG; rendered formats only in Electron via its `createDownloadRequest`). Everything is client-side, with no export server (CHG-001) |
| **Text-to-diagram** | Mermaid (`parseMermaidDiagram`, `loadMermaid`, `replaceLockedGroupChildren`, which keeps user edits across re-parses), PlantUML (`parsePlantUmlDiagram`), AI (`generateOpenAiMermaidDiagram`) |
| **Layouts** | `executeLayoutSpec`, `resolveLayoutList`, `applyChildLayouts`, `showCustomLayoutDialog`, `loadOrgChartLayouts` |
| **Embed protocol** | `installMessageHandler`, `initializeEmbedMode`, `initializeInlineEmbedMode`, `createLoadMessage`, `addEmbedButtons`, `remoteInvoke` ([§9](#9-embedding-and-integration)) |
| **Libraries** | `loadLibrary`, `libraryLoaded` (custom libraries in the sidebar, editable via `LibraryDialog`), the scratchpad (`toggleScratchpad`, `loadScratchpad`, synced across tabs with `BroadcastChannel`) |
| **Themes & appearance** | `setCurrentTheme`/`doSetCurrentTheme` (`kennedy` = classic, `simple`, `sketch`, `min`, `atlas`), `setDarkMode`/`isAutoDarkMode`, `setHighContrast`, `setSketchMode`, `setAdaptiveColors`, `updateDefaultStyles`, `setRulerVisible`, `setPagesVisible`, docking windows (`createDockManager`, window-state persistence) |
| **Comments** | `getComments`, `addComment`, anchored comments, @mentions, `updateCommentOverlays`, comment UI (the `addComment`/`editComment` closures at the end of the file) |
| **Browser database** | `openDatabase`, `setDatabaseItem`, `getDatabaseItem`, … (IndexedDB: the `objects` store for drafts, settings-like items and the scratchpad, and the `files`/`filesInfo` stores for browser-storage diagrams) |
| **Collaboration UI** | `bringEveryoneToMe`, `setPresenting`, `startFollowing`, remote cursors and shared views |
| **Realtime patching** | `mxTerminalChange.prototype.execute`/`mxChildChange.prototype.execute` overrides and `sanitizeRealtimeTerminals`, so remote patches cannot leave dangling references |
| **Headless use** | `HeadlessEditorUi` at the end of the file: an `EditorUi` with no DOM, used by tools and tests |

### 7.5 Pages (`diagramly/Pages.js`)

[Pages.js](../src/main/webapp/js/diagramly/Pages.js) implements multi-page diagrams. A [DiagramPage](../src/main/webapp/js/diagramly/Pages.js#L12) wraps a `<diagram>` node and holds its decoded `root` and `viewState` (background, grid, page format, math, shadow, extFonts, …). Only the current page's `root` lives in the model. **Switching pages swaps the model root** inside an undoable `SelectPage`/`ChangePage` change (`selectPage` → `pageSelected`), saving and restoring each page's view state (`Graph.getViewState`/`setViewState`/`saveViewState`). All page operations are undoable changes: `RenamePage`, `ChangePageId`, `MovePage`, `ChangePageView` (stored initial view box), `ChangePageRoot`, `ReplaceDiagram`. The page **tab bar** is built by `createTabContainer`/`updateTabContainer`/`createTabForPage`. Page links use `data:page/id,<pageId>` (`getPageByLink`, `updatePageLinks` when importing). Pages can also be used as background images (`createImageForPageLink`).

### 7.6 Trees, freehand, ruler, minimal theme, simple theme

- [Trees.js](../src/main/webapp/js/diagramly/Trees.js) adds **tree and mind-map behaviour** for containers with `containerType=tree` and cells with `treeFolding=1`/`treeMoving=1`: collapse/expand subtrees, move subtrees with their root, keyboard navigation and insertion (Tab/Enter add child/sibling), automatic re-layout, and the Tree/Mindmap sidebar entries.
- [mxFreehand.js](../src/main/webapp/js/diagramly/mxFreehand.js) is the freehand drawing tool. It uses `perfect-freehand` for pressure-sensitive strokes, and each stroke becomes a vertex with an inline stencil, `shape=stencil(<compressed stencil XML>)` (`FreehandWindow` in `Dialogs.js`).
- [mxRuler.js](../src/main/webapp/js/diagramly/mxRuler.js) draws the horizontal and vertical rulers (in the current units) that track the view.
- [Minimal.js](../src/main/webapp/js/diagramly/Minimal.js) (`EditorUi.initMinimalTheme`) builds the **`min`** theme: floating `WrapperWindow`s for format and shapes, and a compact menu.
- [Simple.js](../src/main/webapp/js/diagramly/Simple.js) adds the **`simple`** (the default on app.diagrams.net), **`sketch`** and **`atlas`** themes by overriding `switchCssForTheme`, `createMainMenuForTheme`, `createFooterMenuForTheme`, `createPickerMenuForTheme` and `createMenubarForTheme`. These themes have a toolbar of shape-picker icons on the left, a footer with zoom and page controls, and hamburger menus.

### 7.7 Menus, actions and dialogs added by the application

[diagramly/Menus.js](../src/main/webapp/js/diagramly/Menus.js) wraps `Menus.prototype.init` and adds the application menus and actions: **File** (`new`, `open`, `openFrom`, `openRecent`, `importFrom`, `exportAs` → `exportPng/Jpg/Webp/AnimatedGif/Svg/Pdf/Html/Xml/Url/Json` and *Advanced…*, `embed` → `embedHtml/Svg/Image/Iframe/Notion`, `publish`, `save`, `saveAs`, `makeCopy`, `rename`, `moveToFolder`, `properties`, `revisionHistory`, `synchronize`, `close`), **Edit**, **View** (`pageTabs`, `ruler`, `darkMode`, `adaptiveColors`, `presentationMode`, `fullscreen`, `units`), **Arrange** (`runLayout`, `insertLayout`, layouts), **Extras** (`configuration`, `plugins`, `editDiagram`, `tags`, `findReplace`, `animation`, `theme`, `mathematicalTypesetting`, `copyAsImage/Svg`, `organizationAdmin`), **Insert** (shapes, `insertTemplate`, `insertLayout`, `insertFreehand`, `insertPolygon`, Mermaid/PlantUML/CSV via `ParseDialog`, `generate` (AI)), **Help**, the collaboration toggles (`shareCursor`, `showRemoteCursors`, `presentToEveryone`), and the developer `test*` items that appear with `?test=1`. In embed mode the `save` action posts `{event:'save', xml, …}` built from `createLoadMessage('save')` ([Menus.js:3228](../src/main/webapp/js/diagramly/Menus.js#L3130)).

[diagramly/Dialogs.js](../src/main/webapp/js/diagramly/Dialogs.js) (24k lines) contains the application dialogs:

| Dialog | Purpose |
|---|---|
| `StorageDialog`, `SplashDialog` | Choose a storage location; the start screen |
| `NewDialog` (templates, search, AI "smart template"), `CreateDialog`, `SaveDialog`, `PopupDialog` | Creating and saving files |
| `EmbedDialog`, `BackgroundImageDialog`, `ParseDialog` (Mermaid/PlantUML/CSV/list/table input), `LinkDialog` (link to page, URL, Drive picker), `CustomActionDialog` | Insert and link |
| `RevisionDialog`, `RecoveryDialog`, `DraftDialog` | History, recovery, drafts |
| `FindWindow` (find and replace), `FreehandWindow`, `TagsWindow`, `AdaptiveColorsWindow`, **`ChatWindow`** (the AI assistant: model choice, conversation, apply-to-diagram), **`AnimationDialog`** (step animation editor) | Tool windows |
| `AuthDialog`, `CustomGitLabUrlWarningDialog`, `MoreShapesDialog` (enable libraries), `PluginsDialog`, `CropImageDialog`, `EditGeometryDialog`, `LibraryDialog`, `EditShapeDialog` (stencil XML editor), `CustomDialog` (generic, see the style guide), `BtnDialog`, `FontDialog`, `AspectDialog`, `FilePropertiesDialog` (compression, file format, autosave), `ConnectionPointsDialog`, `PolygonDialog`/`PolygonTool` | Miscellaneous |

[ConfigEditor.js](../src/main/webapp/js/diagramly/ConfigEditor.js) is the visual and JSON editor behind *Extras → Configuration* (`showConfigurationEditorDialog`). [HomeDialog.js](../src/main/webapp/js/diagramly/HomeDialog.js) is the Google-Drive "Home" screen listing recent diagrams (`App.showHome`). [DevTools.js](../src/main/webapp/js/diagramly/DevTools.js) is active only with `?dev-tooltips=1`. It extends cell tooltips with the cell ID, terminal points and computed edge points for debugging, and is loaded only in dev mode, not in `app.min.js`.

### 7.8 AI features

The AI features are configured in [diagramly/Editor.js](../src/main/webapp/js/diagramly/Editor.js#L382). `Editor.enableAi` is true only on the official hosts unless configured. `Editor.aiConfigs` describes request templates for three providers:

- `gpt`: OpenAI chat completions.
- `gemini`: Google `generateContent`.
- `claude`: Anthropic `/v1/messages` with the `anthropic-dangerous-direct-browser-access` header.

Placeholders `{apiKey}`, `{model}`, `{action}` and `{prompt}` are filled from `Editor.aiGlobals` (system prompts for the `create`/`update`/`assist` actions) and the user's own API key. A JSONPath (`responsePath`) extracts the answer. `Editor.aiModels` lists the selectable models. `Editor.isAllowedAiEndpoint` blocks endpoints on `draw.io`/`diagrams.net` hosts. The hosted ("public") generator has its own path and a prompt limit (`Editor.maxPublicPromptLength`). The UI entry points are `ChatWindow`, the "Generate" option in `NewDialog`, `?smart-template=`, and `App.executeCreateObject` with `type: 'generate'`.

---

## 8. Shapes, Stencils and Shape Libraries

There are four ways a shape gets drawn. Knowing which applies tells you where to make a change:

| Kind | Style example | Defined in | Loaded |
|---|---|---|---|
| **Core mxGraph shape** | `ellipse`, `rhombus`, `swimlane` | `mxgraph/src/shape/*.js` | Always |
| **draw.io built-in shape** | `shape=cylinder3`, `shape=umlLifeline`, `shape=table` | [grapheditor/Shapes.js](../src/main/webapp/js/grapheditor/Shapes.js) | Always |
| **Domain JS shape** | `shape=mxgraph.aws3d.ec2`, `shape=mxgraph.bpmn.task` | `src/main/webapp/shapes/**.js` | Bundled in `shapes-14-6-5.min.js` (or lazily by name in dev) |
| **XML stencil** | `shape=mxgraph.cisco19.router` | stencil XML, prebuilt in `js/stencils.min.js` | On first use, by package name |
| **Inline stencil** | `shape=stencil(<compressed XML>)` | Inside the cell style (freehand, Edit Shape, imports) | Decoded per cell |

### 8.1 Domain shape files (`src/main/webapp/shapes/`)

[shapes/](../src/main/webapp/shapes/) holds about 49 files (≈77k lines, 700+ `registerShape` calls) of hand-written `mxShape` subclasses, grouped by domain:

- **Cloud**: `mxAWS4.js`, `mxAWS3D.js`, `mxGCP2.js`, `mxIBM.js`, `mxKubernetes.js`
- **Network**: `mxCisco19.js`, `mxCiscoSafe.js`, `mxNetworks.js`, `mxNetworks2.js`, `rack/mxRack.js`
- **UML/SysML/ArchiMate**: `mxUML25.js`, `mxSysML.js`, `mxArchiMate.js`, `mxArchiMate3.js`, `mxArchiMate4.js`, `mxC4.js`
- **Business/BPMN/EIP**: `bpmn/mxBpmnShape2.js`, `mxEip.js`, `mxLeanMap.js`, `mxDFD.js`, `mxFlowchart.js`, `er/mxER.js`, `mxInfographic.js`, `mxSAP.js`
- **Engineering**: `mxElectrical.js`, `pid2/mxPidValves.js`, `pid2/mxPidInstruments.js`, `pid2/mxPidMisc.js`, `mxFloorplan.js`, `mxCabinets.js`
- **UI mockups**: `mockup/mxMockup*.js`, `ios7/mxIOS7Ui.js`, `mxAndroid.js`, `mxBootstrap.js`, `mxGmdl.js`, `mxAtlassian.js`, `mxAtlassian2.js`
- **Other**: `mxArrows.js`, `mxBasic.js`, `emoji/mxEmoji.js`

Each file follows the same pattern ([shapes/mxDFD.js](../src/main/webapp/shapes/mxDFD.js) is a short example):

```js
function mxShapeDFDStart(bounds, fill, stroke, strokewidth) { mxShape.call(this); /* … */ }
mxUtils.extend(mxShapeDFDStart, mxShape);
mxShapeDFDStart.prototype.cst = {START: 'mxgraph.dfd.start'};          // style name
mxShapeDFDStart.prototype.paintVertexShape = function(c, x, y, w, h) { /* canvas calls */ };
mxCellRenderer.registerShape(mxShapeDFDStart.prototype.cst.START, mxShapeDFDStart);
mxShapeDFDStart.prototype.getConstraints = function(style, w, h) { /* connection points */ };
```

Many also define `customProperties` (editable in the Format panel) and handles. `shapes/LICENSE` carries the icon-use restriction described in the README.

### 8.2 XML stencils (`stencils.min.js`)

The public repo **does not contain the stencil XML sources**. The [stencils/](../src/main/webapp/stencils/) folder only has a clip-art PNG and a LICENSE. Instead, [js/stencils.min.js](../src/main/webapp/js/stencils.min.js) (3.9 MB) holds a map of 204 stencil files (`f['aws4.xml'] = '<compact encoding>'`) and overrides `mxStencilRegistry.loadStencil` to decode them from memory. When a style names `shape=mxgraph.<pkg>.<name>`, the registry resolves `mxStencilRegistry.libraries[pkg]` ([diagramly/Editor.js:12906](../src/main/webapp/js/diagramly/Editor.js#L12885)) to the stencil and shape files to load ([§6.3](#63-graph-grapheditorgraphjs)). The XML stencil language is documented in [mxStencil](../src/main/webapp/mxgraph/src/shape/mxStencil.js). `EditShapeDialog` lets users author inline stencils.

### 8.3 Raster and SVG image libraries (`img/lib/`)

[src/main/webapp/img/lib/](../src/main/webapp/img/lib/) contains about 1,900 SVG and PNG icons used by image-based palettes, where the style is `image;…image=img/lib/azure2/…svg`. Examples: `azure2` (704), `mscae` (489), `ibm` (188), `sap` (165), `clip_art` (164), `active_directory`, `allied_telesis`, `dynamics365`, `cumulus`, `atlassian`. [img/](../src/main/webapp/img/) also holds the clipart sets (`people`, `networking`, `computers`, `clipart`, `telecommunication`, `finance`).

### 8.4 Sidebar libraries (`js/diagramly/sidebar/`)

[js/diagramly/sidebar/Sidebar.js](../src/main/webapp/js/diagramly/sidebar/Sidebar.js) extends the base sidebar with the **library catalogue** (`Sidebar.prototype.configuration`: ids, prefixes and sub-libraries for "More Shapes"), enabling and disabling libraries (`showEntries`, `enabledLibraries` in `mxSettings`), drag-to-reorder palettes, context menus, custom libraries from the configuration (`addCustomEntries`), the **search index** (`addSearchIndex`, `searchEntries`, merged with the external icon service when `ICON_SERVICE_PATH` is set), and search-result chips that suggest libraries.

Each of the 68 `Sidebar-<Name>.js` files adds one `Sidebar.prototype.add<Name>Palette` function that registers entries. For example, [Sidebar-Kubernetes.js](../src/main/webapp/js/diagramly/sidebar/Sidebar-Kubernetes.js):

```js
Sidebar.prototype.addKubernetesPalette = function()
{
    var s2 = 'aspect=fixed;…;shape=mxgraph.kubernetes.';
    this.setCurrentSearchEntryLibrary('kubernetes');
    this.addPaletteFunctions('kubernetes', 'Kubernetes', false,
    [
        this.createVertexTemplateEntry(s2 + 'icon2;prIcon=api', w * 0.5, h * 0.48, '', 'API', null, null,
            this.getTagsForStencil(gn, 'api application programming interface', dt).join(' ')),
        // …
    ]);
    this.setCurrentSearchEntryLibrary();
};
```

They are pure data: style strings, sizes, titles and search tags. Files cover AWS (`AWS`, `AWS3`, `AWS3D`, `AWS4`, `AWS4b`), Azure (`Azure`, `Azure2`), GCP (`GCP`, `GCP2`, `GCP3`, `GCPIcons`), IBM, Alibaba, Cisco (`Cisco`, `Cisco19`, `CiscoSafe`), Citrix, Veeam, VVD, OpenStack, Kubernetes, network, rack, BPMN, UML 2.5, SysML, ArchiMate 1/3/4, C4, ER, DFD, EIP, flowchart, lean mapping, threat modelling, mockups (iOS, iOS7, Android, Bootstrap, GMDL), floorplan, electrical, fluid power, P&ID, cabinets, signs, sitemap, infographic, arrows, Atlassian, Salesforce, SAP, Office, Dynamics 365, Active Directory, Allied Telesis, Cumulus, web icons and others. **To add a library**: create `Sidebar-X.js` with an `addXPalette` function, add it to `Devel.js` and `build.xml`, register it in the configuration list in `sidebar/Sidebar.js` (and in `initPalettes`), and add a `mxStencilRegistry.libraries` entry if it uses new stencils or JS shapes.

---

## 9. Embedding and Integration

draw.io runs in five distinct deployment shapes, all from the same code:

| Shape | How it starts | Key code |
|---|---|---|
| **Full app** (app.diagrams.net) | `index.html` → `App.main` | [§4](#4-startup-and-bootstrapping) |
| **Embed editor** (`embed=1`, embed.diagrams.net) | A host page frames `index.html?embed=1&proto=json…` and exchanges `postMessage`s | `EditorUi.installMessageHandler` |
| **Inline embed** (`embedInline=1`) | The sketch UI shrunk around the diagram inside a host document | `EditorUi.initializeInlineEmbedMode` |
| **Viewer / lightbox** (`viewer.min.js`, `lightbox=1`, viewer.diagrams.net) | Read-only rendering of `.mxgraph` elements or a full-window lightbox | `GraphViewer` |
| **Desktop** (Electron) | `index.html` inside drawio-desktop, which exposes `window.electron` | `ElectronApp.js` |

### 9.1 The embed `postMessage` protocol

With `?embed=1&proto=json`, the editor posts `{event:'init'}` to its parent or opener when ready ([EditorUi.js:28903](../src/main/webapp/js/diagramly/EditorUi.js#L28387)). Without `proto=json` it posts the legacy string `ready`. The host then sends JSON **actions**, and the editor answers with **events**. Messages are accepted only from `this.embedMessageSource || window.opener || window.parent`. The handler is [EditorUi.installMessageHandler](../src/main/webapp/js/diagramly/EditorUi.js#L26751).

| Host → editor `action` | Effect |
|---|---|
| `load` | Load a diagram: `xml` / `xmlpng` / `descriptor`, with options `title`, `autosave`, `modified`, `saveAndExit`, `noSaveBtn`, `noExitBtn`, `libs`, `border`, `background`, `rough`, `dark`, `theme`, `viewport`, `toSketch`, … Replies `{event:'load', xml, …}` |
| `merge`, `patch`, `getDiff`, `resetDiff` | Diff-based updates from the host (with `checksum`), see [§11.2](#112-diffsync-page-and-cell-diffs) |
| `export` | Export with `format` = `xml`, `xmlpng`, `png`, `xmlsvg` (the default is SVG), `html`, `html2`, `json`, `mermaid` or `plantuml` (re-renders a text-based cell), with options such as `scale`, `border`, `background`, `shadow`, `theme`, `embedImages`, `embedFonts`, `layerIds`, `pageId`, `currentPage`, `allPages`. Replies `{event:'export', data, format, xml, message}` |
| `template` | Show the template dialog (`templatesOnly`, `enableRecent`, `enableSearch`, `enableCustomTemp`, `callback`) → `{event:'template'}` |
| `layout` | Run layouts (`layouts` spec) → `{event:'layout'}` |
| `prompt`, `dialog` | Show a prompt or message dialog → `{event:'prompt', value}` |
| `draft` | Offer to restore a host-supplied draft → `{event:'draft', result}` |
| `status`, `spinner` | Show a status text (optionally `modified`) or a spinner (`show`, `messageKey`) |
| `fit`, `viewbox`, `viewport`, `fullscreenChanged`, `textContent`, `snapshot`, `invokeAction` (run any action by name), `resetEditor`, `exit` | Misc |
| `remoteInvoke`, `remoteInvokeReady`, `remoteInvokeResponse` | Generic RPC in both directions (`EditorUi.remoteInvoke`) |
| `configure` (with `configure=1`) | Sent **before** `init`, handled by `App.main` ([§4.5](#45-appmain-the-startup-sequence)) |

Events sent by the editor include `init`, `load`, **`save`** (from the Save button or Ctrl+S, built in [diagramly/Menus.js:3228](../src/main/webapp/js/diagramly/Menus.js#L3130)), **`autosave`** (on every change when `autosave: 1`), **`exit`** (with `modified`), `export`, `openLink` (with `suppressNewWindows`), `shortcut` (host pass-through keys), `resize` (inline mode), `scrollWheel`, `template`, `prompt`, `draft`, `textContent`, `merge`/`patch`/`getDiff`/`resetDiff` replies, and `configure`. The file object in this mode is an [EmbedFile](../src/main/webapp/js/diagramly/EmbedFile.js) (mode `embed`). The host is the storage.

Embed-only URL parameters include `spin`, `modified`, `keepmodified`, `saveAndExit`, `noSaveBtn`, `noExitBtn`, `returnbounds`, `libraries`, `configure`, `ui`, `dark`, `pages`, `stealth`, `embedRT` (realtime in embed) and `fast-sync`. `App.blockedAncestorFrames` refuses certain framing origins.

### 9.2 The viewer (`GraphViewer.js`) and lightbox

[GraphViewer](../src/main/webapp/js/diagramly/GraphViewer.js#L12) renders a diagram read-only inside any element. `GraphViewer.processElements()` (run by `viewer.min.js` on load) finds every `div.mxgraph` and parses its `data-mxgraph` JSON configuration: `xml` or `url`, `page`, `layers`, `lightbox`, `nav`, `zoom`, `resize`, `toolbar` (`pages zoom layers tags lightbox`), `edit` (`_blank` or a URL), `highlight`, `target`, `border`, `auto-fit`, `responsive`, `max-height`, `center`, `dark-mode`, `tags`, `title`, … It then creates a `GraphViewer` (lazily when the element scrolls into view if `lazy`). Features: an auto-sizing container (`addSizeHandler`), a toolbar with page, zoom, layer and tag controls (`addToolbar`), link handling, the **lightbox** (`showLightbox` opens viewer.diagrams.net or a local full-window `EditorUi` in chromeless mode via `showLocalLightbox`), dark-mode listening, and loading UI language resources on demand. This is the code behind "File → Embed → HTML", published links, and the Confluence/Jira viewers.

[js/diagramly/Embed.js](../src/main/webapp/js/diagramly/Embed.js) and its twin [js/embed.dev.js](../src/main/webapp/js/embed.dev.js) (identical except for the final `})();`, which `EmbedServlet2` replaces with the call that supplies the arguments) implement the **legacy** embed script: an IIFE `(stylesheet, stencils)` that turns `.mxgraph` divs into graphs with a simple toolbar and MathJax.

### 9.3 Desktop (Electron)

drawio-desktop (a separate repository) loads this webapp. `bootstrap.js` detects Electron (`mxIsElectron`) and loads [ElectronApp.js](../src/main/webapp/js/diagramly/ElectronApp.js) and [DesktopLibrary.js](../src/main/webapp/js/diagramly/DesktopLibrary.js). `ElectronApp.js` sets local paths (`DRAWIO_BASE_URL = '.'`), forces `App.mode = device`, and overrides file operations to call the Electron main process through `electron.request({action: …})`. The actions are `readFile`, `writeFile`, `saveFile`, `showOpenDialog`, `showSaveDialog`, `watchFile`/`unwatchFile` (external change detection), `isFileWritable`, `fileStat`, `saveDraft`/`getFileDrafts`/`getBkpFile` (drafts and backups), `getLocalFonts`, `clipboardAction`, `openExternal`, `getUpdateState`, `deleteFile`, `dirname` and `exit`. It also adds desktop-specific menus (zoom, auto-update, backups, spell check) and recovers diagrams from PDFs. The CSP for Electron is set in `bootstrap.js`.

### 9.4 Atlassian and other integrations

- [connect/common/js/mxReader.js](../src/main/webapp/connect/common/js/mxReader.js) defines `DrawioViewer`, the Confluence/Jira (Atlassian Connect) attachment viewer with its own toolbar (edit, delete, zoom, lightbox). It is compiled into `atlas.min.js` and `integrate.min.js` by `build.xml`. The rest of the Connect add-on is not in this repository.
- [etc/integrate/Integrate.js](../etc/integrate/Integrate.js) is the bootstrap appended to `integrate.min.js` ([§3.3](#33-helper-scripts-in-etc)).
- Plugins `nextcloud.js` and `trello.js` adapt the editor to those hosts ([§14](#14-plugins)).
- [images/manifest.json](../src/main/webapp/images/manifest.json) is the PWA manifest (including `file_handlers` for "open with"). [monday-app-association.json](../src/main/webapp/monday-app-association.json) verifies the monday.com app.

---

## 10. Files, Storage Back-ends and Libraries

### 10.1 `DrawioFile`: the file abstraction

Every open diagram is a [DrawioFile](../src/main/webapp/js/diagramly/DrawioFile.js#L5) (an `mxEventSource`). It holds the serialised `data`, the `shadowPages` (the last saved state, used for diffing), the modified/conflict state and the `sync` object. Its lifecycle:

1. A storage client or loader creates the subclass instance with its data and descriptor (`desc`/`meta`).
2. `ui.fileLoaded(file)` → **`file.open()`** → `ui.setFileData(data)` → `installListeners()` (on model changes → `fileChanged()`) → `startSync()` if `isSyncSupported()`.
3. On every edit, **`fileChanged()`** sets `modified`, updates the status bar, and, if `isAutosave()`, schedules **`autosave(autosaveDelay = 1500 ms, maxAutosaveDelay = 30 s)`**, which calls `save(revision, …)` and asks for a new storage revision at most every `maxAutosaveRevisionDelay` (5 min). It also notifies `sync.localFileChanged()`.
4. **`save()`** → `updateFileData()` (`ui.getFileData()`) → the subclass's `saveFile()` writes to storage → `fileSaved()` updates the shadow pages and notifies the sync layer → `handleFileSuccess`/`handleFileError` update the status bar ("All changes saved", "Unsaved changes. Click here to save.", conflict dialogs).
5. A save rejected by the storage because of an etag/revision mismatch → `handleSaveConflict` → `synchronizeFile`/`mergeFile` (a three-way merge with `DiffSync`, [§11.2](#112-diffsync-page-and-cell-diffs)) and a retry, or `showConflictDialog` (overwrite / make a copy / synchronise).
6. **Drafts**: while a file has unsaved changes, `saveDraft()` stores a copy in the browser database under `.draft_<id>` (`setDatabaseItem`). `App.checkDrafts()` offers recovery at startup (`DraftDialog`).
7. `close()` saves if autosave is on, then `destroy()`.

Extension hooks for subclasses: `getHash`, `getMode`, `getTitle`, `isEditable`, `isRenamable`, `saveFile`, `saveAs`, `rename`, `move`, `getLatestVersion`, `getDescriptor*`, `isSyncSupported`, `isRealtimeSupported`, `isPolling`, `getRevisions`, comment methods (`getComments`, `addComment`, …), `share`, `getFileUrl`, `getPublicUrl`.

### 10.2 Storage modes and their classes

| Mode (`App.MODE_*`) | Client | File / Library classes | Notes |
|---|---|---|---|
| `device` | — (File System Access API, or download) | [LocalFile](../src/main/webapp/js/diagramly/LocalFile.js) / [LocalLibrary](../src/main/webapp/js/diagramly/LocalLibrary.js) | With `showSaveFilePicker` a `fileHandle` gives true in-place saving (`createWritable`), otherwise "save" downloads. A `LocalFile` with no mode is a **temporary** file. |
| `browser` | — | [StorageFile](../src/main/webapp/js/diagramly/StorageFile.js) / [StorageLibrary](../src/main/webapp/js/diagramly/StorageLibrary.js) | IndexedDB (`openDatabase`), with a localStorage fallback and migration. Hash `#L<title>`. Sync is supported **by polling** (detects edits from other tabs) |
| `google` | [DriveClient](../src/main/webapp/js/diagramly/DriveClient.js) | [DriveFile](../src/main/webapp/js/diagramly/DriveFile.js) / [DriveLibrary](../src/main/webapp/js/diagramly/DriveLibrary.js) | Google OAuth 2 (`accounts.google.com/o/oauth2/v2/auth` in a popup, with the code exchanged by the `/google` servlet) and the Drive REST API (mostly v2, with v3 for some calls), `drive.file` scope, Google Picker, mime type `application/vnd.jgraph.mxfile`. Revisions, comments ([DriveComment](../src/main/webapp/js/diagramly/DriveComment.js)), sharing, realtime. Also licence and usage reporting (`checkLicense`, `reportDriveUse`) and organisation settings for the hosted service |
| `onedrive`, `m365` | [OneDriveClient](../src/main/webapp/js/diagramly/OneDriveClient.js) | [OneDriveFile](../src/main/webapp/js/diagramly/OneDriveFile.js) / [OneDriveLibrary](../src/main/webapp/js/diagramly/OneDriveLibrary.js) | Microsoft Graph. The inline picker is [js/onedrive/mxODPicker.js](../src/main/webapp/js/onedrive/mxODPicker.js) (or the OneDrive SDK). `m365` is the SharePoint variant. Realtime is supported, with a random channel key stored in the `mxfile` |
| `github` | [GitHubClient](../src/main/webapp/js/diagramly/GitHubClient.js) | [GitHubFile](../src/main/webapp/js/diagramly/GitHubFile.js) / [GitHubLibrary](../src/main/webapp/js/diagramly/GitHubLibrary.js) | GitHub REST contents API. Each save is a **commit** (`showCommitDialog`). OAuth through `/github2` |
| `gitlab` | [GitLabClient](../src/main/webapp/js/diagramly/GitLabClient.js) (extends GitHubClient) | [GitLabFile](../src/main/webapp/js/diagramly/GitLabFile.js) / [GitLabLibrary](../src/main/webapp/js/diagramly/GitLabLibrary.js) | **Deprecated: support ends 31 Dec 2027** (a banner is shown). Configurable server through `DRAWIO_GITLAB_URL` |
| `trello` | [TrelloClient](../src/main/webapp/js/diagramly/TrelloClient.js) | [TrelloFile](../src/main/webapp/js/diagramly/TrelloFile.js) / [TrelloLibrary](../src/main/webapp/js/diagramly/TrelloLibrary.js) | Card attachments. Only enabled with `?tr=1` |
| `embed` | (host page) | [EmbedFile](../src/main/webapp/js/diagramly/EmbedFile.js) | The host is the storage ([§9](#9-embedding-and-integration)) |
| — | — | [RemoteFile](../src/main/webapp/js/diagramly/RemoteFile.js), [RemoteLibrary](../src/main/webapp/js/diagramly/RemoteLibrary.js), [UrlLibrary](../src/main/webapp/js/diagramly/UrlLibrary.js) | Integration-provided files; read-only URL libraries |

All cloud clients extend [DrawioClient](../src/main/webapp/js/diagramly/DrawioClient.js), which manages the signed-in [DrawioUser](../src/main/webapp/js/diagramly/DrawioUser.js), the persistent token (`getPersistentToken`/`setPersistentToken` in localStorage or sessionStorage), and `createAuthCallback`, the sign-in popup callback that pairs with the server's OAuth servlets ([§15.3](#153-oauth-absauth-and-provider-subclasses)). `App.getServiceForName(mode)` returns the client for a mode. `App.pickFile`/`pickFolder`/`pickLibrary`/`saveLibrary`/`createFile`/`exportFile` dispatch to it.

### 10.3 Libraries (custom shape palettes)

A **library** is an `<mxlibrary>` element whose text is a JSON array (`createLibraryDataFromImages`) of `{xml, w, h, title, aspect}` entries (`xml` holds cells, either as raw XML or compressed, and is decompressed on save when `Editor.defaultCompressed` is false) or `{data: <image data URI>, w, h, title}` entries. Libraries open as `*Library` file objects. `EditorUi.libraryLoaded` renders them as a sidebar palette with edit, save and close buttons, and `LibraryDialog` edits them. The open libraries are remembered in `mxSettings` (`customLibraries`) and restored by `App.restoreLibraries`/`loadLibraries`. The **scratchpad** is a special `StorageLibrary`.

### 10.4 Comments

[DrawioComment](../src/main/webapp/js/diagramly/DrawioComment.js) is the base comment model (content, user, dates, resolved, replies, anchors to page, cells, region or point). Back-ends override `commentsSupported`, `getComments`, `addComment` and related methods. Google Drive comments are implemented by `DriveComment`. The comments UI (anchored overlays, @mentions, resolve and reopen) lives in `diagramly/EditorUi.js`.

---

## 11. Synchronisation and Real-time Collaboration

`DrawioFile.SYNC` (from `?sync=`, which `PreConfig.js` forces to **`manual`** in this public build) selects the mode: `none` (overwrite), `manual` (merge on conflict or on demand), or `auto` (live). Even in `auto` mode, files only sync if their class returns true from `isSyncSupported()` (Drive, OneDrive, browser storage).

### 11.1 `DrawioFileSync`

[DrawioFileSync](../src/main/webapp/js/diagramly/DrawioFileSync.js#L7) is created by `file.startSync()`. It:

- tracks online/offline state, page visibility (it stops listening when the tab is hidden and resumes on activity), and the autosave toggle.
- joins a **relay channel** for the file (`getChannelId`/`getChannelKey`, a random or legacy key) through [P2PCollab](../src/main/webapp/js/diagramly/P2PCollab.js) over the websocket `RT_WEBSOCKET_URL` (`wss://<host>/rt`). Messages are **encrypted** with the channel key (CryptoJS AES, `objectToString`/`stringToObject`). For browser storage, sync uses [DrawioFilePolling](../src/main/webapp/js/diagramly/DrawioFilePolling.js) instead of the socket.
- On a **save**, `fileSaved` writes the patch to the **realtime cache** (`REALTIME_URL` = `<server>/cache`, with secret/token pairs from `createSecret`/`createToken`) and broadcasts a save notification. Other clients then `catchup` (fetching patches from the cache) or `reload`, and `merge()` the patches into their shadow and own pages. Checksums (`testChecksum`, `checksumError`) detect divergence and fall back to a full reload.
- In **realtime** mode (`isRealtime()`, `ownPages`), local edits are diffed per page and sent as live patches (`sendLocalChanges` → `doSendLocalChanges`), and remote patches are applied immediately (`receiveRemoteChanges`/`patchRealtime`), with periodic `cleanup` that reconciles against the saved state. It handles concurrent removes and inserts (`addUnconfirmedRemoves`, `stripPendingInserts`), page-root sanity checks, edges whose terminals disappeared (`sanitizePageTerminals`), shared views and presenting (`sendSharedViewMessage`), and comment change notifications.
- Protocol versioning: `DrawioFileSync.PROTOCOL = 7` and `minRemoteAppVersion`. Messages from incompatible clients are ignored, or force an app upgrade (`requireAppUpgrade`).

This collaboration server infrastructure (the `/rt` websocket relay and the `/cache` endpoint) is **not part of this repository**. `DrawioFileSync.checkCacheAlive` disables the cache when the endpoint cannot be reached, as on a self-hosted deployment.

### 11.2 `DiffSync`: page and cell diffs

[DiffSync.js](../src/main/webapp/js/diagramly/DiffSync.js) adds the diff/patch engine to `EditorUi`:

- **`diffPages(oldPages, newPages)`** produces a JSON patch with `i` (insert), `r` (remove), `u` (update) and `f` (file attributes) at page level, then per page cell-level diffs (`diffCells` → `diffCell`: value, style, geometry, parent and index, terminals, visibility and custom properties) and view-state diffs (the `viewStateProperties` such as background, grid, page format and math).
- **`patchPages(pages, patch, …)`** applies a patch with a deterministic ordering of concurrent claims (`getClaimantOrder`), parent lookups and terminal repair.
- `resolveCrossReferences`, `adoptTheirPages`/`adoptTheirCells` resolve three-way merges of own and remote changes.
- Patches are treated as **untrusted input** (they arrive over collaboration and the embed `merge`/`patch` actions): `EditorUi.isPrototypePollutionKey`, `patchList`/`patchMap`, `isValidGeometry` and `decodeGeometry` (a fresh codec per geometry) guard every write.

`DrawioFile.patch(patches, resolver, undoable, …)` applies patches to the live document and `ui.pages`, optionally as an undoable edit.

### 11.3 `P2PCollab`: presence, cursors and the relay socket

[P2PCollab](../src/main/webapp/js/diagramly/P2PCollab.js#L11) manages the websocket session (`joinFile`, rejoin with linear backoff, roster of peers from `clientsList`/`newClient`/`clientLeft`), optional WebRTC peer connections via SimplePeer (`?fast-sync=1`, `no-p2p`), **remote cursors and selections** (coloured per session), view following, and the "alone gate" (it skips cursor and diff traffic when nobody else is connected). A notify-only session (no realtime model) carries only save and descriptor notifications.

### 11.4 Undo, history and revisions

The local undo history is `editor.undoManager` ([§6.1](#61-editor-grapheditoreditorjs)). `DrawioFile.patch` applies remote patches with the file's change listener disabled and then restores the saved undo history (unless the patch is `undoable`), so remote changes do not enter the local undo stack. Storage revisions (Drive, OneDrive, GitHub commits) are listed with `file.getRevisions` and shown in `RevisionDialog`, which can preview, restore (`fileRestored`) or open a revision.

---

## 12. Import, Export, Layout and Text-to-Diagram Extensions

The heavyweight features ship in **`extensions.min.js`** ([§3.2](#32-ant-targets-and-the-bundles-they-produce)). `App.main` loads it after `app.min.js` in production, and `Devel.js` loads the sources in dev mode. Viewers do not load it, which is why UI entry points check things like `typeof LibavoidRouting !== 'undefined'` before showing menu items.

### 12.1 Importers

| Format | Code | Notes |
|---|---|---|
| **Visio** `.vsdx`/`.vssx`/`.vstx` | [diagramly/vsdx/importer.js](../src/main/webapp/js/diagramly/vsdx/importer.js) (`com.mxgraph.io.mxVsdxCodec`, ≈15k lines, generated from the Java importer with JSweet) + [bmpDecoder.js](../src/main/webapp/js/diagramly/vsdx/bmpDecoder.js) + [emf/emf-svg.js](../src/main/webapp/js/diagramly/emf/emf-svg.js) | Unzips with JSZip, parses Visio XML (masters, shapes, geometry, text, connectors, themes) into cells. Embedded EMF images are converted to SVG locally (an EMF record interpreter, MS-EMF spec) and BMPs are decoded. Entry point: `EditorUi.importVisio` |
| **Binary Visio** `.vsd`/`.vss`/`.vst` | [js/vsd/drawio-vsd.min.js](../src/main/webapp/js/vsd/drawio-vsd.min.js) (`window.DrawioVsd`) | A prebuilt converter that reads OLE compound files and produces Visio XML, which then goes through the VSDX importer (`EditorUi.convertBinaryVisio`) |
| **Lucidchart** | [diagramly/Extensions.js](../src/main/webapp/js/diagramly/Extensions.js) (`LucidImporter`, ≈14k lines) | Converts Lucid JSON state (from paste or the importer browser extension) to draw.io cells: shape mapping tables, rich text runs → HTML, org charts, timelines, output size limits. `EditorUi.convertLucidChart` |
| **Gliffy** | [js/gliffy/drawio-gliffy.min.js](../src/main/webapp/js/gliffy/drawio-gliffy.min.js) (`mxGliffyToDrawio`) | Generated from the Java Gliffy importer. Loaded on demand by `EditorUi.loadGliffy` and used by `importGliffy` |
| **GraphML** (yEd) | [diagramly/graphml/mxGraphMlCodec.js](../src/main/webapp/js/diagramly/graphml/mxGraphMlCodec.js) | yEd node/edge/label/style mapping. `EditorUi.importGraphML` |
| **Miro** | [diagramly/miro/MiroImporter.js](../src/main/webapp/js/diagramly/miro/MiroImporter.js) | Maps Miro board widgets (sticky notes, shapes, flowchart stencils, connectors) to draw.io styles |
| **Mermaid** | [js/mermaid/drawio-mermaid.min.js](../src/main/webapp/js/mermaid/drawio-mermaid.min.js) (`@drawio/mermaid`, `mxMermaidToDrawio`) | A **custom Mermaid parser and cell factory** that produces native, editable draw.io shapes (not an image). It uses ELK for layout. Mermaid diagrams are stored as locked groups with their source in `mermaidData`, so they can be re-parsed while keeping user styling (`replaceLockedGroupChildren`, `mergeMermaidStyleDelta`). `EditorUi.parseMermaidDiagram` |
| **PlantUML** | [js/plantuml/drawio-plantuml.min.js](../src/main/webapp/js/plantuml/drawio-plantuml.min.js) (`PlantUml`, `mxPlantUmlToDrawio`) | A clean-room PlantUML parser that produces native cells. It runs locally (the old server-side PlantUML service has been removed). `EditorUi.parsePlantUmlDiagram` |
| **CSV** | `EditorUi.importCsv`/`doImportCsv` | A text format: `# key: value` header directives (`label`, `style`, `parentstyle`, `stylename`, `styles`, `connect`, `layout`, `width`, `height`, `identity`, `parent`, `namespace`, …), `##` comment lines, then CSV rows. Org-chart CSVs load `orgchart.min.js` |
| **Images & PDFs** | `Editor.extractGraphModelFromPng/Pdf`, `EditorUi.importFiles` | Opens editable PNG/SVG/PDF diagrams; otherwise inserts images (resized with `resizeImage`, EXIF stripped) |
| **draw.io XML / mxlibrary / zip** | `importXml`, `importZipFile` | Pages are merged, IDs remapped, page links updated |

### 12.2 Exporters

All exports run in the browser. **VSDX export and server-side export (the `EXPORT_URL` service) were removed in CHG-001** ([CHANGES.md](CHANGES.md)). Formats that need a canvas (PNG/JPEG/WebP/GIF) are hidden when `Editor.isExportToCanvas()` is false (e.g. math is enabled), and the generic *Advanced…* `ExportDialog` reports "Not available" for anything other than PNG/JPEG/SVG.

| Format | How |
|---|---|
| **PNG / JPEG / WebP** (client) | `Graph.getSvg` → SVG → image → `<canvas>` (`EditorUi.exportToCanvas`, `Editor.getMaxCanvasScale`), with optional embedded XML (`writeGraphModelToPng`) |
| **SVG** | `Graph.getSvg`, plus font embedding (`embedFonts`), image inlining (`convertImages`), adaptive dark-mode CSS variables, and optionally the `content` attribute (editable SVG) |
| **PDF** | Through the browser print dialog (`PrintDialog` and `mxPrintPreview`). In Electron only, `exportPdf` renders a PDF file through the desktop's local pipeline (`createDownloadRequest` in `ElectronApp.js`, which renders `export3.html`, [§13.6](#136-headless-rendering-page-export3html)) |
| **HTML / embed / URL** | `getHtml2`, `createEmbedSvg`, `createEmbedImage`, `createUrlParameters` (viewer links with `#R`/`#U` data) |
| **JSON** | `createJsonForExport` (cell structure and metadata, used by the embed `json` format) |
| **Animated GIF / MP4** | [gif/GifEncoder.js](../src/main/webapp/js/diagramly/gif/GifEncoder.js) (GIF89a), [gif/Mp4Encoder.js](../src/main/webapp/js/diagramly/gif/Mp4Encoder.js) (WebCodecs + a minimal MP4 muxer), [gif/AnimatedExport.js](../src/main/webapp/js/diagramly/gif/AnimatedExport.js) (flow animations, stepping `stroke-dashoffset`), [gif/AnimationExport.js](../src/main/webapp/js/diagramly/gif/AnimationExport.js) (replays step animations offscreen with a virtual clock) |
| **Canvas rendering helpers** | [util/mxJsCanvas.js](../src/main/webapp/js/diagramly/util/mxJsCanvas.js) (an `mxAbstractCanvas2D` that draws directly to a 2D context) and [util/mxAsyncCanvas.js](../src/main/webapp/js/diagramly/util/mxAsyncCanvas.js) (pre-loads images and other async resources for it) |

### 12.3 Automatic layout: ELK, org chart, libavoid

- **ELK** ([js/elk/drawio-elk.min.js](../src/main/webapp/js/elk/drawio-elk.min.js), the `@drawio/elk` bridge) provides `window.ELK`, `ElkLayout` (an `mxGraphLayout` facade with `prepare`/`execute`), `ElkAdapter` and `ElkApplier`. [diagramly/ElkLayout.js](../src/main/webapp/js/diagramly/ElkLayout.js) adds the editor statics `ElkLayout.run(editorUi, algorithm, options)` and `runWithDialog` (the Arrange → Layout dialog, with spacing, direction, edge routing and other options stored in localStorage). The algorithms are exposed through `Graph.elkLayoutAlgorithms`: `elkLayered` → layered (hierarchical), `elkTree` → mrtree, `elkRadial` → radial, `elkOrganic` → force, `elkStress` → stress, `elkDisco` → disco and `elkBox` → box. They replace the removed mxGraph hierarchical, tree, organic and radial layouts.
- **Org chart**: [js/orgchart/](../src/main/webapp/js/orgchart/) contains `mxOrgChartLayout` plus the vendored Bridge.NET `OrgChart.Layout` library, bundled as `orgchart.min.js` and loaded only for org-chart CSV imports and the Org Chart layout (`EditorUi.loadOrgChartLayouts`).
- **libavoid**: [js/libavoid-js/](../src/main/webapp/js/libavoid-js/) contains the Adaptagrams libavoid C++ compiled to pure JS (`libavoid.min.js` publishes `window.Avoid`) and the shared routing core `libavoid-routing.js` (`AvoidRouting.computeRoutes`), which is also used by drawio-mcp. [js/libavoid-js/README.md](../src/main/webapp/js/libavoid-js/README.md) explains the build. [diagramly/LibavoidRouting.js](../src/main/webapp/js/diagramly/LibavoidRouting.js) is the editor binding. It **routes edges around obstacles without moving vertices**, writing waypoints back with `orthogonalEdgeStyle`. Two entry points: Arrange → Layout → Orthogonal Routing, and the per-edge `libavoidRouting=1` auto-route style (re-routed after moves via `LibavoidRouting.autoReroute`).
- Layouts can be attached to containers with `childLayout` styles, or run from the embed `layout` action, `?create=` `layouts`, and CSV `# layout:` ([§6.3](#63-graph-grapheditorgraphjs)).

---

## 13. Static Assets, Styling, UI Text and Offline Support

### 13.1 CSS and themes (`styles/`)

| File | Purpose |
|---|---|
| [styles/grapheditor.css](../src/main/webapp/styles/grapheditor.css) | **All editor UI CSS** (~4k lines). The `:root` block defines the theme palette as CSS variables (`--ge-panel-color`, `--text-color`, `--focus-color`, `--field-color`, … and their `--dark-*` counterparts). Colours use `light-dark()`, so dark mode follows `color-scheme`. Theme body classes: `geClassic` (kennedy), `geSimple`, `geSketch`, `geEmbed`. Users can override the variables through the `css` configuration key |
| [styles/high-contrast.css](../src/main/webapp/styles/high-contrast.css) | Applied under `(forced-colors: active)` |
| [styles/default.xml](../src/main/webapp/styles/default.xml) | **The default diagram stylesheet** (an `mxStylesheet`): `defaultVertex`, `defaultEdge` and named styles such as `text`, `edgeLabel`, `label`, `icon`, `swimlane`, `group`, `ellipse`, `rhombus`, `line`, `image`, `triangle`, … using `default` colour keywords that adapt to dark mode. Inlined at build time as `Graph-Stylesheet.js` ([§3.2](#32-ant-targets-and-the-bundles-they-produce)) |
| [styles/dark-default.xml](../src/main/webapp/styles/dark-default.xml), [styles/default-old.xml](../src/main/webapp/styles/default-old.xml) | Legacy stylesheets (old dark theme, old default) |
| [styles/fonts/ArchitectsDaughter-Regular.ttf](../src/main/webapp/styles/fonts/) | The sketch-mode font (`Editor.sketchFontFamily`). `Graph.fontMapping` maps the Google Fonts URL for Architects Daughter to this local file |
| [export-fonts.css](../src/main/webapp/export-fonts.css) | Font faces for the export page |
| [mxgraph/css/common.css](../src/main/webapp/mxgraph/css/) | mxGraph base CSS (tooltips, windows, popup menus) |

### 13.2 Images (`images/`, `mxgraph/images/`, `img/`)

[images/](../src/main/webapp/images/) holds UI icons, logos (Google Drive, OneDrive, GitHub, GitLab, Trello), sidebar preview sprites (`sidebar-*.png`), the PWA icons, [images/manifest.json](../src/main/webapp/images/manifest.json) (PWA manifest with `file_handlers`) and `browserconfig.xml`. [mxgraph/images/](../src/main/webapp/mxgraph/images/) holds the handle and cursor images. [img/](../src/main/webapp/img/) holds shape icons ([§8.3](#83-raster-and-svg-image-libraries-imglib)). [shortcuts.svg](../src/main/webapp/shortcuts.svg) is the keyboard-shortcut reference sheet, and [favicon.ico](../src/main/webapp/favicon.ico) is the favicon.

### 13.3 UI Text (`resources/`)

[resources/dia.txt](../src/main/webapp/resources/dia.txt) holds **every UI string** (~2,600 `key=value` lines, English). The UI is English only ([CHG-002](CHANGES.md#chg-002--english-only-user-interface)): there are no translation files, `mxLanguage` is always `'en'` ([§4.4](#44-runtime-configuration-globals-preconfigjs-initjs--2-postconfigjs)), and `App.main` fetches this one bundle at startup (`mxResources.loadDefaultBundle = false`). Strings are looked up with `mxResources.get('key', [params])`, where `{1}` placeholders are filled in. Configuration `resources` overrides strings at runtime (`Editor.applyCustomResources`). Plugins add their own strings with `mxResources.parse('key=Value')`. **When you add a UI string, add it to `dia.txt`.** The *diagram language* feature (`Graph.diagramLanguage`, `label_xx` attributes, *Extras → Diagram Language*) translates diagram content, not the UI, and is unaffected. The `'languageChanged'` event still has listeners but nothing fires it any more.

### 13.4 Templates (`templates/`)

[templates/index.xml](../src/main/webapp/templates/index.xml) is the catalogue: 155 `<template url="basic/flowchart.xml" title="flowchart" libs="general;flowchart" tags="…"/>` entries plus `<clibs name="…">` sets of external custom libraries (e.g. `azure`, `fortinet`, loaded from `jgraph.github.io/drawio-libs`). Templates are grouped in folders (`basic`, `business`, `charts`, `cloud`, `engineering`, `flowcharts`, `layout`, `maps`, `network`, `other`, `software`, `tables`, `uml`, `venn`, `wireframes`), each `name.xml` paired with a `name.png` preview. They are shown by `NewDialog` (both for new files and for *Insert → Template*, via `App.openTemplateDialog`), and licensed CC-BY 4.0 ([templates/LICENSE](../src/main/webapp/templates/LICENSE)).

### 13.5 Math typesetting (`math4/`)

[math4/es5/drawio-mathjax.min.js](../src/main/webapp/math4/es5/drawio-mathjax.min.js) is a single-file MathJax 4 bundle that publishes `window.DrawioMathJax`. [math4/es5/startup.js](../src/main/webapp/math4/es5/startup.js) is a compatibility shim for old embed scripts that loaded MathJax's own `startup.js`. `Editor.initMath` loads the bundle from `DRAW_MATH_URL` when a diagram has `math=1`.

### 13.6 Headless rendering page (`export3.html`)

[export3.html](../src/main/webapp/export3.html) loads `export-init.js` (reads `remoteMath`/`fallbackFont` parameters), `app.min.js`, `extensions.min.js` and **[js/export.js](../src/main/webapp/js/export.js)**. Since CHG-001 the web app never uses this page. It is kept because drawio-desktop's local export pipeline (Electron `render` message, reached through the `createDownloadRequest` override in `ElectronApp.js`) and command-line export render through it, and an external Puppeteer export service could also drive it. The caller invokes `render(data)` with `{xml, format, scale, border, bg, w, h, from, to, pageId, allPages, theme, crop, fit, pageMargin, sheetsAcross, sheetsDown, embedXml, embedFonts, embedImages, …}`. `render` builds a `Graph` in the page, renders the requested pages (through `mxPrintPreview` for PDF, with clickable link annotations collected by `collectAnnotRects`), waits for images, fonts (including Google Fonts) and MathJax, then signals completion so the caller can screenshot or print to PDF.

### 13.7 PWA / service worker

[service-worker.js](../src/main/webapp/service-worker.js) is **generated** (by `GenerateServiceWorker.java`, which is not in this repo) from a `workbox-config*.js` file. Its header says not to edit it by hand. It reproduces Workbox 7.2's precaching without the Workbox runtime, so existing caches stay valid. It precaches a manifest of every app file with MD5 revisions (cache-first, query parameters ignored), lazily caches the entries of `LAZY_MANIFEST` (the `warmLazy` message from `App.main`; it still lists the deleted `dia_xx.txt` files until the worker is regenerated, see CHG-002), supports `warmDev` for offline dev mode, and calls `skipWaiting`. `workbox-05b6c01b.js` and the `.map` files are no longer referenced. Release channels: `?channel=stable` registers `stable/service-worker.js` ([§4.5](#45-appmain-the-startup-sequence)). `clear.html` unregisters it. **If you change the set of shipped files, the service worker must be regenerated**, or offline users keep stale files.

---

## 14. Plugins

A plugin is a script that calls **`Draw.loadPlugin(function(ui) { … })`**, where `ui` is the `App`/`EditorUi` instance. Plugins usually add strings (`mxResources.parse`), actions (`ui.actions.addAction`), menu items (by wrapping `ui.menus.get('extras').funct`), or override prototypes. Loading is handled by [App.main](../src/main/webapp/js/diagramly/App.js#L1150) and [App.loadPlugins](../src/main/webapp/js/diagramly/App.js#L1788):

- `?p=id1;id2` loads IDs from **`App.pluginRegistry`** ([App.js:327](../src/main/webapp/js/diagramly/App.js#L327)).
- Plugins saved in settings (*Extras → Plugins*, `PluginsDialog`) are loaded only if they are same-origin **and** built in, unless `ALLOW_CUSTOM_PLUGINS = true`.
- `plugins=0` or `offline=1` disables plugins. Retired plugins are mapped to built-in features (`App.retiredPlugins`, e.g. `tips` → `Editor.showTooltipIcons`).
- In embed mode, initialisation waits for all plugins (`App.embedModePluginsCount`, with a 5-second timeout).

| ID | File | What it does |
|---|---|---|
| `ex` | [explore.js](../src/main/webapp/plugins/explore.js) | "Explore from here" context-menu item and click-to-explore in chromeless mode (`Graph.exploreFromCell`) |
| `svgdata` | [svgdata.js](../src/main/webapp/plugins/svgdata.js) | Backwards-compatible SVG export with cell metadata attributes |
| `number` | [number.js](../src/main/webapp/plugins/number.js) | A "Numbered" property and View → Number toggle that draws sequence numbers on shapes |
| `props` | [props.js](../src/main/webapp/plugins/props.js) | A floating "Data" window showing the selected cell's attributes; Extras → Extract Data |
| `text` | [text.js](../src/main/webapp/plugins/text.js) | Adds the built-in `extractText` action to the Extras menu |
| `update` | [update.js](../src/main/webapp/plugins/update.js) | Periodically POSTs the page XML to `updateUrl` (from the diagram metadata or `update-url`) and applies the returned updates (`EditorUi.updateDiagram`) |
| `trees` | [trees/trees.js](../src/main/webapp/plugins/trees/trees.js) | A standalone mind-map plugin. The built-in [Trees.js](../src/main/webapp/js/diagramly/Trees.js) provides similar tree behaviour without it |
| `replay` | [replay.js](../src/main/webapp/plugins/replay.js) | Records editing steps (Extras → Record) and replays them from a URL |
| `anon` | [anonymize.js](../src/main/webapp/plugins/anonymize.js) | Extras → Anonymize Current Page (`EditorUi.anonymizeXml`) |
| `tags` | [tags.js](../src/main/webapp/plugins/tags.js) | A "Hidden Tags" window to filter cells by tag |
| `tr` | [trello.js](../src/main/webapp/plugins/trello.js) | Trello embed-mode adapter |
| `nxtcld` | [nextcloud.js](../src/main/webapp/plugins/nextcloud.js) | Nextcloud embed-mode adapter: overrides save and exit to talk to the Nextcloud host, and derives the realtime channel key from an MD5 of the instance and file IDs |
| `rnd` | [random.js](../src/main/webapp/plugins/random.js) | Developer stress-test actions (random labels, swap/place/reorder children) |
| `page` | [page.js](../src/main/webapp/plugins/page.js) | Developer stress-test actions (random page reorders and placements) |
| `ac`, `acj`, `ac148`, `ac148cmnt`, `monday` | (not in repo) | Atlassian Confluence/Jira and monday.com integration plugins, served separately |

`App.publicPlugin` lists the IDs offered in the Plugins dialog. Several plugin headers are copy-pasted ("Sample plugin", "Text extraction plugin"), so read the code rather than the header comment.

---

## 15. Java Server (Servlets)

The editor runs entirely in the browser and needs no server for basic use. The optional Java backend in [src/main/server/java/com/mxgraph/online/](../src/main/server/java/com/mxgraph/online/) is packaged into the WAR and deployed to any Servlet 3.1 container (Tomcat, or Google App Engine via [WEB-INF/appengine-web.xml](../src/main/webapp/WEB-INF/appengine-web.xml)). Servlet mappings are in [WEB-INF/web.xml](../src/main/webapp/WEB-INF/web.xml):

| URL | Servlet | Purpose |
|---|---|---|
| `/proxy` | `ProxyServlet` | CORS/SSRF-safe fetch of remote files and images (disabled unless `ENABLE_DRAWIO_PROXY=1`) |
| `/embed2.js` | `EmbedServlet2` | Generates the JS for the legacy embed script (viewer + requested stencils + pre-fetched URLs) |
| `/i/*` | `ImgurRedirectServlet` | Redirects legacy Imgur links to the lightbox viewer |
| `/github2`, `/gitlab`, `/google`, `/microsoft`, `/dropbox` | `*AuthServlet` | OAuth 2 code ↔ token exchange for each cloud provider |
| `/log` | `LogServlet` | Client-side error logging sink (returns a 1×1 GIF) |

`WellKnownServlet` exists (it serves `/.well-known/microsoft-identity-association.json` on GAE) but is **not mapped** in `web.xml`.

### 15.1 Shared utilities: `Utils`, `Constants`, `mxBase64`

[Utils.java](../src/main/server/java/com/mxgraph/online/Utils.java) holds the security-critical helpers:

- **`validatedAddress(url)`** resolves the host **once** and rejects non-http(s) URLs, ports that are not allowed (`DRAWIO_PROXY_ALLOWED_PORTS`), loopback/link-local/any-local addresses, `.internal`/`.local`/`localhost`/`.arpa` hosts, RFC1918 ranges, `169.254.*`, CGNAT `100.64/10`, IPv6 ULA `fc00::/7`, and every IPv6 transition prefix that embeds IPv4 (6to4, Teredo, NAT64, IPv4-mapped/compatible). `10.*` is allowed only when `ALLOW_INTERNAL_10_NET=1`.
- **`openPinnedConnection(url, addr)`** connects to the *already-validated IP literal*, which defeats DNS-rebinding TOCTOU. It keeps the original `Host` header and uses a custom `PinnedSNISocketFactory` so that TLS SNI and certificate verification still use the real hostname.
- **`checkStreamContent(is)`** sniffs the first 16 bytes and accepts only known formats (HTML/XML/SVG, `<mx…`, PNG, JPEG, GIF, fonts, ZIP (vsdx), OLE (vsd), Gliffy JSON, Lucid JSON). Anything else throws `UnsupportedContentException`.
- `copyRestricted` (`MAX_SIZE` = 20 MB), `setTimeouts` (`HTTP_TIMEOUT` = 29 s, just under the GAE deadline), `setDeadline`/`clearDeadline` (a watchdog that bounds a whole exchange to `HTTP_TOTAL_BUDGET` = 2 min), `inflate`/`deflate`, `encodeURIComponent`, `generateToken`.

[Constants.java](../src/main/server/java/com/mxgraph/online/Constants.java) defines `MAX_REQUEST_SIZE` (50 MB) and `MAX_AREA`. [mxBase64.java](../src/main/server/java/com/mxgraph/online/mxBase64.java) is a fast Base64 codec.

### 15.2 `ProxyServlet`

[ProxyServlet.java](../src/main/server/java/com/mxgraph/online/ProxyServlet.java) serves `GET /proxy?url=…[&base64=1]`. It returns 404 unless `ENABLE_DRAWIO_PROXY=1`. It refuses its own User-Agent (`draw.io`) to avoid loops, follows up to 6 redirects (re-validating each `Location`), enforces the size limit, and content-sniffs the body unless the URL is on the allow-list (Trello attachments, Google Docs). `getCorsDomain` echoes `Access-Control-Allow-Origin` only for `*.draw.io`, `*.diagrams.net`, `*.quipelements.com` and the legacy Confluence Server proxy. On the client, `PROXY_URL` is used by `EditorUi.convertImageToDataUri`, `Editor.isCorsEnabledForUrl` and remote file loading.

### 15.3 OAuth: `AbsAuth` and provider subclasses

[AbsAuth.java](../src/main/server/java/com/mxgraph/online/AbsAuth.java) implements the whole authorization-code flow once, and each provider subclass only sets its token endpoint, redirect path, cookie path and the callback name written into the response page:

| Class | Token endpoint | JS callback in opener |
|---|---|---|
| `GoogleAuth` | `https://www.googleapis.com/oauth2/v4/token` | `onGoogleDriveCallback` (or `onGDriveCallback` via `driveLoader.js` for the Office add-in) |
| `GitHubAuth` | `github_auth_url` secret or `github.com/login/oauth/access_token` | `onGitHubCallback` |
| `GitlabAuth` | `gitlab_auth_url` secret or `gitlab.com/oauth/token` | `onGitLabCallback` |
| `MSGraphAuth` | `login.microsoftonline.com/{tenant|common}/oauth2/v2.0/token` | `onOneDriveCallback` (or `Office.context.ui.messageParent` for the Office add-in) |
| `DropboxAuth` | `api.dropboxapi.com/oauth2/token` | `onDropboxCallback` |

The `*AuthServlet` classes just bind `doGet` to `AbsAuth.doGetAbst` through the [ServletComm](../src/main/server/java/com/mxgraph/online/ServletComm.java) interface, which adapts the [AbsComm](../src/main/server/java/com/mxgraph/online/AbsComm.java) abstraction (cookies, headers, body) to `HttpServletRequest`/`Response`. The abstraction exists so that the same auth code can run on other runtimes.

The flow in `doGetAbst`:

1. **`?getState=1`** creates a random state `key.random` (256-bit, base-32), caches it under `key` (EHCache through [CacheFacade](../src/main/server/java/com/mxgraph/online/CacheFacade.java), 5-minute TTL, or memcached if `DRAWIO_MEMCACHED_ENDPOINT` is set), sets an `auth-state` cookie (10 min, `HttpOnly; Secure; SameSite=None` unless `DRAWIO_USE_HTTP=1`) and returns the state.
2. **The provider redirects back with `?code=…&state=domain=…&cId=…&token=…&ver=…&redirect=…&path=…`**. The state token must match the cached value that the cookie points to (CSRF protection; it fails closed).
3. When the cookie is missing (cross-site iframes, partitioned cookies), there are two fallbacks:
   - **code relay** (`relay=1`): the popup returns a page that only hands `{authCode, state, token}` to its opener.
   - **code exchange**: the app then calls the endpoint itself with header `X-Auth-Code-Exchange: 1` (same-origin only, checked through `Sec-Fetch-Site`), and the single-use cached state is accepted in place of the cookie.
4. `contactOAuthServer` POSTs `client_id`/`client_secret`/`code` (or `refresh_token`) to the provider, and returns `{access_token, expires_in}` either as JSON or wrapped in the HTML/JS callback page. The **refresh token is stored in an `HttpOnly` cookie** `auth-token<clientId>` (1 year). Google stores several `userId:refreshToken` pairs in one cookie, resolved through `?userId=`.
5. `?doLogout=1` deletes the refresh-token cookie.

Client IDs and secrets are read by [SecretFacade](../src/main/server/java/com/mxgraph/online/SecretFacade.java) from files in `WEB-INF/` (`google_client_id`, `google_client_secret`, …). These are **empty placeholders** in the repo, and the Docker image writes real values. Several client IDs and secrets may be stored separated by `/:::/`.

### 15.4 `EmbedServlet2`

[EmbedServlet2.java](../src/main/server/java/com/mxgraph/online/EmbedServlet2.java) answers `GET /embed2.js?s=lib1;lib2&fetch=url…`. It maps library names to shape JS and stencil XML (`initLibraries`), reads and caches them from the WAR, and pre-fetches any `fetch=` URLs (SSRF-validated, pinned, sharing one time budget) into `GraphViewer.cachedUrls[...]`. It emits a script that defines `window.onDrawioViewerLoad` (which parses stencils, runs the shape JS, and calls `GraphViewer.processElements()`), then injects `viewer-static.min.js` from `www.draw.io`. `?stats` prints deployment and version information, which the release watchdog uses.

### 15.5 `LogServlet`, `ImgurRedirectServlet`

The former `ExportProxyServlet` (`/export`, `/service/*`, a reverse proxy to an external export server named by the `EXPORT_URL` environment variable) was **removed in CHG-001**.

- [LogServlet.java](../src/main/server/java/com/mxgraph/online/LogServlet.java) logs `msg`, `severity`, `v` (version) and `stack` with `java.util.logging`, and downgrades known third-party noise.
- [ImgurRedirectServlet.java](../src/main/server/java/com/mxgraph/online/ImgurRedirectServlet.java) redirects `/i/<id>` to `app.diagrams.net/?lightbox=1&url=…i.imgur.com/<id>.png`.

### 15.6 Deployment configuration

| Setting | Where | Effect |
|---|---|---|
| `ENABLE_DRAWIO_PROXY=1` | env | Enables `/proxy` |
| `DRAWIO_PROXY_ALLOWED_PORTS=8080,…` | env | Extra ports allowed for proxied URLs |
| `ALLOW_INTERNAL_10_NET=1` | env | Allows `10.0.0.0/8` targets |
| `DRAWIO_USE_HTTP=1` | env | Drops `Secure` from cookies (insecure, for local use) |
| `DRAWIO_MEMCACHED_ENDPOINT` | env | Uses memcached instead of EHCache for OAuth state |
| `WEB-INF/<provider>_client_id/_secret` | files | OAuth credentials |
| `WEB-INF/lib/*.jar` | files | Runtime dependencies: Gson, commons-text/lang3/codec, httpclient, EHCache, JCache API, SLF4J, servlet-api |

[log4j.properties](../src/main/server/java/log4j.properties) and [WEB-INF/logging.properties](../src/main/webapp/WEB-INF/logging.properties) configure logging. `appengine-web.xml` adds security headers to static files and pins `cache-api` to resolve a class-loader conflict.

---

## 16. Security Model

Diagram files, pasted content, collaboration messages, embed messages and URLs are all **untrusted input**. The codebase defends in depth, and these defences are easy to break by accident, so review changes in these areas carefully:

| Threat | Defence | Where |
|---|---|---|
| XSS through HTML labels | DOMPurify with a strict `DOM_PURIFY_CONFIG` (no data-attributes except an allow-list, no `javascript:` anywhere, no `<form>`), `afterSanitizeAttributes` hooks (drop markup-looking attribute values, `url()` in styles, external `<use>`, `@import`), `Graph.isStyleAllowed` for CSS | [grapheditor/Init.js](../src/main/webapp/js/grapheditor/Init.js), [Graph.domPurify](../src/main/webapp/js/grapheditor/Graph.js#L4668), [etc/dependencies/dompurify-smoke.js](../etc/dependencies/dompurify-smoke.js) |
| Malicious links | `Graph.sanitizeLink`, `openLink` with `noopener noreferrer`, `isSafeLinkTarget`, custom-link action validation | `Graph.js`, `diagramly/Editor.js` |
| Prototype pollution through XML or JSON | `mxObjectCodec.isPollutionKey`, null-prototype maps (`mxStyleRegistry`, `mxStencilRegistry`, `mxMarker`, `App.storages`), `EditorUi.isPrototypePollutionKey`/`patchMap`/`patchList` for patches, `mxStylesheet.putCellStyle` name checks | mxGraph `io/`, `view/`, `DiffSync.js` |
| Model hijack through malformed files | `mxModelCodec` decodes only `<root>`/`<defs>` and repairs orphan roots | [mxModelCodec.js](../src/main/webapp/mxgraph/src/io/mxModelCodec.js) |
| Untrusted `eval` | `mxStencilRegistry.allowEval = false` in production (shapes are preloaded), `mxCodec.isConstructorAllowed` | `App.main`, `Graph.js` |
| Hostile embedders or openers | `configure=1` only with `embed=1`, message source checks (`evt.source == parent`), no server-side export path at all (CHG-001), AI endpoints and keys configuration-only (`Editor.isAllowedAiEndpoint`), `App.blockedAncestorFrames` | `Init.js`, `App.js`, `EditorUi.installMessageHandler`, `Editor.js` |
| Collaboration tampering | Encrypted channel messages (CryptoJS AES with the channel key, failing closed if encryption is unavailable), protocol and version gates, patches validated, legacy-key messages trusted for nothing but notifications | `DrawioFileSync.js`, `P2PCollab.js`, [js/cryptojs/README.md](../src/main/webapp/js/cryptojs/README.md) |
| SSRF through the proxy or embed fetch | `Utils.validatedAddress` + `openPinnedConnection` (DNS-rebinding safe), port allow-list, content sniffing, size and time limits, proxy off by default | [Utils.java](../src/main/server/java/com/mxgraph/online/Utils.java), `ProxyServlet`, `EmbedServlet2` |
| OAuth CSRF / login CSRF | Single-use cached state + `HttpOnly` cookie, same-origin code exchange header, redirect path validation | [AbsAuth.java](../src/main/server/java/com/mxgraph/online/AbsAuth.java) |
| Script injection in general | Per-host Content-Security-Policies | [Devel.js](../src/main/webapp/js/diagramly/Devel.js) CSP block, `bootstrap.js` (Electron) |
| Diagram data leaving the browser for export | No export service: all export is client-side (CHG-001) | `Menus.js`, `EditorUi.js` |
| Resource exhaustion from imports | Output limits in importers (e.g. `MAX_OUTPUT_CELLS`), `MAX_AREA`, canvas size limits, zoom limits, guide limits | `Extensions.js`, `Graph.js`, `export.js` |

Report security issues as described in [SECURITY.md](../SECURITY.md).

---

## 17. Cross-cutting Conventions

### 17.1 Code style

- ES5-compatible JavaScript (a few newer files and the Electron code use `let`, arrow functions and `async`), Allman braces, tab indentation, JSDoc-style `/** … */` comments above every function. Match the surrounding style. [docs/code-review.md](code-review.md) lists the review criteria.
- Classes: `function Foo(args) { Base.call(this, …); }` + `mxUtils.extend(Foo, Base)` + `Foo.prototype.method = function() {…}`. Static configuration lives on the constructor (`Editor.foo`, `Graph.bar`) or on the prototype as overridable defaults (`Graph.prototype.defaultEdgeLength`).
- Extending behaviour: save the original method and replace it (`var fooFn = X.prototype.foo; X.prototype.foo = function() { fooFn.apply(this, arguments); … }`). This is how the diagramly layer, the themes and the plugins all work, so **load order decides the outcome**.
- `mxUtils.bind(this, fn)` (rather than `Function.prototype.bind`) for callbacks.
- Asynchronous APIs take `(success, error)` callbacks rather than promises. Errors are passed to `ui.handleError(err, title)`.

### 17.2 Events

Everything observable is an `mxEventSource`. Use `obj.addListener('name', function(sender, evt) { evt.getProperty('x'); })`. Important events:

| Source | Events |
|---|---|
| `graph.getModel()` | `mxEvent.CHANGE` (after each transaction), `mxEvent.UNDO`, `mxEvent.EXECUTE(D)`, `BEGIN_UPDATE`/`END_UPDATE` |
| `graph` | `mxEvent.CLICK`, `DOUBLE_CLICK`, `CELLS_ADDED`, `CELLS_MOVED`, `CELLS_RESIZED`, `EDITING_STARTED/STOPPED`, `ROOT`, `SIZE`, `ESCAPE`, `FIRE_MOUSE_EVENT`, `'cellsArranged'` |
| `graph.getSelectionModel()` | `mxEvent.CHANGE` |
| `editor` | `'statusChanged'`, `'resetGraphView'`, `'fileLoaded'`, `'autosaveChanged'`, `'updateGraphComponents'` |
| `editorUi` | `'styleChanged'`, `'currentThemeChanged'`, `'darkModeChanged'`, `'languageChanged'` (no longer fired, CHG-002), `'pageSelected'`, `'pagesPatched'`, `'clientLoaded'`, `'fileDescriptorChanged'`, `'gridEnabledChanged'`, `'backgroundColorChanged'`, … |
| `file` (DrawioFile) | `'descriptorChanged'`, `'contentChanged'`, `'realtimeMessage'`, `'realtimeStateChanged'` |

### 17.3 Style strings

A cell's appearance is a semicolon-separated string: `[namedStyle;]key=value;key=value;`. Common keys are in `mxConstants.STYLE_*`, plus many draw.io keys (`html`, `whiteSpace`, `rounded`, `sketch`, `childLayout`, `container`, `collapsible`, `part`, `treeFolding`, `newEdgeStyle`, `libavoidRouting`, `transparentBounds`, `lockedGroup`, `cssVars`, …). Use `mxUtils.setStyle(style, key, value)` and `graph.setCellStyles(key, value, cells)` to change them, never string concatenation. Colours may be `#hex`, `rgb()`, `light-dark(a,b)`, `default` (the theme colour), `inherit`, `none` or `swimlane`.

### 17.4 User objects and placeholders

When a cell has custom properties its value is an XML element (`<UserObject label="…" key="value">` or `<object>`). Use `graph.getAttributeForCell`/`setAttributeForCell` and `graph.convertValueToString`. With `placeholders="1"`, labels can contain `%key%`, which resolves to cell, ancestor, file (`vars`) or global variables (`%page%`, `%pagenumber%`, `%date{…}%`, …) through `Graph.replacePlaceholders`.

### 17.5 Settings, configuration and URL parameters

| Mechanism | Scope | Read via |
|---|---|---|
| URL parameters | Per page load | `urlParams['x']` (parsed in `bootstrap.js`, normalised in `Init.js`) |
| Global `window.*` variables | Deployment | `PreConfig.js` / `Init.js` |
| Configuration JSON | Deployment or user (*Extras → Configuration*) | `Editor.configure` → `Editor.*` |
| `mxSettings` (localStorage `.drawio-config`) | Per browser user | `mxSettings.getX()`/`setX()`/`save()` |
| File attributes (`<mxGraphModel>`, `<mxfile>`) | Per diagram | `Editor.readGraphState`, `fileNode.getAttribute` |

### 17.6 Dialog conventions

New dialogs should use `CustomDialog` and `ui.showDialog(dlg.container, width, null /* auto height */, true, true)`, built from the CSS classes `geDialogSection`, `geDialogFormRow`, `geDialogCheckRow`, `geDialogInlineFields`, `geDialogHint`. Use `addCheckbox(..., useCheckRow=true)` and `addAdvancedSection`. Never hard-code colours (use the CSS variables and `light-dark()`), and keep Tab focus inside the dialog (`Dialog.installFocusTrap`). The full rules are in [docs/dialog-style-guide.md](dialog-style-guide.md). Test dialogs with `?dev=1&ui=classic`.

### 17.7 Debugging aids

- `?dev=1` runs the unminified sources. `?test=1` enables `EditorUi.debug(...)` console logging and the developer test menu items. `?dev-tooltips=1` shows cell IDs and points in tooltips. `?print-csp=1` prints the CSPs.
- `EditorUi.logError`/`logEvent` report to `DRAWIO_LOG_URL` (`log.diagrams.net` on the official hosts, and empty otherwise).
- *Extras → Edit Diagram* shows and edits the raw XML. `mxLog.show()` opens the mxGraph console.
- [ChangeLog](../ChangeLog) entries often reference the GitHub issue behind a behaviour (`[jgraph/drawio#NNNN]`).

---

## 18. How-to Guide for Common Changes

| Task | Where and how |
|---|---|
| **Record a change** | Add a `CHG-NNN` entry to [CHANGES.md](CHANGES.md) using its template, update the affected sections of this document, and keep the open follow-ups list current. |
| **Run locally from source** | Serve `src/main/webapp` with any static HTTP server and open `/index.html?dev=1`. The servlets are only needed for OAuth, the proxy and export (build the WAR or use the drawio Docker image). |
| **Build release bundles / WAR** | `cd etc/build && ant` (all bundles) or `ant war` (bundles + servlets → `build/draw.war`). Commit the regenerated `js/*.min.js` files, because production loads them ([§3](#3-build-system-and-release-artefacts)). |
| **Add a new JS source file** | Add it to **both** [Devel.js](../src/main/webapp/js/diagramly/Devel.js) (dev) and the matching `<jscomp>`/`<concat>` in [build.xml](../etc/build/build.xml) (prod), in the right dependency order. |
| **Add a menu command** | `ui.actions.addAction('myAction...', fn, enabled, iconCls, shortcut)` (in `grapheditor/Actions.js` or `diagramly/Menus.js`), a string `myAction=…` in `resources/dia.txt`, then add `'myAction'` to a menu's `addMenuItems` list in `Menus.js` (and to the theme menus in `Simple.js`/`Minimal.js` if needed). Update enabled states in `EditorUi.updateActionStates`. |
| **Add a keyboard shortcut** | `EditorUi.createKeyHandler` (`keyHandler.bindAction(code, control, 'action', shift)`), or the `keyboardShortcuts` configuration key at runtime. |
| **Add a built-in shape** | Subclass in [grapheditor/Shapes.js](../src/main/webapp/js/grapheditor/Shapes.js) (or a `shapes/*.js` file for a domain shape), `mxCellRenderer.registerShape('name', Ctor)`, connection points via `prototype.constraints`/`getConstraints`, handles via `Graph.handleFactory`, then add a sidebar entry ([§8](#8-shapes-stencils-and-shape-libraries)). |
| **Add a shape library** | New `diagramly/sidebar/Sidebar-X.js` with `Sidebar.prototype.addXPalette`, registered in `sidebar/Sidebar.js` (`configuration`, `initPalettes`), plus `Devel.js` and `build.xml` ([§8.4](#84-sidebar-libraries-jsdiagramlysidebar)). |
| **Add a Format panel option** | The relevant panel in [Format.js](../src/main/webapp/js/grapheditor/Format.js): `createCellOption(label, styleKey, default)` or `createColorOption`. Read selection info from `ui.getSelectionState()` (extend `EditorUi.updateSelectionStateForCell` if new information is needed). |
| **Add a configuration key** | Handle it in [Editor.configure](../src/main/webapp/js/diagramly/Editor.js#L2964) (set an `Editor.*` static or prototype default), and expose it in `ConfigEditor.js` if it should be editable visually. |
| **Add a URL parameter** | Read `urlParams['name']`. Normalise or derive it in `diagramly/Init.js` if it affects startup. Never let URL parameters choose endpoints or keys ([§16](#16-security-model)). |
| **Add an embed protocol action** | Add a `data.action == 'x'` branch in [EditorUi.installMessageHandler](../src/main/webapp/js/diagramly/EditorUi.js#L26751), reply with `parent.postMessage(JSON.stringify({event: 'x', …}), '*')`, and keep the source check. |
| **Add a storage back-end** | A `DrawioClient` subclass (auth, `getFile`, `insertFile`, `saveFile`, pickers), a `DrawioFile` subclass (`getHash`, `getMode`, `saveFile`, …) and a `*Library`, plus a mode in `App.storages` with a unique hash `char`, creation in `App.init`, and dispatch in `App.createFile`/`pickFile`/`getServiceForName` ([§10](#10-files-storage-back-ends-and-libraries)). |
| **Change what is saved in files** | Diagram-level attributes: `Editor.getGraphXml`/`readGraphState` (and `Graph.getViewState`/`saveViewState` for per-page state). File-level: `EditorUi.createFileData`/`getXmlFileData`. Keep DiffSync's `viewStateProperties` in sync so collaboration carries the new property. |
| **Change default look** | [styles/default.xml](../src/main/webapp/styles/default.xml) (diagram defaults), [styles/grapheditor.css](../src/main/webapp/styles/grapheditor.css) `:root` variables (UI), or the `defaultVertexStyle`/`defaultEdgeStyle`/`css` configuration keys. |
| **Add or modify UI text** | Edit `resources/dia.txt`, the only UI string bundle (English only, CHG-002). |
| **Write a plugin** | `Draw.loadPlugin(function(ui) { … })` in `plugins/x.js`, registered in `App.pluginRegistry` (and `App.publicPlugin` to list it) or allowed through `ALLOW_CUSTOM_PLUGINS` ([§14](#14-plugins)). |
| **Self-host configuration** | `PreConfig.js` (`DRAWIO_CONFIG`, base URLs), `WEB-INF/*_client_id/secret`, and the environment variables in [§15.6](#156-deployment-configuration). |
| **Update a vendored library** | Replace the file in `js/<lib>/`, follow that folder's README (e.g. CryptoJS, pako, libavoid), run `etc/dependencies/dompurify-smoke.js` for DOMPurify, bump `etc/dependencies/package.json`, rebuild. |

---

## 19. Glossary

| Term | Meaning |
|---|---|
| **Cell** | An `mxCell`: a vertex (shape), an edge (connector), a layer, or the root |
| **Layer** | A direct child of the model root. Content cells live inside layers |
| **Cell state** | `mxCellState`: the cached, scaled, absolute geometry, style and DOM shapes of a cell in the view |
| **Style** | A `key=value;` string on a cell, resolved against the stylesheet (`styles/default.xml`) into an object |
| **Stencil** | An XML shape description interpreted by `mxStencil`, referenced as `shape=mxgraph.pkg.name` |
| **Page** | A `<diagram>` in an `<mxfile>`, wrapped by `DiagramPage`. Only the current page's root is in the live model |
| **mxfile** | The root element of a draw.io file (pages plus metadata) |
| **Chromeless** | The editor without UI chrome (`chrome=0`, lightbox, viewer). Non-editable unless `editable` |
| **Lightbox** | A full-window read-only viewer of a diagram (`lightbox=1`, viewer.diagrams.net) |
| **Embed mode** | The editor framed by a host page and driven by `postMessage` (`embed=1`) |
| **Mode** | The current storage (`App.MODE_GOOGLE`, `device`, `browser`, …), shown as the hash prefix (`#G`, `#L`, …) |
| **Descriptor** | Storage metadata of a file (id, title, etag/revision, permissions), held in `file.desc`/`file.meta` |
| **Shadow pages** | A copy of the last saved pages, used as the base for diffs, merges and conflict resolution |
| **Patch / diff** | JSON describing page and cell inserts, removes and updates (`EditorUi.diffPages`/`patchPages`) |
| **Realtime / fast sync** | Live sharing of patches, cursors and selections through the relay socket (`P2PCollab`) |
| **Draft** | An unsaved local copy in the browser database, offered for recovery at startup |
| **Library** | A custom palette stored as an `<mxlibrary>` file. **Scratchpad**: the built-in personal library |
| **Placeholder** | A `%name%` token in a label, resolved from cell, file or global variables |
| **Theme (UI)** | `kennedy` (classic), `simple`, `sketch`, `min`, `atlas`: the editor chrome layout |
| **Adaptive colours** | Automatic light/dark variants of diagram colours (`adaptiveColors`, `light-dark()`) |
| **Sketch** | The hand-drawn rendering style (`sketch=1`, rough.js), or the sketch UI theme |
| **childLayout** | A container style that automatically lays out its children (stack, table, ELK, …) |
| **Locked group / transparentBounds** | Group behaviours: children not individually selectable; bounds derived from the children |
| **Hover icons** | The blue arrows around a hovered shape for quick connect and clone (`HoverIcons`) |
| **Shape picker** | The popup of shapes shown when dropping an edge on empty space or double-clicking the background |

---

## 20. Data Flow Diagrams (fork feature)

A fork-only feature for visualising data flow between systems. The agreed design is in [DATAFLOW.md](DATAFLOW.md), and progress is tracked as one CHG entry per phase in [CHANGES.md](CHANGES.md). All five phases are implemented; this section describes the code.

| Phase | State |
|---|---|
| 1. Catalog (storage, integrity rules, undo) | **Done** (CHG-003) |
| 2. Systems & datasets (palette, dialogs, shapes, editing, deletion) | **Done** (CHG-004) |
| 3. Actions (four actions, connection rules, streams, dialogs, lineage, validation highlight, needs-setup/attention) | **Done** (CHG-005) |
| 4. Model view (layers, tables, relationships, lineage, switch, model editing) | **Done** (CHG-006) |
| 5. Hardening (copy and paste, performance, docs) | **Done** (CHG-007) |

### 20.1 Files and loading

The sources are in [js/diagramly/dataflow/](../src/main/webapp/js/diagramly/dataflow/). They are loaded after the diagramly core: by [Devel.js](../src/main/webapp/js/diagramly/Devel.js) in dev mode, and compiled into `app.min.js` by the Step 9 source list in [etc/build/build.xml](../etc/build/build.xml). They are not part of the viewer bundles, which only need the materialised cells (DATAFLOW.md §5.1): the viewer and every export draw data flow shapes with no extra code. The UI strings are the `df*` keys in `resources/dia.txt`, and the attribute editor's CSS is the `.geDataFlow*` block at the end of `styles/grapheditor.css`.

| File | Contents |
|---|---|
| [DataFlow.js](../src/main/webapp/js/diagramly/dataflow/DataFlow.js) | `DataFlow` namespace: the catalog attribute name and version, action types, cardinalities, the ID pattern, and the colours, sizes and [cell styles](../src/main/webapp/js/diagramly/dataflow/DataFlow.js#L88) of every shape |
| [DataFlowCatalog.js](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js) | The catalog class and its storage on the page |
| [DataFlowStreams.js](../src/main/webapp/js/diagramly/dataflow/DataFlowStreams.js) | Connection rules, streams and action states (no changes to the model) |
| [DataFlowModel.js](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js) | Model view: layers, view switching, tables and columns, relationship and lineage edges, placement and layout |
| [DataFlowView.js](../src/main/webapp/js/diagramly/dataflow/DataFlowView.js) | Catalog → cells: creates system, dataset, attribute-row and action cells; `sync` re-renders every shape and edge from the catalog |
| [DataFlowDialogs.js](../src/main/webapp/js/diagramly/dataflow/DataFlowDialogs.js) | System, Dataset, Export, Filter, Validation and Addition dialogs; the attribute editor, the stream tree and the mapping rows |
| [DataFlowUi.js](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js) | Editor integration (`ui.dataFlow`): palette, drop handling, double-click, context menu, deletion, drop rules |

### 20.2 The catalog

[DataFlowCatalog](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L15) holds the systems, datasets, attributes, actions and relationships of one page.

- **Data structures:** null-prototype maps keyed by ID (format in DATAFLOW.md §4.2). The class has no DOM or graph access.
- **Changes:** made only through its methods (`addSystem`, `addDataset`, `setDatasetAttributes`, `addRelationship`, `addAction`, `setActionConfig`, `remove*`, …).
- **Validation:** invalid input throws before anything changes.
- **Cascades:** removals cascade (DATAFLOW.md §4.3) and return a report `{systems, datasets, attributes, actions, relationships, flagged}`.
  - Actions whose configuration lost a reference get an `attention` entry rather than being rewritten.
  - [removeDataset](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L1027) shows the pattern.
  - [getRemovalImpact](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L1397) runs a removal on a copy, for confirmation dialogs.

**Storage.** The catalog is JSON in the `dataflow` attribute of the page's **root cell**.
- [read](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L184) parses it into a new instance.
- [write](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L206) stores it with `graph.setAttributeForCell`, so the change is an undoable `mxValueChange`. Nothing is written if the JSON is unchanged.
- [edit](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L223) wraps read → change → write in one model transaction. Cell changes made inside the callback are undone together with the catalog, and nothing is stored if the callback throws.

Because the catalog lives on the root cell:
- each page has its own catalog;
- duplicating a page copies it;
- other page data (*Edit Data* on the background) is kept;
- it is saved compressed or uncompressed like any cell value.

**Loading untrusted files.** [load](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L307) treats the JSON as untrusted (§16).
- **Dropped:** invalid IDs (including `__proto__`, `constructor` and `prototype`), wrong types, dangling references and unknown action types.
- **Repaired:** names are truncated, attribute lists are de-duplicated, and an invalid cardinality becomes `1:M`. Cardinalities written with `N` before CHG-008 (`1:N`, `N:1`, `N:M`) load as `1:M`, `M:1`, `M:M` (`DataFlow.normalizeCardinality`).
- **Action configurations** go through [sanitizeConfig](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L575).
- **Reporting:** repairs are collected in `warnings` and logged once per stored text. Invalid JSON reads as an empty catalog.

### 20.3 Shapes and editing

**Shapes are ordinary cells.**
- **System shape:** a swimlane with a stack layout. Its value is an `object` with `dfType="system"`, `dfId` (the catalog ID), an HTML `label` (name, owner, environment chip) and a `tooltip` (the notes).
- **Dataset shape:** a collapsible swimlane inside a system, collapsed by default.
- **Attribute rows:** text cells inside a dataset, one per attribute. They can't be moved, deleted or edited on their own.
- **Entity text** is always HTML-escaped before it goes into a label.

**Actions and flow edges.**
- **Action shape:** one built-in shape per type (rounded box, inverted trapezoid, hexagon, ellipse; [DataFlow.ACTIONS](../src/main/webapp/js/diagramly/dataflow/DataFlow.js#L117)). The label is inside: glyph and name, a V-number badge for validations, and an amber "!" when the action needs attention. The value carries `dfType="action"`, `dfId` and `dfAction` (the type).
- **Needs setup:** while connections are missing or the dialog is not done, the shape is a dashed outline. Its tooltip says what is missing or what no longer matches.
- **Flow edges** carry `dfType="flow"` and a role in `dfRole`: `primary` (enters left), `secondary` (enters at the bottom, dashed), `output` (action → system) or `invalid` (red dashed, with the reason as tooltip). [syncEdge](../src/main/webapp/js/diagramly/dataflow/DataFlowView.js#L446) sets the role and style. It keeps a role while it stays valid, and gives the bottom port or a taken primary input the secondary role.

**Streams and rules** ([DataFlowStreams.js](../src/main/webapp/js/diagramly/dataflow/DataFlowStreams.js)):
- [getConnection](../src/main/webapp/js/diagramly/dataflow/DataFlowStreams.js#L167) applies the rules of DATAFLOW.md §6.2, including loops through action-to-action edges.
- [getNodeStream](../src/main/webapp/js/diagramly/dataflow/DataFlowStreams.js#L267) computes what flows on: a system shape passes its datasets, a Validation its input, an Addition its input plus the added dataset. Export and Filter continue from their target system.
- [getActionState](../src/main/webapp/js/diagramly/dataflow/DataFlowStreams.js#L417) returns missing connections, whether the dialog is done, and problems: catalog `attention` flags, plus inputs that no longer contain what the configuration uses.

**Dialogs and apply.**
- [configureAction](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L1135) opens the dialog of the type.
- `applyExport` and `applyFilter` create or update the output datasets in the target system. [setDerivedAttributes](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L1226) keeps attribute IDs per source, so lineage and relationships survive re-configuring, makes names unique, and keeps hand-added attributes. Each shows its dataset in the target system shape.
- `applyValidation` stores the pairs.
- `applyAddition` replaces the Addition's relationships.
- Unchecking a dataset in a Filter deletes its copy (an explicit choice). Upstream changes never delete outputs.

**Sync.** [DataFlowView.update](../src/main/webapp/js/diagramly/dataflow/DataFlowView.js#L660) runs a catalog edit and then [sync](../src/main/webapp/js/diagramly/dataflow/DataFlowView.js#L558) in the same transaction. Sync updates labels and tooltips, rebuilds attribute rows that no longer match the catalog, and removes the shapes of entities that no longer exist (D17). One undo therefore reverts the entity and all its shapes.

**Editor hooks** ([DataFlowUi.init](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L21)):

| Hook | Behaviour |
|---|---|
| `Sidebar.init` | Adds the *Data Flow* palette (System, Dataset) above *General*. It is always shown and is not in the library configuration. |
| [Sidebar.createDropHandler](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L1875) | Dropping or clicking a palette item (a cell with `dfTemplate`) opens a dialog instead of inserting cells. A Dataset needs a system: the drop target, or the selected system when clicked. Its drop position sets its place in the stack. |
| `mxEvent.DOUBLE_CLICK` | Opens the System or Dataset dialog. A row opens its dataset. Label editing is off (`editable=0`). |
| `mxEvent.REMOVE_CELLS` | Inside the removal transaction, [cellsRemoved](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L432) deletes the entities whose last shape was removed (D19). |
| `graph.isValidDropTarget` | A system accepts only its own datasets, a dataset accepts nothing, and datasets can't be dropped anywhere else. |
| `graphHandler.shouldRemoveCellsFromParent` | Datasets can't be dragged out of their system. |
| `Menus.createPopupMenu` | Context menu: *Edit System…*, *Add Dataset…*, *Edit Dataset…*, *Delete Everywhere…*, *Configure Action…* |
| `mxEvent.CELLS_ADDED` | Copied action shapes (paste, duplicate, Ctrl+drag) get a new, unconfigured action. An action has one shape. |
| `mxEvent.CELL_CONNECTED` | Any connection touching a data flow node re-syncs, which sets edge roles and action states. |
| `graph.getEdgeValidationError` / `validationAlert` | Refuses connections that break the rules while dragging, and explains why in a dialog instead of `window.alert`. |
| `connectionHandler` `CONNECT` | Opens the action's dialog once its last required connection is made. |
| [graph.deleteCells](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L136) | Asks before a delete whose cascade removes relationships or changes actions beyond the selection. |
| Selection and model changes | Selecting a Validation dims every shape it doesn't compare (opacity on the SVG nodes only, not a model change). |

**Public methods** (used by the dialogs and the tests): `placeSystem`, `placeDataset`, `placeAction`, `editSystem`, `editDataset`, `deleteEntity`, `showSystemDialog`, `showDatasetDialog`, `configureAction`, `applyExport`, `applyFilter`, `applyValidation`, `applyAddition`, `editCell`.

**Re-entrancy.** `DataFlowUi.update` counts nested calls (`updating`). The `CELLS_ADDED`, `CELL_CONNECTED` and `REMOVE_CELLS` handlers ignore changes made by its own updates and by `sync` (`DataFlowView.syncing`).

**Folding.** Datasets stay `resizable`, because `Graph.isCellFoldable` refuses non-resizable containers. The stack layout sets their size anyway.

### 20.4 Model view

The model view lives in the same page as the flow, in layers marked with `dfLayer` (DATAFLOW.md §7):

| Layer | Contents |
|---|---|
| `flow` | The existing layer of the flow shapes. It is marked the first time the model view is shown and is otherwise unchanged. |
| `model` ("Data Model") | One table per dataset (`dfType="table"`, a swimlane in the system's palette colour) with one row per attribute (`column`), plus relationship edges (`relationship`) between rows: ER markers per side of the cardinality (`1` → `ERmandOne`, `M` → `ERmany`), labelled with the cardinality and "· Addition" for Addition relationships. |
| `lineage` | One dashed edge per pair of datasets (`lineage`, with `dfFrom`/`dfTo`), labelled with the number of copied attributes. Rows that are copies show a ↳ mark with the source in the tooltip. |

- **Switching views.** [applyView](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js#L186) shows one layer and hides (and locks) the other. The lineage layer is shown only in the model view with *Show lineage* on. The view is stored on the page root (`dfView`, `dfLineage`), and switching is one undoable edit.
- **The view switch.** [createViewBar](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L1621) is a *Flow | Model* switch centred over the canvas, shown on pages that have a catalog, with *Show lineage* and *Re-arrange* in the model view. It is placed in the canvas's parent (the canvas scrolls) and repositioned by a wrapper on `EditorUi.refresh`, page changes and model changes. The background context menu also offers *Show Model View* / *Show Flow View*. The viewer switches through its layers button.
- **Sync.** Once the model layer exists, [DataFlowModel.sync](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js#L412) runs at the end of every `DataFlowView.sync`, so the model is always current and table positions are never reset. [syncColumns](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js#L350) reuses the cell of each attribute, so relationship edges stay attached through renames and reordering. New tables are placed by [placeTable](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js#L685): right of a related table, otherwise right of all tables, then moved down until nothing overlaps. Removals use `DataFlowModel.removeCells`, because `graph.removeCells` skips `deletable=0` cells.
- **Layout.** [arrange](../src/main/webapp/js/diagramly/dataflow/DataFlowModel.js#L750) runs the first time and on *Re-arrange*. It puts tables in columns by lineage depth (originals, then their copies, …) and groups them by system within a column. It is deterministic, instead of draw.io's hierarchical layout.
- **Editing.**
  - Drawing from row to row is intercepted in [connectionHandler.connect](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L204): no edge is inserted. The cardinality picker opens and the relationship is added to the catalog; sync draws it.
  - Double-clicking a relationship changes its cardinality; double-clicking a table or row edits the dataset.
  - Deleting a relationship edge deletes the relationship, which flags its Addition. Deleting a table asks first, then deletes the dataset everywhere.
  - Rows can't be moved or deleted. Relationship and lineage edges can't be disconnected (`isCellDisconnectable`). Lineage edges can't be deleted.
  - Palette drops in the model view ask to switch back to the flow view. Flow placements always go to the flow layer (`getFlowLayer`).

### 20.5 Copy and paste

Shapes carry their entities through the clipboard, so copy and paste, cut and paste, and pasting into another page or file keep their data:

- **Copying.** The per-graph wrapper on `encodeCells` (used by copy, cut, libraries and drag between windows) calls [addFragments](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L795). It adds a `dfData` attribute to every encoded data flow cell with a catalog fragment from [extract](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L1417):
  - a system: the system;
  - a dataset or table: the dataset with its attributes and system;
  - an action: the action;
  - a relationship edge: the relationship.

  The shapes on the page are not changed.
- **Pasting.** [cellsAdded](../src/main/webapp/js/diagramly/dataflow/DataFlowUi.js#L840) runs inside the paste transaction:
  - It imports what the page lacks with [importFragment](../src/main/webapp/js/diagramly/dataflow/DataFlowCatalog.js#L1480). IDs are kept, because they are random, so an existing ID is the same entity. The merged result is validated like a loaded file, so clipboard data from anywhere is untrusted input (§16).
  - It strips `dfData`.
  - A dataset that lands outside its system moves into a shape of that system that doesn't show it yet, or is dropped. Loose attribute rows, and model-view cells pasted outside the model layers, are dropped.
  - A copy of an action shape gets its own new action.
  - Imported entities that ended up without shapes are removed again (D19).
- **Limits.**
  - Relationships removed by a cut stay removed unless their edges were in the cut.
  - An action pasted without its output dataset is unconfigured.

### 20.6 Performance

[perf.test.js](../etc/test/dataflow/perf.test.js) builds 50 systems with 10 datasets of 8 attributes (500 datasets, 4,000 attributes) plus 25 configured Exports. Measured in headless Firefox (dev mode and bundles alike):

| Operation | Time |
|---|---|
| Rename a system, edit a dataset (full sync) | ≈ 80 ms |
| Configure an Export | ≈ 135 ms |
| Edit while in the model view | ≈ 125 ms |
| First switch to the model view (525 tables, layout) | ≈ 2.2 s |
| Later switches | 0.6–1.6 s, mostly draw.io drawing the shown layer |

The first switch skips per-table placement because the layout places everything (`DataFlowModel.sync(…, noPlacement)`). The test fails if edits take over 1.5 s or switches over 2 s.

### 20.7 Extending the feature

- **New action type:**
  - Add it to `DataFlow.ACTION_TYPES` and `DataFlow.ACTIONS`.
  - Add its config sanitizing in `DataFlowCatalog.sanitizeConfig` and its cascades in `remove*`.
  - Add its stream rule in `DataFlowStreams.getNodeStream` and its connection rules in `getConnection`.
  - Add its state checks in `getActionState`, a dialog in `DataFlowDialogs`, and an `apply*` plus a case in `DataFlowUi.configureAction`.
  - Add the `dfAction_*` and `dfConfigure_*` strings, and tests.
- **New entity field:** extend `DataFlowCatalog.load` (validation) and the `add`/`update` methods first; everything else reads the catalog.
- **Change a colour or size:** edit `DataFlow.js` only.

### 20.8 Tests

[etc/test/dataflow/](../etc/test/dataflow/) contains headless browser tests that run inside the editor. To run them:

```sh
cd etc/test/dataflow && npm install
node run.js                                  # dev mode, http://127.0.0.1:8080/?dev=1
node run.js http://127.0.0.1:8080/           # built bundles
```

- [run.js](../etc/test/dataflow/run.js) injects [harness.js](../etc/test/dataflow/harness.js) and every `*.test.js` with `page.evaluate`, because the editor's CSP blocks injected script tags.
- Each test gets a fresh blank file.
- Snap Firefox needs `DATAFLOW_TEST_PROFILE` pointing to a folder under `~/snap/firefox/common`.
- [catalog.test.js](../etc/test/dataflow/catalog.test.js) covers entities, cascades, sanitising and hostile keys.
- [storage.test.js](../etc/test/dataflow/storage.test.js) covers the page root, undo/redo, save/load (plain and compressed), pages and damaged files.
- [clipboard.test.js](../etc/test/dataflow/clipboard.test.js) covers the copied fragments, paste on the same page, cut and paste, paste into another page and another file, datasets pasted on their own, model cells pasted into the flow, hostile clipboard data and library drops.
- [perf.test.js](../etc/test/dataflow/perf.test.js) is the performance check of §20.6. Its timings are printed under *Notes*.
- [model.test.js](../etc/test/dataflow/model.test.js) covers the layers and switching (with undo), tables and colours, columns with lineage marks, relationship markers and labels, lineage per dataset, *Show lineage*, the first layout, kept positions and placement, rows kept through edits, drawing and changing relationships, deleting edges and tables, drop rules, the view switch and save/load.
- [actions.test.js](../etc/test/dataflow/actions.test.js) covers the action palette and states, every connection rule, edge roles and styles, the four actions through their apply functions and dialogs, lineage, highlighting and focus, needs-attention, the delete confirmation, copying and deleting actions, rewiring, auto-opening and save/load.
- [ui.test.js](../etc/test/dataflow/ui.test.js) covers the palette, placement, label escaping, folding and layout, edits shown on every shape, deletion, drop rules, double-click, both dialogs (including pasting attributes and validation) and the context menu.
