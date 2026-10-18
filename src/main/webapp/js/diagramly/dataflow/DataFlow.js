/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * Data flow diagrams: systems with datasets made of attributes, connected
 * through actions (export, validation, filter, addition), with a flow and a
 * model view of the same page. See docs/DATAFLOW.md for the design.
 *
 * This file defines the namespace and the constants shared by the other
 * files in js/diagramly/dataflow.
 */
var DataFlow = {};

/**
 * Name of the attribute on the page root cell that holds the catalog JSON.
 */
DataFlow.CATALOG_ATTRIBUTE = 'dataflow';

/**
 * Version of the catalog format written by this code.
 */
DataFlow.CATALOG_VERSION = 1;

/**
 * Action types.
 */
DataFlow.ACTION_EXPORT = 'export';
DataFlow.ACTION_VALIDATION = 'validation';
DataFlow.ACTION_FILTER = 'filter';
DataFlow.ACTION_ADDITION = 'addition';

DataFlow.ACTION_TYPES = [DataFlow.ACTION_EXPORT, DataFlow.ACTION_VALIDATION,
	DataFlow.ACTION_FILTER, DataFlow.ACTION_ADDITION];

/**
 * Relationship cardinalities and sources.
 */
DataFlow.CARDINALITIES = ['1:1', '1:M', 'M:1', 'M:M'];

/**
 * Cardinalities written before M replaced N for "many" (CHG-008), read as
 * their current form.
 */
DataFlow.LEGACY_CARDINALITIES = {'1:N': '1:M', 'N:1': 'M:1', 'N:M': 'M:M'};

/**
 * Returns the current form of the given cardinality (legacy N becomes M),
 * or the value unchanged if it is not a legacy form.
 */
DataFlow.normalizeCardinality = function(cardinality)
{
	return (typeof cardinality === 'string' &&
		Object.prototype.hasOwnProperty.call(DataFlow.LEGACY_CARDINALITIES, cardinality)) ?
		DataFlow.LEGACY_CARDINALITIES[cardinality] : cardinality;
};

DataFlow.RELATIONSHIP_MANUAL = 'manual';
DataFlow.RELATIONSHIP_ADDITION = 'addition';

/**
 * Entity IDs are generated with Editor.guid. Anything else in a loaded
 * catalog is dropped, which also keeps keys such as __proto__ out of the
 * maps (they are null-prototype objects in addition).
 */
DataFlow.ID_PATTERN = /^[0-9a-zA-Z_-]{1,64}$/;

/**
 * Maximum length of names, owner and environment texts and notes.
 */
DataFlow.MAX_NAME_LENGTH = 1000;
DataFlow.MAX_NOTES_LENGTH = 100000;

/**
 * Colours cycled through for validation highlights (docs/DATAFLOW.md §9).
 */
DataFlow.VALIDATION_COLORS = ['#E6A23C', '#0EA5E9', '#DB2777',
	'#65A30D', '#9333EA', '#0D9488'];

/**
 * Colours and sizes of the shapes (docs/DATAFLOW.md §9). Plain hex colours,
 * which draw.io adapts in dark mode like any diagram colour.
 */
DataFlow.COLORS = {
	systemHeader: '#334155', systemBody: '#F8FAFC', systemBorder: '#CBD5E1',
	systemName: '#FFFFFF', systemOwner: '#CBD5E1',
	chipFill: '#E2E8F0', chipText: '#334155',
	datasetFill: '#FFFFFF', datasetBorder: '#CBD5E1', datasetAccent: '#0EA5E9',
	datasetName: '#1E293B', datasetCount: '#64748B',
	attributeText: '#475569', attributeAlt: '#F1F5F9'
};

DataFlow.SYSTEM_WIDTH = 220;
DataFlow.SYSTEM_HEADER = 46;
DataFlow.DATASET_HEADER = 30;
DataFlow.ATTRIBUTE_HEIGHT = 20;

/**
 * Cell styles. The dataflow key marks the cells of this feature, the other
 * keys are plain draw.io styles so the viewer and every export draw them.
 * Systems and datasets are swimlanes with a stack layout, like the
 * entity-relation tables, so that datasets and attribute rows stack and
 * the containers grow and shrink with their content. Datasets stay
 * resizable because draw.io only folds resizable containers; the stack
 * layout sets their size anyway.
 */
DataFlow.SYSTEM_STYLE = 'swimlane;dataflow=system;html=1;whiteSpace=wrap;' +
	'startSize=' + DataFlow.SYSTEM_HEADER + ';childLayout=stackLayout;horizontalStack=0;' +
	'resizeParent=1;resizeParentMax=0;resizeLast=0;marginLeft=10;marginRight=10;' +
	'marginTop=10;marginBottom=10;stackSpacing=8;collapsible=0;rounded=1;arcSize=6;' +
	'absoluteArcSize=1;swimlaneLine=0;shadow=1;fillColor=' + DataFlow.COLORS.systemHeader +
	';swimlaneFillColor=' + DataFlow.COLORS.systemBody + ';strokeColor=' +
	DataFlow.COLORS.systemBorder + ';fontColor=' + DataFlow.COLORS.systemName +
	';fontSize=13;align=left;verticalAlign=middle;spacingLeft=12;spacingRight=10;' +
	'editable=0;rotatable=0;';

DataFlow.DATASET_STYLE = 'swimlane;dataflow=dataset;html=1;whiteSpace=wrap;' +
	'startSize=' + DataFlow.DATASET_HEADER + ';childLayout=stackLayout;horizontalStack=0;' +
	'resizeParent=1;resizeParentMax=0;resizeLast=0;marginBottom=4;collapsible=1;' +
	'rounded=1;arcSize=3;absoluteArcSize=1;fillColor=' + DataFlow.COLORS.datasetFill +
	';swimlaneFillColor=' + DataFlow.COLORS.datasetFill + ';strokeColor=' +
	DataFlow.COLORS.datasetBorder + ';fontColor=' + DataFlow.COLORS.datasetName +
	';fontSize=12;align=left;verticalAlign=middle;spacingLeft=24;editable=0;rotatable=0;';

DataFlow.ATTRIBUTE_STYLE = 'text;dataflow=attribute;html=1;whiteSpace=wrap;' +
	'align=left;verticalAlign=middle;spacingLeft=28;fontSize=11;fontColor=' +
	DataFlow.COLORS.attributeText + ';strokeColor=none;movable=0;resizable=0;' +
	'deletable=0;editable=0;rotatable=0;cloneable=0;connectable=0;';

/**
 * Actions (docs/DATAFLOW.md §5.4): colour, shape, glyph and size per type.
 * Labels sit inside the shapes, which keeps every action a single built-in
 * shape (no custom shapes, see §5.3). Ports: input left, second input
 * bottom (Validation, Addition), output right.
 */
DataFlow.ACTIONS = {
	'export': {color: '#2563EB', width: 100, height: 40, glyph: ' &#10140;', glyphAfter: true,
		shape: 'rounded=1;arcSize=24;', points: '[[0,0.5],[1,0.5]]'},
	'filter': {color: '#D97706', width: 100, height: 40, glyph: '&#9662; ',
		shape: 'shape=trapezoid;perimeter=trapezoidPerimeter;size=0.15;fixedSize=0;flipV=1;',
		points: '[[0,0.5],[1,0.5]]'},
	'validation': {color: '#059669', width: 120, height: 40, glyph: '&#10003; ',
		shape: 'shape=hexagon;perimeter=hexagonPerimeter2;size=0.16;fixedSize=0;',
		points: '[[0,0.5],[0.5,1],[1,0.5]]'},
	'addition': {color: '#7C3AED', width: 110, height: 40, glyph: '+ ',
		shape: 'ellipse;perimeter=ellipsePerimeter;', points: '[[0,0.5],[0.5,1],[1,0.5]]'}
};

DataFlow.COLORS.attention = '#F59E0B';
DataFlow.COLORS.edge = '#475569';
DataFlow.COLORS.invalid = '#DC2626';

/**
 * Base style of action shapes, completed per type and state by
 * DataFlowView.getActionStyle.
 */
DataFlow.ACTION_STYLE = 'dataflow=action;html=1;whiteSpace=wrap;fontSize=12;' +
	'editable=0;rotatable=0;resizable=0;';

/**
 * Flow edges and the styles of their roles (§5.5).
 */
DataFlow.FLOW_STYLE = 'dataflow=flow;html=1;edgeStyle=orthogonalEdgeStyle;rounded=1;' +
	'endArrow=block;endFill=1;strokeWidth=2;editable=0;strokeColor=' + DataFlow.COLORS.edge + ';';

DataFlow.FLOW_ROLE_STYLES = {
	'primary': 'entryX=0;entryY=0.5;entryDx=0;entryDy=0;',
	'secondary': 'entryX=0.5;entryY=1;entryDx=0;entryDy=0;dashed=1;dashPattern=6 4;',
	'output': '',
	'invalid': 'dashed=1;dashPattern=2 3;strokeColor=' + DataFlow.COLORS.invalid + ';'
};

/**
 * Model view (docs/DATAFLOW.md §7): layers, table colours per system
 * (decision F), sizes and styles. Lineage is one edge per pair of datasets,
 * labelled with the number of attributes (decision E).
 */
DataFlow.VIEW_FLOW = 'flow';
DataFlow.VIEW_MODEL = 'model';
DataFlow.VIEW_ATTRIBUTE = 'dfView';

DataFlow.SYSTEM_PALETTE = ['#1D4ED8', '#0F766E', '#BE185D', '#4D7C0F', '#6D28D9', '#B45309'];
DataFlow.COLORS.relationship = '#334155';
DataFlow.COLORS.lineage = '#94A3B8';

DataFlow.TABLE_WIDTH = 200;
DataFlow.TABLE_HEADER = 30;
DataFlow.TABLE_GAP_X = 120;
DataFlow.TABLE_GAP_Y = 40;

DataFlow.TABLE_STYLE = 'swimlane;dataflow=table;html=1;whiteSpace=wrap;startSize=' +
	DataFlow.TABLE_HEADER + ';childLayout=stackLayout;horizontalStack=0;resizeParent=1;' +
	'resizeParentMax=0;resizeLast=0;collapsible=0;rounded=1;arcSize=4;absoluteArcSize=1;' +
	'shadow=1;swimlaneLine=0;swimlaneFillColor=#FFFFFF;strokeColor=' +
	DataFlow.COLORS.systemBorder + ';fontColor=#FFFFFF;fontSize=12;align=left;' +
	'verticalAlign=middle;spacingLeft=10;spacingRight=10;editable=0;rotatable=0;';

DataFlow.COLUMN_STYLE = 'text;dataflow=column;html=1;whiteSpace=wrap;align=left;' +
	'verticalAlign=middle;spacingLeft=10;spacingRight=8;fontSize=11;fontColor=' +
	DataFlow.COLORS.attributeText + ';strokeColor=none;points=[[0,0.5],[1,0.5]];' +
	'portConstraint=eastwest;movable=0;resizable=0;deletable=0;editable=0;rotatable=0;' +
	'cloneable=0;';

DataFlow.RELATIONSHIP_STYLE = 'dataflow=relationship;html=1;edgeStyle=entityRelationEdgeStyle;' +
	'strokeWidth=1.5;strokeColor=' + DataFlow.COLORS.relationship + ';startFill=0;endFill=0;' +
	'fontSize=10;fontStyle=1;fontColor=' + DataFlow.COLORS.relationship + ';' +
	'labelBackgroundColor=#FFFFFF;editable=0;movable=0;';

DataFlow.LINEAGE_STYLE = 'dataflow=lineage;html=1;edgeStyle=orthogonalEdgeStyle;rounded=1;' +
	'dashed=1;dashPattern=4 3;strokeWidth=1;strokeColor=' + DataFlow.COLORS.lineage +
	';endArrow=open;endFill=0;fontSize=9;fontColor=#64748B;labelBackgroundColor=#FFFFFF;' +
	'editable=0;deletable=0;movable=0;bendable=0;';

/**
 * Returns true if the given value is a valid entity ID.
 */
DataFlow.isValidId = function(id)
{
	return typeof id === 'string' && DataFlow.ID_PATTERN.test(id);
};

/**
 * Returns a new entity ID.
 */
DataFlow.createId = function()
{
	return Editor.guid();
};
