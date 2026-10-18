# drawio-data desktop app (Windows)

drawio_data as an installable Windows application: the draw.io editor of this
repository, including the data flow diagrams, in its own window with native
open and save dialogs. It works offline and stores diagrams as `.drawio` files
on your computer.

## Install

1. Download `drawio-data-<version>-windows-installer.exe` from the repository's
   **Releases** page. For an unreleased build, use the latest run of the
   *Desktop app (Windows)* workflow under **Actions**, which offers the
   installer as an artifact.
2. Run it. The installer isn't code-signed, so Windows SmartScreen may say
   "Windows protected your PC". Choose **More info**, then **Run anyway**.
3. Choose a folder (the default needs no administrator rights).
4. On the **Diagram files** page, choose whether drawio-data opens `.drawio`
   files. The box starts unchecked when another application, such as draw.io,
   already opens them, so an existing draw.io keeps working as before.
   drawio-data is added to **Open with** either way.
5. The installer adds Start menu and desktop shortcuts.

drawio-data installs **on its own, next to draw.io**: it doesn't install,
change or replace draw.io, and the two keep separate settings.

The app does not update itself. Install a newer release over the old one to
update; your settings are kept.

## Build the installer

You need Node.js 22.12 or later. On Windows that's all. On Linux you also need
Wine, which electron-builder uses for the Windows parts.

```sh
cd desktop
npm ci
npm test            # tests of the main process
npm run dist-win    # writes dist/drawio-data-<version>-windows-installer.exe
```

`npm run dist-win` first runs `scripts/prepare.cjs`, which copies the web app
from `../src/main/webapp` into `drawio/` (ignored by git), takes the version
from `../VERSION`, and switches automatic updates off. Rebuild the web app
bundles first if you changed its sources (`cd etc/build && ant`); the desktop
app uses `js/app.min.js`, not the source files.

To try the app without installing it, run `npm start`.

## How it relates to upstream

The main process (`src/main/`), its tests (`src/test/`), the icons and the
fuses hook (`build/`) are taken from draw.io desktop v32.5.5
([jgraph/drawio-desktop](https://github.com/jgraph/drawio-desktop)), the
version that matches this repository's web app. Changes:

- **App identity.** Named `drawio-data`, with its own app ID. It installs next
  to an official draw.io desktop instead of over it, and keeps its own
  settings.
- **Web app location.** The web app comes from this repository (copied by
  `scripts/prepare.cjs`) instead of a git submodule. Upstream's `sync.cjs` is
  replaced.
- **No automatic updates.** Updates are always off, because they would install
  official draw.io releases over this fork.
- **No export server.** The `export` URL parameter (the external export
  service, removed in CHG-001) is no longer passed to the web app.
- **Desktop detection.** The user agent gets a `draw.io/<version>` token. The
  web app recognises the desktop app by it, and Electron would otherwise only
  add `drawio-data/<version>`.
- **Help link.** *Help → Report issue* opens this repository's issues.
- **Build.** Windows only: an NSIS installer per user, unsigned. Instead of
  electron-builder's file association, [build/installer.nsh](build/installer.nsh)
  adds a *Diagram files* page. On it, opening `.drawio` files is optional and
  unchecked when another application already opens them. drawio-data is always
  registered under *Open with*, and uninstalling restores only what it
  changed. No MSI, macOS, Linux or Store builds, no code signing, no release
  upload from the build (the GitHub workflow publishes releases). The
  update-channel test was removed with the updates.

## Licence

The files in this folder are licensed under the **GNU General Public License
v3.0** ([LICENSE](LICENSE)), like draw.io desktop they come from. The web app
in the rest of the repository stays under the Apache License 2.0. The desktop
app you build or distribute is a GPL-3.0 work: if you give it to others, they
must be able to get its source code, for example from this repository.
