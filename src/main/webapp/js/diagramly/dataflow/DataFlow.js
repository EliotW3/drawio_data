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
