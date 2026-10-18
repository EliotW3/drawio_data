# Data Flow Diagrams: Design Spec

> Status: **implemented** (2026-10-18), in five phases: CHG-003 (catalog), CHG-004 (systems and datasets), CHG-005 (actions), CHG-006 (model view) and CHG-007 (copy and paste, performance) in [CHANGES.md](CHANGES.md). The code is described in [ARCHITECTURE.md §20](ARCHITECTURE.md#20-data-flow-diagrams-fork-feature). Where the build differs from this design, the section says so in an *As built* note.

## 1. Goal

A new class of diagram elements for visualising **data flow** between systems. You place **systems**, fill them with **datasets** made of **attributes** (column names), and connect them through **actions** (Export, Validation, Filter, Addition). The diagram remembers every system, dataset and attribute it has created, so they can be reused and related. A **Flow ⇄ Model** toggle swaps the same canvas between the flow and an entity-relationship view of all datasets, their attributes and how they relate.

## 2. Terms

| Term | Meaning |
|---|---|
| **Entity** | A system, dataset, attribute, action or relationship that the diagram keeps track of. It exists independently of the shapes that draw it. |
| **Catalog** | The set of all entities on a page ([§4](#4-the-catalog)). |
| **Occurrence** | A shape on the canvas that draws an entity. A system can have several occurrences (SAP at the start of a flow and again after an Export). |
| **Stream** | What flows along a connection: a set of datasets, each with the attributes it carries ([§6](#6-streams-and-connection-rules)). |
| **Lineage** | The link from an attribute created by Export or Filter back to the attribute it was copied from. |

## 3. Decisions so far

| # | Decision |
|---|---|
| D1 | **One flow per page.** Each page has its own catalog. A file can contain several independent flow pages. |
| D2 | A dataset belongs to **exactly one system**. |
| D3 | An attribute is a **column name** of one dataset (no type or key metadata). |
| D4 | A system has **name, owner, environment, notes**. *Environment* is free text naming the software or application the system runs in (e.g. Excel, Manual, SAP). |
| D5 | Entities are created in the diagram only (no import). |
| D6 | **Systems can repeat** on the canvas. Every occurrence is the same system. Dropping a dataset into a system offers that system's existing datasets or a new one. |
| D7 | **Export** goes to one system. The user picks attributes from any of the incoming datasets, and they become **one new dataset** there. |
| D8 | **Validation** is visual only: it shows which datasets and attributes are compared. It **passes its primary input through** so the chain can continue. |
| D9 | **Filter** outputs to a system like Export: a copy of the incoming datasets with the chosen datasets or attributes dropped. |
| D10 | **Addition** brings a dataset from a second system into the flow and records which attributes are related (with cardinality). Its output carries the incoming datasets plus the added one. |
| D11 | Actions can **chain**. |
| D12 | Export and Filter outputs keep **lineage** to their source attributes. |
| D13 | The model view shows **all datasets of the page's flow**. |
| D14 | Relationships can be **drawn directly in the model view**, and every relationship has a **cardinality**. |
| D15 | The toggle **swaps the same canvas**. |
| D16 | Dataset attributes are **expandable, collapsed by default**. |
| D17 | Deleting an entity **deletes its shapes too**. |
| D18 | Everything must also work in the **viewer/lightbox and in SVG/PNG/PDF export**. |
| D19 | Deleting the **last occurrence** of a dataset or system deletes the entity ([§8](#8-deleting-things)). |
| D20 | Deleting an **Export/Filter keeps the datasets it created** ([§8](#8-deleting-things)). |
| D21 | **Validation and Addition** outputs go only to another action, never straight into a system ([§6.2](#62-connection-rules)). |
| D22 | **Filter copies** keep the source dataset's name by default. |
| D23 | The headless browser **tests are committed** under `etc/test/dataflow/`. |

## 4. The catalog

### 4.1 Where it lives

The catalog is stored as JSON in a `dataflow` attribute on the **page's root cell** (cell `0`).

- **It is saved inside the page.** The page XML, and therefore the `.drawio` file, contains it automatically.
- **Undo/redo works.** Every user operation is one model transaction that changes the root value and the shapes together, so one undo reverts both.
- **It is diffed like any cell value** for the file's merge-on-save and collaboration patches.
  - *Known limitation:* two people editing the catalog at the same moment would conflict on one attribute, and the last writer wins.
  - This deployment runs with `sync=manual` (`PreConfig.js`), so live co-editing is not a current use case.
  - If it becomes one, the catalog can be split into one hidden cell per entity. The `version` field allows that migration.
- **It coexists** with other data a user puts on the page background (*Edit Data* on the page).

### 4.2 Structure

All IDs are generated (`Editor.guid()`) and never shown to the user. Names do not need to be unique.

```jsonc
{
  "version": 1,
  "systems": {
    "s1": { "name": "Finance ERP", "owner": "Finance IT", "environment": "SAP", "notes": "" }
  },
  "datasets": {
    "d1": { "name": "Workorders", "system": "s1", "attributes": ["a1", "a2", "a3"],
            "origin": null },                       // or { "action": "x1" } when created by Export/Filter/Addition
    "d9": { "name": "WO Extract", "system": "s2", "attributes": ["a20", "a21"],
            "origin": { "action": "x1" } }
  },
  "attributes": {
    "a1":  { "name": "WO_ID",     "dataset": "d1", "derivedFrom": null },
    "a20": { "name": "WO_ID",     "dataset": "d9", "derivedFrom": "a1" }   // lineage (D12)
  },
  "relationships": {
    "r1": { "from": "a1", "to": "a40", "cardinality": "1:N",           // 1:1 | 1:N | N:1 | N:M
            "source": "addition", "action": "x3" }                     // or "source": "manual"
  },
  "actions": {
    "x1": { "type": "export",     "config": { "dataset": "d9" }, "attention": [] },
    "x2": { "type": "validation", "config": { "color": "#E6A23C",
              "pairs": [ { "primary": "d1", "reference": "d30",
                           "attributes": [["a1", "a31"], ["a2", "a32"]] } ] } },
    "x3": { "type": "addition",   "config": { "dataset": "d40" } },      // its relationships name it in "action"
    "x4": { "type": "filter",     "config": { "copies": { "d1": "d12" },
              "dropped": { "datasets": ["d2"], "attributes": ["a3"] } } }
  }
}
```

The attribute order in `datasets[].attributes` is the display order. Each action has an `attention` list (omitted above except on `x1`): `[{"code": "attributeRemoved", "id": "a3"}]` entries added when a removal takes something out of its configuration, cleared when its dialog is confirmed (`setActionConfig`). An Addition's relationships are found through their `action` field rather than listed in its configuration, so the two can never disagree.

### 4.3 Integrity rules (enforced by one module)

The catalog module ([§10](#10-code-layout)) is the only code that changes the catalog. It enforces:

- Deleting a **system** deletes its datasets.
- Deleting a **dataset** deletes its attributes.
- Deleting an **attribute**:
  - removes it from relationships, validation pairs and action configs that use it;
  - sets `derivedFrom` to `null` on attributes derived from it (the copy stays, but loses its lineage link).
- After any deletion, **shapes** for the deleted entities are removed in the same transaction (D17).
- Actions whose configuration lost something are marked **needs attention** ([§6.3](#63-when-the-upstream-changes)), never silently rewritten.
- On load, the catalog is validated (unknown IDs and dangling references are dropped, with a console warning) so that a hand-edited or partially merged file cannot break the editor.

## 5. Shapes on the canvas

### 5.1 How shapes reference entities

Every shape the feature creates is an **ordinary draw.io cell**. Its value is an XML object (like *Edit Data*) carrying:

- `dfType`: `system`, `dataset`, `attribute`, `action`, `flow` (edge), `model-table`, `model-row` or `model-rel`;
- `dfId`: the entity it draws;
- `label`: the rendered text.

Because labels, rows and edges are **materialised as real cells**, the viewer, lightbox and every export format draw them with no extra code (D18). The catalog is only needed for editing.

Whenever an entity changes (rename, attributes added/removed/reordered), the view module re-renders **every occurrence** of it in the same transaction.

### 5.2 System

- **Shape:** a container (swimlane) with a header and a vertical stack of dataset occurrences (`childLayout=stackLayout`, resizes to fit).
- **Header:** the name in bold, with the owner on a second line.
- **Environment chip:** the environment text (e.g. `SAP`, `Excel`, `Manual`) in a neutral chip next to the name ([§9](#9-visual-style)). *As built:* the chip sits beside the name rather than at the right edge, because an HTML label in a swimlane header only gets the width of its content.
- **Notes:** shown as the shape's tooltip. *As built:* no icon yet. An icon would need a custom shape (see §5.3).
- **Dropping System from the palette** opens the **System dialog** with two choices:
  - *Existing system:* a list of this page's systems. Placing one creates another occurrence of it (D6).
  - *New system:* name (required), owner, environment (free text, with the environments already used on this page offered as suggestions), and notes.
- **Double-clicking** reopens the dialog for editing. Changes show on every occurrence.
- **Adding datasets:** drop the Dataset palette item onto the system, click it while the system is selected, or use *Add Dataset…* in the system's context menu. *As built:* there's no hover "+" button. The context menu covers it.

### 5.3 Dataset

- **Shape:** a collapsible swimlane inside a system occurrence. It is **collapsed by default** (D16) and shows `Workorders (12)`. Expanding it (the +/− icon) shows one row per attribute. *As built:* the dataset accent is a table glyph in the accent colour. The 4 px accent bar from the mock-up isn't used: it would need a custom shape, which the viewer bundles don't contain, and every shape must render in the viewer and exports (D18).
- **Dropping a dataset into a system** opens the **Dataset dialog**:
  - *Existing:* this system's datasets that are not already in this occurrence (D6).
  - *New:* name plus the **attribute editor**: a list where you add, rename, remove and reorder rows. Pasting a block of lines (or a comma/tab-separated header row) adds them all at once.
- **Dataset as a drop target:** a dataset can only be dropped into a system. Dropping it on the empty canvas is refused, with a hint.
- **Double-clicking** opens the same editor.
- **Removing an attribute that is in use** (a relationship, validation, lineage source or action) shows what will be affected before you confirm.

### 5.4 Actions

| Action | Shape | Inputs | Output |
|---|---|---|---|
| **Export** | Rounded rectangle with an outgoing arrow | 1 stream | Exactly one system |
| **Filter** | Funnel | 1 stream | Exactly one system |
| **Validation** | Hexagon with a check mark | 1 stream (primary) + 1 system (reference) | Optional: passes the primary stream to the next action |
| **Addition** | Circle with a plus | 1 stream (primary) + 1 system (second) | Optional: stream + added dataset, to the next action |

- **Ports:** the primary input is on the left, the secondary input (reference/second) is at the bottom, and the output is on the right.
- *As built:* the name sits **inside** the shape with a glyph (`▾ Filter`, `✓ Validation`, `+ Addition`, `Export ➜`), not below it as in the mock-up. One cell has one label, and a glyph-only shape plus an outside label would need a second cell or a custom shape (see §5.3). The funnel is an inverted trapezoid, a built-in shape.
- *As built:* a Validation's colour badge (V1, V2, …) is in its label and on every compared dataset's shape.
- **Placement:** a newly placed action shows a dashed outline and a "needs setup" badge until its inputs/outputs are connected and its dialog is completed. Its dialog opens automatically once the required connections exist, or on double-click.
- **Dialogs:**
  - **Export:** a tree of the incoming stream (dataset → attribute check boxes), the new dataset's name, and the target system (taken from the output connection).
    - *Confirm* creates the dataset in the target system with lineage, and adds an occurrence of it to the target system shape.
  - **Filter:** the same tree, where unchecking drops a dataset or attribute.
    - *Confirm* creates one copy per kept dataset in the target system (same name by default, editable) with lineage, and places them.
  - **Validation:** the primary stream's datasets on the left and the reference system's datasets on the right. You pair datasets (auto-suggested by equal names) and, optionally, attributes within each pair.
    - Each Validation gets its own highlight colour ([§9](#9-visual-style)).
  - **Addition:** pick one dataset from the second system, then a mapping grid of incoming attributes × added attributes (auto-suggested by equal names). Each mapping gets a cardinality.
    - *Confirm* creates the relationships (`source: "addition"`).

### 5.5 Connections

- **Flow edges** are orthogonal with an arrow.
- **Secondary-input edges** (Validation reference, Addition second) are dashed.
- **Connecting** goes through the rules in [§6.2](#62-connection-rules). Invalid connections are refused while dragging, with a tooltip explaining why. *As built:* the target is marked invalid while dragging, and releasing shows the reason in a message. A connection made another way (for example pasted) that breaks the rules is drawn red and dashed, with the reason as its tooltip.

## 6. Streams and connection rules

### 6.1 What flows where

The stream of a connection is computed from the graph whenever it changes. Cycles are refused when connecting.

- **System occurrence → action:** every dataset placed in *that occurrence*, with all their attributes.
- **Export → system:** the stream contains just the new dataset. The chain then continues *from that system occurrence*.
- **Filter → system:** the copies.
- **Validation → action:** the primary input, unchanged.
- **Addition → action:** the primary input plus the added dataset.

### 6.2 Connection rules

| From \ To | System | Export / Filter (in) | Validation / Addition (primary in) | Validation / Addition (secondary in) |
|---|---|---|---|---|
| **System** | ✗ | ✓ | ✓ | ✓ (one) |
| **Export / Filter** | ✓ (exactly one) | ✗ | ✗ | ✗ |
| **Validation / Addition** | ✗ | ✓ | ✓ | ✗ |

Each input port accepts one connection. Datasets and attributes are not connection endpoints in the flow view. Relationships between attributes are made in the Addition dialog or the model view.

### 6.3 When the upstream changes

Suppose an Export's source dataset loses an attribute, or the connection feeding a Validation is rewired.

- The action keeps its configuration and shows a **needs attention** badge, listing what no longer matches.
- Opening the dialog shows the current stream with the stale items highlighted.
- Outputs that already exist (Export/Filter datasets) are **never deleted automatically**. Only lineage pointers to deleted attributes are cleared ([§4.3](#43-integrity-rules-enforced-by-one-module)), and the Export or Filter that made the copy is flagged.
- *As built:* unchecking a dataset in a Filter's own dialog deletes that dataset's copy. That is an explicit choice, not an upstream change. Re-applying an Export or Filter keeps the IDs of attributes whose source is still selected, so their lineage and relationships survive.

## 7. Model view

### 7.1 Toggling

- **Control:** a **Flow | Model** segmented control appears in the toolbar when the page contains data-flow shapes. It is also under *View → Data Flow View* and has a shortcut. *As built:* the switch floats centred over the canvas, because draw.io's toolbar differs per UI theme. The background context menu offers *Show Model View* / *Show Flow View*. There's no View-menu entry or shortcut yet.
- **Layers:** the page gets two layers, **Flow** and **Model**. The toggle shows one and hides the other, and the hidden layer is locked. This is the "same canvas" swap (D15).
- **Viewer and export:** both use the same layers, so the viewer's layers button can switch views, and export draws whichever view is showing.
- **Remembered view:** the last view is stored on the page (`dfView` on the root) and restored on open.

### 7.2 What is drawn

- **Tables:** one table per dataset in the catalog (D13). The header shows the dataset name with the system in small type, and is coloured per system (decision F: a palette of six, by the order systems were added). Each attribute is a row; rows that are the target of lineage show a small "derived" glyph (↳), with the source in the tooltip.
- **Relationship edges** run row-to-row with ER (crow's-foot) markers for cardinality:
  - 1:1 → `ERmandOne`/`ERmandOne`
  - 1:N → `ERmandOne`/`ERmany`
  - N:M → `ERmany`/`ERmany`
  - Edges created by an Addition are labelled with the action. Manual ones are not.
- **Lineage edges** are dashed and grey, with a *Show lineage* check box on the control (default on). Decision E: **one edge per pair of datasets**, labelled with the number of attributes copied ("3 attributes"), not one edge per attribute.
- **Positions:**
  - The first time the model view is shown, the tables are auto-laid out. *As built:* a deterministic column layout instead of draw.io's hierarchical layout: originals in the first column, their copies in the next, and so on, grouped by system.
  - After that, positions are kept: switching views only adds tables for new datasets (placed by layout near related tables), removes tables for deleted ones, and refreshes rows and edges. *As built:* this happens on every change, not only when switching, so the model is always current.
  - *Re-arrange* in the control's menu runs the layout again.

### 7.3 Editing in the model view

| Gesture | Effect |
|---|---|
| Drag a table | Moves it (layout only) |
| Connect row → row | Cardinality picker, then a new relationship (`source: "manual"`) (D14) |
| Double-click a relationship | Change cardinality |
| Delete a relationship | Removes it (also from the Addition that created it, which is then marked *needs attention*) |
| Double-click a table | Dataset editor (same as the flow view) |
| Delete a table | Confirm dialog: "Delete dataset *X* everywhere?" (D17) |

Lineage edges are read-only.

*As built:* drawing from a row to a row doesn't insert an edge. The picker opens, and the relationship is drawn from the catalog. Rows and relationship edges can't be dragged loose. Systems, datasets and actions are added in the flow view only; the palette asks to switch back.

## 8. Deleting things

| You delete | Result |
|---|---|
| A dataset **shape** | Removes that occurrence. If it was the **last** occurrence, the dataset is deleted (cascade, [§4.3](#43-integrity-rules-enforced-by-one-module)). |
| A system **shape** | Removes that occurrence and the dataset shapes inside it. If it was the last occurrence, the system and its datasets are deleted. |
| An **action** | The action is deleted. Datasets it created **stay**, with their `origin` cleared and their lineage kept. *Relationships* an Addition created are deleted with it. |
| *Delete everywhere* (context menu or dialog) | Deletes the entity and all its shapes immediately. |

Every deletion that cascades beyond the selected shapes asks for confirmation and lists what else goes. All of it is one undo step. *As built:* *Delete Everywhere…*, removing attributes that are in use, and the plain Delete key all ask when the cascade removes relationships or changes actions beyond the selection.

## 9. Visual style

These are proposals, kept as named style constants in one file so they can be tuned in one place. They use plain hex colours, which draw.io inverts automatically in dark mode.

| Element | Style |
|---|---|
| **System** | Swimlane with a dark slate header `#334155` and white bold text, a `#F8FAFC` body, a `#CBD5E1` 1 px border, rounded corners (6) and a light shadow |
| Environment chip | Neutral: `#E2E8F0` background, `#334155` text, rounded, 10 px |
| **Dataset** | White card, `#CBD5E1` border, a table glyph in the accent `#0EA5E9`, bold name with `(n)` count, collapsed by default (built without the 4 px accent bar, see §5.3) |
| Attribute row | 11 px, `#475569` text, alternating `#F1F5F9` background |
| **Export** | `#2563EB` fill, white text, arrow glyph |
| **Filter** | `#D97706` funnel |
| **Validation** | `#059669` hexagon with check mark. Compared datasets get a 2 px outline plus a badge in the validation's colour (colours cycle through a 6-colour palette), on both sides. Selecting the Validation dims everything else. |
| **Addition** | `#7C3AED` circle with plus |
| Needs setup / needs attention | Dashed outline / amber `!` badge |
| Flow edge | 2 px `#475569`, orthogonal, block arrow |
| Secondary-input edge | Same, dashed |
| **Model table** | draw.io ER table look: header in the system's stripe colour, rows as above |
| Relationship edge | 1.5 px `#334155`, ER markers |
| Lineage edge | 1 px dashed `#94A3B8`, open arrow |

I can render a mock-up page of these before Phase 2 starts if you want to tweak them visually first.

## 10. Code layout

New folder `src/main/webapp/js/diagramly/dataflow/`, loaded after the diagramly core:

| File | Responsibility |
|---|---|
| `DataFlow.js` | Namespace, constants, style strings, `dfType` helpers |
| `DataFlowCatalog.js` | Read/write the catalog on the page root, CRUD, ID generation, integrity cascades, load-time validation. No DOM. |
| `DataFlowStreams.js` | Computes streams per connection, connection rules, cycle check, *needs attention* detection |
| `DataFlowView.js` | Turns the catalog into cells: occurrences, attribute rows, the model layer, layout, highlight |
| `DataFlowDialogs.js` | System, Dataset (with attribute editor), Export, Filter, Validation, Addition, cardinality and delete-confirm dialogs, following [docs/dialog-style-guide.md](dialog-style-guide.md) |
| `DataFlowUi.js` | Editor integration: the sidebar palette, drop handling, double-click, delete interception, connection validation, the toggle control, the View menu item, the Format panel *Data Flow* tab, and keyboard shortcut |

Wiring:

- [Devel.js](../src/main/webapp/js/diagramly/Devel.js) (dev mode) and the app source lists in [etc/build/build.xml](../etc/build/build.xml), next to `Pages.js`;
- strings in `resources/dia.txt`;
- a palette entry in the sidebar configuration ([diagramly/sidebar/Sidebar.js](../src/main/webapp/js/diagramly/sidebar/Sidebar.js)).

The viewer bundle needs nothing, because the shapes are ordinary cells (§5.1).

## 11. Phases

Each phase is a separately reviewable change, with its own CHG entry, rebuilt bundles and headless browser tests.

| Phase | Scope | Done when |
|---|---|---|
| **1. Catalog** | `DataFlowCatalog`, persistence on the page root, integrity rules, undo | Create/rename/delete entities through the API; save, reload, undo and redo round-trip; page copy/duplicate keeps the catalog; a malformed catalog loads safely |
| **2. Systems & datasets** | Palette, System and Dataset dialogs, attribute editor, occurrences, expand/collapse, rename propagation, deletion, styles | You can build systems with datasets by hand; repeated systems share datasets; the viewer and PNG/SVG/PDF export render correctly |
| **3. Actions** | The four actions, connection rules, streams, the four dialogs, lineage, validation highlighting, needs-setup/needs-attention | A chain such as SAP → Filter → Staging → Validation(ref: CRM) → Addition(+CRM.Customers) → Export → Warehouse can be built, and changing upstream data flags the right actions |
| **4. Model view** | Layers, toggle, table generation, layout, relationship and lineage edges, model-view editing | Toggle swaps views without losing positions; drawn relationships persist; the cardinality markers are correct |
| **5. Hardening** | Copy/paste of flow shapes within and across pages and files (the catalog fragment travels with the cells and is merged with new IDs), a performance check (≈50 systems / 500 datasets), docs | ARCHITECTURE section written; all tests pass |

*As built (phase 5):*
- **Copy and paste:** copied cells carry their catalog fragment in `dfData`, which every paste path keeps (clipboard, libraries, other windows). Pasting imports what the page lacks, with the same IDs, and validates it like a loaded file.
- **Performance:** at 50 systems / 500 datasets an edit takes about 80 ms, and the first model view about 2.2 s (ARCHITECTURE.md §20.6).
- **Tests:** 90 in total.

Tests are headless Firefox scripts (as used for CHG-001/002). I propose committing them under `etc/test/dataflow/` with their own `package.json` (puppeteer-core) so they can be re-run.
