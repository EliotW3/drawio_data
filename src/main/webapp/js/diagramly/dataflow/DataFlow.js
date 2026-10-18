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
DataFlow.CARDINALITIES = ['1:1', '1:N', 'N:1', 'N:M'];

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
