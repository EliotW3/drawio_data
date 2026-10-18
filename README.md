# drawio_data

A fork of [draw.io](https://github.com/jgraph/drawio) with **data flow diagrams**: systems, datasets and their attributes, actions that move data between them (Export, Filter, Validation, Addition), and a model view of how the datasets relate. The design is in [docs/DATAFLOW.md](docs/DATAFLOW.md). How the code works is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and every change from upstream is in [docs/CHANGES.md](docs/CHANGES.md).

There are two ways to use drawio_data: in your web browser from a local copy of this repository (any operating system), or as an installed Windows application. Both are the same editor with the same features, and both work offline once set up.

## Option 1: run it in your browser (localhost)

### What you need

- **The repository**, in either of these ways:
  - with Git: `git clone https://github.com/EliotW3/drawio_data.git`;
  - without Git: on the repository page choose **Code → Download ZIP**, then extract it.
- **A small local web server.** Any one of these works:
  - **Python 3.** It is preinstalled on macOS and Linux. On Windows, install it from [python.org](https://www.python.org/downloads/) or the Microsoft Store.
  - **Node.js** (from [nodejs.org](https://nodejs.org/)).

### Start it

Open a terminal (on Windows: PowerShell) in the repository folder and run one of these:

```sh
# Python on macOS or Linux
python3 -m http.server 8080 --bind 127.0.0.1 --directory src/main/webapp

# Python on Windows
py -m http.server 8080 --bind 127.0.0.1 --directory src/main/webapp

# Node.js on any system
npx http-server src/main/webapp -p 8080 -a 127.0.0.1
```

Then open **http://127.0.0.1:8080/** in your browser. Keep the terminal open while you work. To stop the server, press `Ctrl+C` in it.

### Good to know

- **Where diagrams are saved.** Choose *Device* to save `.drawio` files on your computer, or *Browser* to keep them in this browser. Google Drive, OneDrive, Dropbox, GitHub and GitLab are not available, because they need sign-in credentials that this repository doesn't include.
- **Port already in use.** If port 8080 is taken, use another number, such as `8081`, in both the command and the address.
- **Use a web server.** Opening `src/main/webapp/index.html` directly from disk doesn't work; browsers block the app from loading its files that way.
- **Updating.** Run `git pull` (or download the ZIP again) and reload the page.

## Option 2: install it as a Windows application

### Install

1. Open this repository's **Releases** page and download `drawio-data-<version>-windows-installer.exe`.
2. Run it. The installer isn't code-signed, so Windows SmartScreen may show "Windows protected your PC". Choose **More info**, then **Run anyway**.
3. Choose where to install. The default folder needs no administrator rights.
4. On the **Diagram files** page, choose whether drawio-data should open `.drawio` files when you double-click them:
   - **Leave it unchecked if you already use draw.io.** `.drawio` files keep opening in draw.io. If draw.io (or another app) already opens `.drawio` files, the box starts unchecked.
   - **Check it** to make drawio-data the app for `.drawio` files.
   - Either way, drawio-data appears under **right-click → Open with** for `.drawio` files.
5. Finish. The app starts, and the installer adds a Start menu entry and a desktop shortcut called **drawio-data**.

### Using it next to draw.io

drawio-data is installed **on its own**. It doesn't install, change or replace draw.io: the two have separate programs, settings and recent-file lists, and both can be open at the same time. The only shared thing is the `.drawio` file type, which is yours to choose in step 4.

### Update and uninstall

- **Updating.** The app doesn't update itself. To update, download the newer installer and run it; your settings are kept.
- **Uninstalling.** Go to **Settings → Apps → Installed apps → drawio-data → Uninstall**. If drawio-data opened `.drawio` files, that is removed too; another app's setting is never touched.

Building the installer yourself is described in [desktop/README.md](desktop/README.md).

## Developing

- **Run the sources.** Add `?dev=1` to the address to run the source files instead of the bundles. No build step is needed.
- **Rebuild the bundles** with `cd etc/build && ant` (needs a JDK and Apache Ant) before committing or building the desktop app.
- **Run the data flow tests** in `etc/test/dataflow` with `npm install`, then `node run.js` (needs Firefox and a running server, see Option 1).

The rest of this README is upstream draw.io's.

---

# draw.io (upstream)

## About

draw.io is a configurable diagramming and whiteboarding application, jointly owned and developed by draw.io Ltd (previously named JGraph) and draw.io AG. We also run a production deployment at https://app.diagrams.net.

## License

The source code in this repository is licensed under the [Apache License 2.0](LICENSE).

The icon sets, stencil libraries, and diagram templates are provided under the following terms:

> The icon sets and stencil libraries included in this software, and any derivatives thereof (including conversions to other formats, traced reproductions, substantially similar visual representations, or AI-generated images created using these icons as reference or training input), may not be used as software assets in, distributed for use with, or incorporated into Atlassian products or products distributed through the Atlassian marketplace or plugin ecosystem, without explicit written permission.
>
> This restriction does not apply to end-user diagram output (such as exported images or documents) created using this software.

Some icons are originally defined by third-party copyright holders; we have verified that all original licenses permit use in this project. Additional third-party JavaScript libraries are included, all with licenses compatible with Apache 2.0 (no GPL or AGPL).

We make no copyright claim on diagrams you create with this software.

## Contributions

We do not accept pull requests. The project is developed entirely by the core team.

## Scope

draw.io is a diagramming and whiteboarding application. It is not an SVG editor. SVG export is intended for embedding in web pages, not for editing in other tools.

Note that draw.io does not support real-time collaborative editing in this version, currently.

For issues or questions about the editor in any draw.io product, the issue tracker and discussions here are a good starting point.

## Running

This repository is a test version of draw.io, for evaluating draw.io and trying it out. A paid production version is available for production deployments.

Options for running the test version:

- Fork this repository and [publish to GitHub Pages](https://help.github.com/categories/github-pages-basics/) for an [editor](https://jgraph.github.io/drawio/src/main/webapp/index.html) without integrations
- Use the [Docker image](https://github.com/jgraph/docker-drawio)
- Use the packaged .war files on the [releases page](https://github.com/jgraph/draw.io/releases)

For the desktop app, download [draw.io Desktop](https://get.diagrams.net).

## Supported Browsers

Chrome 123+, Firefox 120+, Safari 17.5+, Opera 109+, Edge 123+, WebView Android 137+, Safari iOS 18.5+.

## Trademark

draw.io is a registered EU trademark (#018062448).

Do not use the draw.io name or logo in ways that suggest affiliation with, endorsement by, or sponsorship by draw.io. Do not use draw.io logos for your own business, product, project, domain, or social media presence. Do not modify the draw.io logos. Use of draw.io trademarks requires prior written permission.