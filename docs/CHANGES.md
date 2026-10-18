# drawio_data — Fork Change Log

This file records every change made to this fork of draw.io and its effect on the application and codebase. It is the companion to [ARCHITECTURE.md](ARCHITECTURE.md): the architecture guide describes how the code works *now*, and this log explains *what was changed from upstream and why*.

The upstream release log is [ChangeLog](../ChangeLog) in the repository root. Do not add fork changes there.

## How to record a change

- Add a new entry at the **top** of [Change entries](#change-entries) with the next ID (`CHG-002`, `CHG-003`, …), and add a row to the [Change index](#change-index).
- Fill in every heading of the template below. Write "None" rather than deleting a heading.
- Reference [ARCHITECTURE.md](ARCHITECTURE.md) sections by number (e.g. "§12.2") and update those sections in the same change, so that the architecture guide always describes the current code.
- List anything left unfinished under **Follow-ups**, and keep [Open follow-ups](#open-follow-ups) in sync until the item is resolved.

```markdown
### CHG-NNN — <short title>

- **Date:** YYYY-MM-DD
- **Status:** Done | Done, follow-ups pending | Reverted
- **ARCHITECTURE.md sections affected:** §x.y, …

**Motivation** — why the change was made.

**What changed for users** — visible behaviour before → after.

**What changed in the code** — files, functions, removed/added APIs.

**Impact on the codebase** — dependencies, load order, bundles, server, configuration, compatibility (desktop, embed, viewer).

**Verification** — how it was tested and the result.

**Follow-ups** — remaining work, or "None".
```

## Change index

| ID | Date | Title | Status |
|---|---|---|---|
| [CHG-001](#chg-001--remove-exports-that-depend-on-unavailable-code) | 2026-10-18 | Remove exports that depend on unavailable code (VSDX, server-side export) | Done, follow-ups pending |

## Open follow-ups

| From | Item |
|---|---|
| CHG-001 | Rebuild the committed bundles (`cd etc/build && ant`, needs a JDK and Apache Ant), commit the new `js/*.min.js`, then delete the temporary `window.EXPORT_URL = null` guard in `js/PreConfig.js`. Until then, **normal mode (`index.html` without `?dev=1`) still runs the old code** (see CHG-001 › Impact). |

---

## Change entries

### CHG-001 — Remove exports that depend on unavailable code

- **Date:** 2026-10-18
- **Status:** Done, follow-ups pending
- **ARCHITECTURE.md sections affected:** §1, §3.2, §4.4, §7.4, §12.2, §13.6, §15, §16, §18

**Motivation**

Two export paths could never work in this fork:

1. **VSDX (Visio) export** calls `VsdxExport.js` and `mxVsdxCanvas2D.js`, which are not in the public repository. The menu item was already hidden at runtime (`vsdxExportEnabled()` was only true in Atlassian mode), but the action, the export function and the loader references remained.
2. **Server-side export** posted diagrams to `EXPORT_URL`, a separate Puppeteer export service that is not in this repository. In this deployment `PreConfig.js` set `EXPORT_URL = null`, so every server path was unreachable dead code. Server-side export covered PNG/JPEG when the canvas cannot be used (e.g. math is enabled), server-rendered PDF, the remote image export dialog, the image fallbacks for embedding and the embed protocol, and the `/export` reverse proxy in the Java backend.

The decision was to remove both entirely, rather than keep plumbing for a service we do not run.

**What changed for users**

| Feature | Before | After |
|---|---|---|
| File → Export as → VSDX | Hidden (code present) | Removed |
| File → Export as → PDF | Browser print dialog (server never configured) | Browser print dialog (unchanged). The desktop app still renders PDF files through its local pipeline |
| File → Export as → PNG/JPEG/WebP/Animation/SVG/HTML/XML/URL/JSON | Client-side | Unchanged |
| PNG/JPEG when the canvas cannot be used (math enabled) | Menu items hidden (no server) | Unchanged: still hidden |
| File → Export as → Advanced… (generic export dialog) | PNG/JPEG/SVG client-side; other formats tried the server | PNG/JPEG/SVG client-side; anything else shows "Not available" |
| Embed protocol `export` with `png`/`xmlpng` when the canvas cannot be used | Replied without data (no server) | Unchanged: replies without data |
| Server endpoints `/export`, `/service/*` | Proxied to the `EXPORT_URL` env var (unset) | Removed (404) |

In practice there is **no visible change for users of this deployment**, because none of the removed paths were reachable. The change removes about 790 lines of dead or broken code.

**What changed in the code**

| File | Change |
|---|---|
| [js/diagramly/Menus.js](../src/main/webapp/js/diagramly/Menus.js) | Removed the `exportVsdx` action and its menu entry. Removed the remote-export branch of `exportImage` (which used `showRemoteExportDialog`). `exportPdf` now always uses the print dialog in the browser and only passes an export callback in Electron. The `exportAs` menu now lists PDF unconditionally and no longer checks `isRemoteExportEnabled`/`isPrintPdfExport`/`vsdxExportEnabled`. |
| [js/diagramly/EditorUi.js](../src/main/webapp/js/diagramly/EditorUi.js) | Removed `printPdfExport`, `isRemoteExportEnabled()`, `isPrintPdfExport()`, the browser `createDownloadRequest()` (which posted to `EXPORT_URL`), `showRemoteExportDialog()`, `exportVisio()` and `vsdxExportEnabled()`. `downloadFile()` lost its embed-protocol server branch and now shows "Not available" for rendered formats unless `createDownloadRequest` exists (it is defined only by `ElectronApp.js`). The server fallbacks in `createEmbedImage()`, the embed `export` action and the `ExportDialog.exportFile` override were replaced by a "not available" error or an empty reply. `saveLocalFile` no longer special-cases `vsdx`. `downloadRequestBuilder()` is kept because the desktop override uses it. |
| [js/grapheditor/Dialogs.js](../src/main/webapp/js/grapheditor/Dialogs.js) | The base `ExportDialog.exportFile` no longer posts raster formats to `EXPORT_URL` (the application layer overrides it with client-side export). |
| [js/grapheditor/Init.js](../src/main/webapp/js/grapheditor/Init.js), [js/diagramly/Init.js](../src/main/webapp/js/diagramly/Init.js) | Removed the `EXPORT_URL` global defaults (`/export` and `https://convert.diagrams.net/node/export`) and the related comment. |
| [js/PreConfig.js](../src/main/webapp/js/PreConfig.js) | The `EXPORT_URL` deployment setting was removed, then re-added as a **temporary guard** (see Impact). |
| [js/diagramly/App.js](../src/main/webapp/js/diagramly/App.js) | Removed the `EXPORT_URL` debug log line. |
| [js/diagramly/Devel.js](../src/main/webapp/js/diagramly/Devel.js) | Removed the dev-mode loading of `vsdx/VsdxExport.js` and `vsdx/mxVsdxCanvas2D.js`. |
| [js/diagramly/ElectronApp.js](../src/main/webapp/js/diagramly/ElectronApp.js) | Removed the `vsdx` save-dialog filter. The VSDX *open* filter is kept (import still works). |
| [WEB-INF/web.xml](../src/main/webapp/WEB-INF/web.xml) | Removed the `ExportProxyServlet` declaration and the `/export` and `/service/*` mappings. |
| `src/main/server/java/com/mxgraph/online/ExportProxyServlet.java` | **Deleted.** |
| [resources/dia*.txt](../src/main/webapp/resources/) (59 files) | Removed the now-unused `formatVsdx` string from English and every translation. |
| [etc/build/build.xml](../etc/build/build.xml) | Updated the `extensions` target comment that referred to the internal VSDX export build. |

Not changed, deliberately:

- **VSDX/VSD import** (`js/diagramly/vsdx/importer.js`, `js/vsd/`, `unsupportedVsdx` string) is complete in this repo and keeps working.
- **`export3.html`, `js/export.js`, `js/export-init.js`, `export-fonts.css`** are the headless rendering page. Nothing in the web app uses it any more, but drawio-desktop's local export pipeline (the `createDownloadRequest` override in `ElectronApp.js`) and command-line export render through it, so it is kept for desktop compatibility.
- **Online-service exports that do not need missing code** (Export as URL, Publish link, Embed → HTML/IFrame/Notion, which use `viewer.diagrams.net`) are kept.

**Impact on the codebase**

- **Prebuilt bundles are stale.** The committed `js/app.min.js`, `js/viewer.min.js`, `js/viewer-static.min.js` and `js/integrate.min.js` still contain the old code. Dev mode (`?dev=1`) runs the new sources. Normal mode runs the old bundles until they are rebuilt. A JDK and Ant are not installed on the development machine, so they could not be rebuilt as part of this change.
- **Temporary guard.** The stale bundles default `EXPORT_URL` to `https://convert.diagrams.net/node/export` when it is undefined, which would have re-enabled server export to an external service in normal mode. `js/PreConfig.js` therefore still sets `window.EXPORT_URL = null`, marked TEMPORARY, until the bundles are rebuilt.
- **API removals.** Plugins or integrations that called `ui.isRemoteExportEnabled()`, `ui.isPrintPdfExport()`, `ui.showRemoteExportDialog()`, `ui.exportVisio()` or `ui.vsdxExportEnabled()`, or that relied on the `EXPORT_URL` global, will now fail. None of the plugins in `plugins/` use them.
- **Desktop (Electron).** Unaffected: PDF export and `getEmbeddedPdf` still use the Electron `createDownloadRequest` override plus `downloadRequestBuilder`.
- **Server.** The WAR no longer serves `/export` or `/service/*`, and the `EXPORT_URL` environment variable is no longer read. All other servlets are unchanged.
- **Security.** This removes a path that could transmit diagram content to an external server.

**Verification**

- `node --check` passes for every modified JavaScript file.
- No source file outside the minified bundles references `EXPORT_URL`, `isRemoteExportEnabled`, `isPrintPdfExport`, `printPdfExport`, `showRemoteExportDialog`, `exportVisio`, `exportVsdx`, `vsdxExportEnabled`, `VsdxExport`, `mxVsdxCanvas2D` or `formatVsdx`. The only intentional exception is the temporary guard in `PreConfig.js`.
- Headless Firefox (puppeteer-core) on `index.html?dev=1` showed no page or console errors. The Export menu is `PNG, JPEG, WebP, Animation, SVG | PDF | HTML, XML, URL, JSON | Advanced`. The `exportVsdx` action, `exportVisio`, `isRemoteExportEnabled`, `showRemoteExportDialog`, the browser `createDownloadRequest` and the `EXPORT_URL` global are all absent. *Export as → PDF* opens the print-based PDF dialog. A PNG export through the Advanced dialog renders client-side (canvas 82×42 for a test shape).
- Headless Firefox on `index.html` (normal mode, stale bundles) showed no errors, with `EXPORT_URL === null` and `isRemoteExportEnabled() === false`, confirming the guard works.
- `etc/i18n/check-translations.py` reports no new problems. Its existing failure (405 untranslated keys upstream) predates this change.
- The Java changes were not compiled, because there is no JDK on the machine. The only Java change is deleting a self-contained servlet with no other references.

**Follow-ups**

1. Install a JDK and Ant, run `cd etc/build && ant`, and commit the regenerated `js/*.min.js`.
2. After the rebuild, delete the TEMPORARY `window.EXPORT_URL = null` block in `js/PreConfig.js` and update this entry's status to Done.
3. Optionally run `ant war` to confirm that the servlets still compile without `ExportProxyServlet`.
