/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * The catalog of a data flow page: its systems, datasets, attributes,
 * actions and relationships (docs/DATAFLOW.md §4). It is plain data without
 * DOM or graph access. Every change goes through the methods below, which
 * keep all references consistent (§4.3). The catalog is stored as JSON on
 * the page root cell, see DataFlowCatalog.read, write and edit.
 *
 * Entities are kept in null-prototype maps keyed by ID. Removing an entity
 * returns a report of everything that was removed with it and of the
 * actions whose configuration lost something (flagged as needing
 * attention), which dialogs use to confirm cascading deletes.
 */
function DataFlowCatalog(data)
{
	this.systems = DataFlowCatalog.createMap();
	this.datasets = DataFlowCatalog.createMap();
	this.attributes = DataFlowCatalog.createMap();
	this.actions = DataFlowCatalog.createMap();
	this.relationships = DataFlowCatalog.createMap();
	this.warnings = [];

	if (data != null)
	{
		this.load(data);
	}
};

/**
 * Keys that are never accepted as IDs. This is a list on purpose: in an
 * object literal, '__proto__': true sets the prototype instead of a key.
 */
DataFlowCatalog.RESERVED_IDS = ['__proto__', 'constructor', 'prototype'];

/**
 * Text of the last catalog whose load warnings were logged.
 */
DataFlowCatalog.lastWarnedText = null;

/**
 * Returns a new null-prototype map.
 */
DataFlowCatalog.createMap = function()
{
	return Object.create(null);
};

/**
 * Returns true if the given value is a valid entity ID.
 */
DataFlowCatalog.isValidId = function(id)
{
	return DataFlow.isValidId(id) && mxUtils.indexOf(DataFlowCatalog.RESERVED_IDS, id) < 0;
};

/**
 * Returns the given value as text of at most the given length, or the
 * empty string for values that are not strings or numbers.
 */
DataFlowCatalog.toText = function(value, maxLength)
{
	var text = (typeof value === 'string') ? value :
		((typeof value === 'number' && isFinite(value)) ? String(value) : '');

	return text.substring(0, (maxLength != null) ? maxLength : DataFlow.MAX_NAME_LENGTH);
};

/**
 * Returns the given name trimmed, or throws if it is empty.
 */
DataFlowCatalog.toName = function(value, what)
{
	var name = mxUtils.trim(DataFlowCatalog.toText(value));

	if (name.length == 0)
	{
		throw new Error('DataFlowCatalog: ' + what + ' name is empty');
	}

	return name;
};

/**
 * Returns true if the given value is a plain object (not null or an array).
 */
DataFlowCatalog.isObject = function(value)
{
	return value != null && typeof value === 'object' && !Array.isArray(value);
};

/**
 * Returns the IDs in the given map in insertion order.
 */
DataFlowCatalog.keys = function(map)
{
	return Object.keys(map);
};

/**
 * Returns a new empty removal report.
 */
DataFlowCatalog.createReport = function()
{
	return {systems: [], datasets: [], attributes: [],
		actions: [], relationships: [], flagged: []};
};

/**
 * Returns true if the given report removed or flagged anything.
 */
DataFlowCatalog.isEmptyReport = function(report)
{
	return report.systems.length == 0 && report.datasets.length == 0 &&
		report.attributes.length == 0 && report.actions.length == 0 &&
		report.relationships.length == 0 && report.flagged.length == 0;
};

/**
 * Parses the given JSON text into a catalog. Invalid text gives an empty
 * catalog with a warning, invalid entries are dropped with a warning.
 */
DataFlowCatalog.parse = function(text)
{
	var data = null;
	var warning = null;

	if (text != null && text !== '')
	{
		try
		{
			data = JSON.parse(text);
		}
		catch (e)
		{
			warning = 'invalid JSON: ' + e.message;
		}
	}

	var catalog = new DataFlowCatalog(data);

	if (warning != null)
	{
		catalog.warnings.unshift(warning);
	}

	return catalog;
};

/**
 * Returns the root cell of the given graph's current page.
 */
DataFlowCatalog.getRoot = function(graph)
{
	return graph.model.getRoot();
};

/**
 * Returns the catalog JSON stored on the current page, or null.
 */
DataFlowCatalog.getText = function(graph)
{
	var root = DataFlowCatalog.getRoot(graph);

	return (root != null && root.value != null && typeof root.value === 'object') ?
		root.value.getAttribute(DataFlow.CATALOG_ATTRIBUTE) : null;
};

/**
 * Returns true if the current page of the given graph has a catalog.
 */
DataFlowCatalog.hasCatalog = function(graph)
{
	var text = DataFlowCatalog.getText(graph);

	return text != null && text !== '';
};

/**
 * Returns a new catalog parsed from the current page of the given graph.
 * Changes to it are only stored with DataFlowCatalog.write. Load warnings
 * are logged once per stored text.
 */
DataFlowCatalog.read = function(graph)
{
	var text = DataFlowCatalog.getText(graph);
	var catalog = DataFlowCatalog.parse(text);

	if (catalog.warnings.length > 0 && text !== DataFlowCatalog.lastWarnedText)
	{
		DataFlowCatalog.lastWarnedText = text;

		if (window.console != null)
		{
			console.warn('DataFlowCatalog: repaired the catalog on load:', catalog.warnings);
		}
	}

	return catalog;
};

/**
 * Stores the given catalog on the current page of the given graph as an
 * undoable change. Nothing is changed if the JSON is the same.
 */
DataFlowCatalog.write = function(graph, catalog)
{
	var text = catalog.stringify();

	if (text !== DataFlowCatalog.getText(graph))
	{
		graph.setAttributeForCell(DataFlowCatalog.getRoot(graph),
			DataFlow.CATALOG_ATTRIBUTE, text);
	}
};

/**
 * Reads the catalog of the current page, passes it to the given function
 * and stores it afterwards, all in one model transaction so that a single
 * undo reverts the catalog together with any cells changed by the function.
 * Nothing is stored if the function throws. Returns the function's result.
 */
DataFlowCatalog.edit = function(graph, fn)
{
	var result = null;

	graph.model.beginUpdate();
	try
	{
		var catalog = DataFlowCatalog.read(graph);
		result = fn(catalog);
		DataFlowCatalog.write(graph, catalog);
	}
	finally
	{
		graph.model.endUpdate();
	}

	return result;
};

/**
 * Returns the catalog as a plain object for JSON.
 */
DataFlowCatalog.prototype.toJSON = function()
{
	return {version: DataFlow.CATALOG_VERSION, systems: this.systems,
		datasets: this.datasets, attributes: this.attributes,
		relationships: this.relationships, actions: this.actions};
};

/**
 * Returns the catalog as JSON text.
 */
DataFlowCatalog.prototype.stringify = function()
{
	return JSON.stringify(this.toJSON());
};

/**
 * Returns an independent copy of this catalog.
 */
DataFlowCatalog.prototype.clone = function()
{
	return DataFlowCatalog.parse(this.stringify());
};

/**
 * Returns true if the catalog has no entities.
 */
DataFlowCatalog.prototype.isEmpty = function()
{
	return DataFlowCatalog.keys(this.systems).length == 0 &&
		DataFlowCatalog.keys(this.actions).length == 0;
};

/**
 * Returns a new ID that is not used in this catalog.
 */
DataFlowCatalog.prototype.createId = function()
{
	var id = null;

	do
	{
		id = DataFlow.createId();
	}
	while (!DataFlowCatalog.isValidId(id) || this.systems[id] != null ||
		this.datasets[id] != null || this.attributes[id] != null ||
		this.actions[id] != null || this.relationships[id] != null);

	return id;
};

/**
 * Adds a warning for the load of the given entity.
 */
DataFlowCatalog.prototype.warn = function(kind, id, message)
{
	this.warnings.push(kind + ' ' + id + ': ' + message);
};

/**
 * Loads the given parsed JSON, dropping or repairing invalid entries
 * (docs/DATAFLOW.md §4.3).
 */
DataFlowCatalog.prototype.load = function(data)
{
	if (!DataFlowCatalog.isObject(data))
	{
		this.warnings.push('catalog is not an object');

		return;
	}

	if (typeof data.version === 'number' && data.version > DataFlow.CATALOG_VERSION)
	{
		this.warnings.push('catalog version ' + data.version + ' is newer than ' +
			DataFlow.CATALOG_VERSION + ', unknown fields are dropped');
	}

	var self = this;

	// Calls fn for every entry with a valid ID and an object value
	function each(kind, map, fn)
	{
		if (map == null)
		{
			return;
		}
		else if (!DataFlowCatalog.isObject(map))
		{
			self.warnings.push(kind + ' is not an object');

			return;
		}

		var ids = Object.keys(map);

		for (var i = 0; i < ids.length; i++)
		{
			var id = ids[i];

			if (!DataFlowCatalog.isValidId(id))
			{
				self.warnings.push(kind + ': invalid ID dropped');
			}
			else if (self.systems[id] != null || self.datasets[id] != null ||
				self.attributes[id] != null || self.actions[id] != null ||
				self.relationships[id] != null)
			{
				self.warn(kind, id, 'duplicate ID dropped');
			}
			else if (!DataFlowCatalog.isObject(map[id]))
			{
				self.warn(kind, id, 'not an object, dropped');
			}
			else
			{
				fn(id, map[id]);
			}
		}
	};

	each('system', data.systems, function(id, s)
	{
		var name = mxUtils.trim(DataFlowCatalog.toText(s.name));

		self.systems[id] = {name: (name.length > 0) ? name : '?',
			owner: DataFlowCatalog.toText(s.owner),
			environment: DataFlowCatalog.toText(s.environment),
			notes: DataFlowCatalog.toText(s.notes, DataFlow.MAX_NOTES_LENGTH)};

		if (name.length == 0)
		{
			self.warn('system', id, 'empty name');
		}
	});

	var listed = DataFlowCatalog.createMap();

	each('dataset', data.datasets, function(id, d)
	{
		if (self.systems[d.system] == null || !DataFlowCatalog.isValidId(d.system))
		{
			self.warn('dataset', id, 'unknown system, dropped');
		}
		else
		{
			var name = mxUtils.trim(DataFlowCatalog.toText(d.name));

			self.datasets[id] = {name: (name.length > 0) ? name : '?',
				system: d.system, attributes: [], origin: null};
			listed[id] = Array.isArray(d.attributes) ? d.attributes : [];

			// Validated after the actions are loaded
			if (DataFlowCatalog.isObject(d.origin))
			{
				self.datasets[id].origin = {action: d.origin.action};
			}

			if (name.length == 0)
			{
				self.warn('dataset', id, 'empty name');
			}
		}
	});

	var derived = DataFlowCatalog.createMap();

	each('attribute', data.attributes, function(id, a)
	{
		if (!DataFlowCatalog.isValidId(a.dataset) || self.datasets[a.dataset] == null)
		{
			self.warn('attribute', id, 'unknown dataset, dropped');
		}
		else
		{
			var name = mxUtils.trim(DataFlowCatalog.toText(a.name));

			self.attributes[id] = {name: (name.length > 0) ? name : '?',
				dataset: a.dataset, derivedFrom: null};
			derived[id] = a.derivedFrom;

			if (name.length == 0)
			{
				self.warn('attribute', id, 'empty name');
			}
		}
	});

	// Attribute order: listed attributes of the dataset first, then any
	// attribute of the dataset that the list is missing
	for (var dId in this.datasets)
	{
		var list = listed[dId];
		var dataset = this.datasets[dId];
		var seen = DataFlowCatalog.createMap();

		for (var i = 0; i < list.length; i++)
		{
			var aId = list[i];

			if (DataFlowCatalog.isValidId(aId) && this.attributes[aId] != null &&
				this.attributes[aId].dataset == dId && !seen[aId])
			{
				seen[aId] = true;
				dataset.attributes.push(aId);
			}
			else
			{
				this.warn('dataset', dId, 'invalid attribute reference dropped');
			}
		}

		for (var aId in this.attributes)
		{
			if (this.attributes[aId].dataset == dId && !seen[aId])
			{
				seen[aId] = true;
				dataset.attributes.push(aId);
				this.warn('dataset', dId, 'unlisted attribute ' + aId + ' appended');
			}
		}
	}

	for (var aId in derived)
	{
		var src = derived[aId];

		if (src != null)
		{
			if (src !== aId && DataFlowCatalog.isValidId(src) && this.attributes[src] != null)
			{
				this.attributes[aId].derivedFrom = src;
			}
			else
			{
				this.warn('attribute', aId, 'invalid lineage dropped');
			}
		}
	}

	var configs = DataFlowCatalog.createMap();

	each('action', data.actions, function(id, x)
	{
		if (mxUtils.indexOf(DataFlow.ACTION_TYPES, x.type) < 0)
		{
			self.warn('action', id, 'unknown type, dropped');
		}
		else
		{
			self.actions[id] = {type: x.type, config: null, attention: []};
			configs[id] = x;
		}
	});

	each('relationship', data.relationships, function(id, r)
	{
		var valid = DataFlowCatalog.isValidId(r.from) && DataFlowCatalog.isValidId(r.to) &&
			self.attributes[r.from] != null && self.attributes[r.to] != null && r.from != r.to;

		if (!valid)
		{
			self.warn('relationship', id, 'unknown or identical attributes, dropped');
		}
		else if (r.source == DataFlow.RELATIONSHIP_ADDITION &&
			(!DataFlowCatalog.isValidId(r.action) || self.actions[r.action] == null ||
			self.actions[r.action].type != DataFlow.ACTION_ADDITION))
		{
			self.warn('relationship', id, 'unknown addition, dropped');
		}
		else
		{
			var cardinality = r.cardinality;

			if (mxUtils.indexOf(DataFlow.CARDINALITIES, cardinality) < 0)
			{
				self.warn('relationship', id, 'invalid cardinality, set to 1:N');
				cardinality = '1:N';
			}

			var rel = {from: r.from, to: r.to, cardinality: cardinality,
				source: DataFlow.RELATIONSHIP_MANUAL};

			if (r.source == DataFlow.RELATIONSHIP_ADDITION)
			{
				rel.source = DataFlow.RELATIONSHIP_ADDITION;
				rel.action = r.action;
			}

			self.relationships[id] = rel;
		}
	});

	for (var xId in configs)
	{
		var raw = configs[xId];
		var action = this.actions[xId];
		action.config = this.sanitizeConfig(action.type, raw.config, xId);

		if (Array.isArray(raw.attention))
		{
			for (var i = 0; i < raw.attention.length; i++)
			{
				var entry = raw.attention[i];

				if (DataFlowCatalog.isObject(entry) && typeof entry.code === 'string')
				{
					action.attention.push({code: DataFlowCatalog.toText(entry.code, 64),
						id: DataFlowCatalog.isValidId(entry.id) ? entry.id : null});
				}
			}
		}
	}

	for (var dId in this.datasets)
	{
		var origin = this.datasets[dId].origin;

		if (origin != null && (!DataFlowCatalog.isValidId(origin.action) ||
			this.actions[origin.action] == null))
		{
			this.warn('dataset', dId, 'unknown origin action dropped');
			this.datasets[dId].origin = null;
		}
	}
};

/**
 * Returns the given action configuration with every invalid reference
 * removed. The ID is the action's (null for a new action).
 */
DataFlowCatalog.prototype.sanitizeConfig = function(type, config, id)
{
	var self = this;
	config = DataFlowCatalog.isObject(config) ? config : {};

	function dataset(dId)
	{
		return (DataFlowCatalog.isValidId(dId) && self.datasets[dId] != null) ? dId : null;
	};

	function attributeOf(aId, dId)
	{
		return DataFlowCatalog.isValidId(aId) && self.attributes[aId] != null &&
			(dId == null || self.attributes[aId].dataset == dId);
	};

	// Returns the valid values without duplicates (compared as JSON, which
	// also covers the attribute pairs of validations)
	function list(values, valid)
	{
		var result = [];
		var seen = DataFlowCatalog.createMap();

		if (Array.isArray(values))
		{
			for (var i = 0; i < values.length; i++)
			{
				if (valid(values[i]))
				{
					var key = JSON.stringify(values[i]);

					if (!seen[key])
					{
						seen[key] = true;
						result.push(values[i]);
					}
				}
			}
		}

		return result;
	};

	if (type == DataFlow.ACTION_EXPORT)
	{
		return {dataset: dataset(config.dataset)};
	}
	else if (type == DataFlow.ACTION_ADDITION)
	{
		return {dataset: dataset(config.dataset)};
	}
	else if (type == DataFlow.ACTION_FILTER)
	{
		var copies = DataFlowCatalog.createMap();

		if (DataFlowCatalog.isObject(config.copies))
		{
			for (var src in config.copies)
			{
				if (dataset(src) != null && dataset(config.copies[src]) != null &&
					src != config.copies[src])
				{
					copies[src] = config.copies[src];
				}
			}
		}

		var dropped = DataFlowCatalog.isObject(config.dropped) ? config.dropped : {};

		return {copies: copies, dropped: {
			datasets: list(dropped.datasets, function(dId) { return dataset(dId) != null; }),
			attributes: list(dropped.attributes, function(aId) { return attributeOf(aId); })}};
	}
	else if (type == DataFlow.ACTION_VALIDATION)
	{
		var pairs = [];

		if (Array.isArray(config.pairs))
		{
			for (var i = 0; i < config.pairs.length; i++)
			{
				var pair = config.pairs[i];

				if (DataFlowCatalog.isObject(pair) && dataset(pair.primary) != null &&
					dataset(pair.reference) != null && pair.primary != pair.reference)
				{
					pairs.push({primary: pair.primary, reference: pair.reference,
						attributes: list(pair.attributes, function(p)
						{
							return Array.isArray(p) && p.length == 2 &&
								attributeOf(p[0], pair.primary) &&
								attributeOf(p[1], pair.reference);
						}).map(function(p) { return [p[0], p[1]]; })});
				}
			}
		}

		var color = (typeof config.color === 'string' &&
			/^#[0-9a-fA-F]{6}$/.test(config.color)) ?
			config.color : this.nextValidationColor(id);

		return {color: color, pairs: pairs};
	}

	return {};
};

/**
 * Returns the highlight colour for a new validation, cycling through
 * DataFlow.VALIDATION_COLORS. The ID is excluded from the count.
 */
DataFlowCatalog.prototype.nextValidationColor = function(id)
{
	var count = 0;

	for (var xId in this.actions)
	{
		if (xId != id && this.actions[xId].type == DataFlow.ACTION_VALIDATION)
		{
			count++;
		}
	}

	return DataFlow.VALIDATION_COLORS[count % DataFlow.VALIDATION_COLORS.length];
};

/**
 * Returns the entity for the given ID in the given map or throws.
 */
DataFlowCatalog.prototype.require = function(map, id, kind)
{
	var entity = (DataFlowCatalog.isValidId(id)) ? map[id] : null;

	if (entity == null)
	{
		throw new Error('DataFlowCatalog: unknown ' + kind + ' ' + id);
	}

	return entity;
};

/**
 * Lookups. Each returns null for an unknown ID.
 */
DataFlowCatalog.prototype.getSystem = function(id)
{
	return (DataFlowCatalog.isValidId(id)) ? this.systems[id] || null : null;
};

DataFlowCatalog.prototype.getDataset = function(id)
{
	return (DataFlowCatalog.isValidId(id)) ? this.datasets[id] || null : null;
};

DataFlowCatalog.prototype.getAttribute = function(id)
{
	return (DataFlowCatalog.isValidId(id)) ? this.attributes[id] || null : null;
};

DataFlowCatalog.prototype.getAction = function(id)
{
	return (DataFlowCatalog.isValidId(id)) ? this.actions[id] || null : null;
};

DataFlowCatalog.prototype.getRelationship = function(id)
{
	return (DataFlowCatalog.isValidId(id)) ? this.relationships[id] || null : null;
};

/**
 * Returns the IDs of all systems.
 */
DataFlowCatalog.prototype.getSystemIds = function()
{
	return DataFlowCatalog.keys(this.systems);
};

/**
 * Returns the IDs of all datasets, or those of the given system.
 */
DataFlowCatalog.prototype.getDatasetIds = function(systemId)
{
	var result = [];

	for (var id in this.datasets)
	{
		if (systemId == null || this.datasets[id].system == systemId)
		{
			result.push(id);
		}
	}

	return result;
};

/**
 * Returns the IDs of all actions, or those of the given type.
 */
DataFlowCatalog.prototype.getActionIds = function(type)
{
	var result = [];

	for (var id in this.actions)
	{
		if (type == null || this.actions[id].type == type)
		{
			result.push(id);
		}
	}

	return result;
};

/**
 * Returns the IDs of the relationships of the given attribute, or of the
 * given addition action, or all.
 */
DataFlowCatalog.prototype.getRelationshipIds = function(attributeId, actionId)
{
	var result = [];

	for (var id in this.relationships)
	{
		var r = this.relationships[id];

		if ((attributeId == null || r.from == attributeId || r.to == attributeId) &&
			(actionId == null || r.action == actionId))
		{
			result.push(id);
		}
	}

	return result;
};

/**
 * Returns the IDs of the attributes derived from the given attribute.
 */
DataFlowCatalog.prototype.getDerivedAttributeIds = function(attributeId)
{
	var result = [];

	for (var id in this.attributes)
	{
		if (this.attributes[id].derivedFrom == attributeId)
		{
			result.push(id);
		}
	}

	return result;
};

/**
 * Systems.
 */
DataFlowCatalog.prototype.addSystem = function(props)
{
	props = props || {};
	var id = this.createId();

	this.systems[id] = {name: DataFlowCatalog.toName(props.name, 'system'),
		owner: mxUtils.trim(DataFlowCatalog.toText(props.owner)),
		environment: mxUtils.trim(DataFlowCatalog.toText(props.environment)),
		notes: DataFlowCatalog.toText(props.notes, DataFlow.MAX_NOTES_LENGTH)};

	return id;
};

/**
 * Updates the given properties (name, owner, environment, notes) of a system.
 */
DataFlowCatalog.prototype.updateSystem = function(id, props)
{
	var system = this.require(this.systems, id, 'system');

	if (props.name != null)
	{
		system.name = DataFlowCatalog.toName(props.name, 'system');
	}

	if (props.owner != null)
	{
		system.owner = mxUtils.trim(DataFlowCatalog.toText(props.owner));
	}

	if (props.environment != null)
	{
		system.environment = mxUtils.trim(DataFlowCatalog.toText(props.environment));
	}

	if (props.notes != null)
	{
		system.notes = DataFlowCatalog.toText(props.notes, DataFlow.MAX_NOTES_LENGTH);
	}
};

/**
 * Returns the distinct non-empty environments of all systems, sorted.
 */
DataFlowCatalog.prototype.getEnvironments = function()
{
	var seen = DataFlowCatalog.createMap();
	var result = [];

	for (var id in this.systems)
	{
		var env = this.systems[id].environment;

		if (env.length > 0 && !seen[env.toLowerCase()])
		{
			seen[env.toLowerCase()] = true;
			result.push(env);
		}
	}

	return result.sort(function(a, b)
	{
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});
};

/**
 * Removes a system with its datasets. Returns the removal report.
 */
DataFlowCatalog.prototype.removeSystem = function(id, report)
{
	this.require(this.systems, id, 'system');
	report = report || DataFlowCatalog.createReport();
	var datasets = this.getDatasetIds(id);

	for (var i = 0; i < datasets.length; i++)
	{
		this.removeDataset(datasets[i], report);
	}

	delete this.systems[id];
	report.systems.push(id);

	return report;
};

/**
 * Datasets. The origin is the ID of the action that created the dataset.
 * Returns the ID of the new dataset.
 */
DataFlowCatalog.prototype.addDataset = function(systemId, name, attributeNames, originActionId)
{
	this.require(this.systems, systemId, 'system');
	var id = this.createId();

	this.datasets[id] = {name: DataFlowCatalog.toName(name, 'dataset'),
		system: systemId, attributes: [], origin: null};

	if (originActionId != null)
	{
		this.require(this.actions, originActionId, 'action');
		this.datasets[id].origin = {action: originActionId};
	}

	if (attributeNames != null)
	{
		for (var i = 0; i < attributeNames.length; i++)
		{
			this.addAttribute(id, attributeNames[i]);
		}
	}

	return id;
};

/**
 * Renames a dataset.
 */
DataFlowCatalog.prototype.renameDataset = function(id, name)
{
	this.require(this.datasets, id, 'dataset').name =
		DataFlowCatalog.toName(name, 'dataset');
};

/**
 * Replaces the attribute list of a dataset as edited in the attribute
 * editor: entries are {id, name}, where a null ID adds an attribute and an
 * existing ID renames and moves it. Existing attributes that are missing in
 * the list are removed. Returns {ids, report} with the IDs in the new order.
 */
DataFlowCatalog.prototype.setDatasetAttributes = function(id, entries)
{
	var dataset = this.require(this.datasets, id, 'dataset');
	var report = DataFlowCatalog.createReport();
	var keep = DataFlowCatalog.createMap();
	var names = [];

	// Validates everything before changing anything
	for (var i = 0; i < entries.length; i++)
	{
		var aId = entries[i].id;

		if (aId != null)
		{
			var attribute = this.require(this.attributes, aId, 'attribute');

			if (attribute.dataset != id || keep[aId])
			{
				throw new Error('DataFlowCatalog: attribute ' + aId +
					' is not in dataset ' + id + ' or listed twice');
			}

			keep[aId] = true;
		}

		names.push(DataFlowCatalog.toName(entries[i].name, 'attribute'));
	}

	var removed = dataset.attributes.filter(function(aId)
	{
		return !keep[aId];
	});

	for (var i = 0; i < removed.length; i++)
	{
		this.removeAttribute(removed[i], report);
	}

	var ids = [];

	for (var i = 0; i < entries.length; i++)
	{
		var aId = entries[i].id;

		if (aId == null)
		{
			aId = this.createId();
			this.attributes[aId] = {name: names[i], dataset: id, derivedFrom: null};
		}
		else
		{
			this.attributes[aId].name = names[i];
		}

		ids.push(aId);
	}

	dataset.attributes = ids;

	return {ids: ids, report: report};
};

/**
 * Removes a dataset with its attributes. Actions that referenced it are
 * flagged. Returns the removal report.
 */
DataFlowCatalog.prototype.removeDataset = function(id, report)
{
	var dataset = this.require(this.datasets, id, 'dataset');
	report = report || DataFlowCatalog.createReport();
	var attributes = dataset.attributes.slice();

	for (var i = 0; i < attributes.length; i++)
	{
		this.removeAttribute(attributes[i], report);
	}

	for (var xId in this.actions)
	{
		var action = this.actions[xId];
		var config = action.config;
		var changed = false;

		if (action.type == DataFlow.ACTION_EXPORT || action.type == DataFlow.ACTION_ADDITION)
		{
			if (config.dataset == id)
			{
				config.dataset = null;
				changed = true;
			}
		}
		else if (action.type == DataFlow.ACTION_FILTER)
		{
			for (var src in config.copies)
			{
				if (src == id || config.copies[src] == id)
				{
					delete config.copies[src];
					changed = true;
				}
			}

			var index = mxUtils.indexOf(config.dropped.datasets, id);

			if (index >= 0)
			{
				config.dropped.datasets.splice(index, 1);
				changed = true;
			}
		}
		else if (action.type == DataFlow.ACTION_VALIDATION)
		{
			var pairs = config.pairs.filter(function(pair)
			{
				return pair.primary != id && pair.reference != id;
			});

			changed = pairs.length != config.pairs.length;
			config.pairs = pairs;
		}

		if (changed)
		{
			this.flagAction(xId, 'datasetRemoved', id, report);
		}
	}

	delete this.datasets[id];
	report.datasets.push(id);

	return report;
};

/**
 * Attributes. Returns the ID of the new attribute, which is inserted at the
 * given index or appended.
 */
DataFlowCatalog.prototype.addAttribute = function(datasetId, name, index, derivedFrom)
{
	var dataset = this.require(this.datasets, datasetId, 'dataset');
	var attributeName = DataFlowCatalog.toName(name, 'attribute');

	if (derivedFrom != null)
	{
		this.require(this.attributes, derivedFrom, 'attribute');
	}

	var id = this.createId();
	this.attributes[id] = {name: attributeName, dataset: datasetId,
		derivedFrom: (derivedFrom != null) ? derivedFrom : null};

	if (index != null && index >= 0 && index < dataset.attributes.length)
	{
		dataset.attributes.splice(index, 0, id);
	}
	else
	{
		dataset.attributes.push(id);
	}

	return id;
};

/**
 * Renames an attribute.
 */
DataFlowCatalog.prototype.renameAttribute = function(id, name)
{
	this.require(this.attributes, id, 'attribute').name =
		DataFlowCatalog.toName(name, 'attribute');
};

/**
 * Sets or clears (null) the attribute the given attribute was copied from.
 */
DataFlowCatalog.prototype.setDerivedFrom = function(id, sourceId)
{
	var attribute = this.require(this.attributes, id, 'attribute');

	if (sourceId != null)
	{
		this.require(this.attributes, sourceId, 'attribute');

		if (sourceId == id)
		{
			throw new Error('DataFlowCatalog: attribute ' + id + ' derived from itself');
		}
	}

	attribute.derivedFrom = (sourceId != null) ? sourceId : null;
};

/**
 * Removes an attribute with its relationships. Attributes derived from it
 * lose their lineage, and actions that referenced it or created those
 * copies are flagged. Returns the removal report.
 */
DataFlowCatalog.prototype.removeAttribute = function(id, report)
{
	var attribute = this.require(this.attributes, id, 'attribute');
	report = report || DataFlowCatalog.createReport();
	var relationships = this.getRelationshipIds(id);

	for (var i = 0; i < relationships.length; i++)
	{
		this.removeRelationship(relationships[i], report);
	}

	var derived = this.getDerivedAttributeIds(id);

	for (var i = 0; i < derived.length; i++)
	{
		this.attributes[derived[i]].derivedFrom = null;

		// The Export or Filter that made the copy no longer matches its input
		var origin = this.datasets[this.attributes[derived[i]].dataset].origin;

		if (origin != null && this.actions[origin.action] != null)
		{
			this.flagAction(origin.action, 'attributeRemoved', id, report);
		}
	}

	for (var xId in this.actions)
	{
		var action = this.actions[xId];
		var config = action.config;
		var changed = false;

		if (action.type == DataFlow.ACTION_FILTER)
		{
			var index = mxUtils.indexOf(config.dropped.attributes, id);

			if (index >= 0)
			{
				config.dropped.attributes.splice(index, 1);
				changed = true;
			}
		}
		else if (action.type == DataFlow.ACTION_VALIDATION)
		{
			for (var i = 0; i < config.pairs.length; i++)
			{
				var pairs = config.pairs[i].attributes.filter(function(p)
				{
					return p[0] != id && p[1] != id;
				});

				changed = changed || pairs.length != config.pairs[i].attributes.length;
				config.pairs[i].attributes = pairs;
			}
		}

		if (changed)
		{
			this.flagAction(xId, 'attributeRemoved', id, report);
		}
	}

	var dataset = this.datasets[attribute.dataset];
	var index = mxUtils.indexOf(dataset.attributes, id);

	if (index >= 0)
	{
		dataset.attributes.splice(index, 1);
	}

	delete this.attributes[id];
	report.attributes.push(id);

	return report;
};

/**
 * Relationships. A relationship from an addition must name that action.
 * Returns the ID of the new relationship.
 */
DataFlowCatalog.prototype.addRelationship = function(from, to, cardinality, actionId)
{
	this.require(this.attributes, from, 'attribute');
	this.require(this.attributes, to, 'attribute');

	if (from == to)
	{
		throw new Error('DataFlowCatalog: relationship of attribute ' + from + ' to itself');
	}

	if (mxUtils.indexOf(DataFlow.CARDINALITIES, cardinality) < 0)
	{
		throw new Error('DataFlowCatalog: invalid cardinality ' + cardinality);
	}

	var rel = {from: from, to: to, cardinality: cardinality,
		source: DataFlow.RELATIONSHIP_MANUAL};

	if (actionId != null)
	{
		if (this.require(this.actions, actionId, 'action').type != DataFlow.ACTION_ADDITION)
		{
			throw new Error('DataFlowCatalog: action ' + actionId + ' is not an addition');
		}

		rel.source = DataFlow.RELATIONSHIP_ADDITION;
		rel.action = actionId;
	}

	var id = this.createId();
	this.relationships[id] = rel;

	return id;
};

/**
 * Changes the cardinality of a relationship.
 */
DataFlowCatalog.prototype.setCardinality = function(id, cardinality)
{
	var rel = this.require(this.relationships, id, 'relationship');

	if (mxUtils.indexOf(DataFlow.CARDINALITIES, cardinality) < 0)
	{
		throw new Error('DataFlowCatalog: invalid cardinality ' + cardinality);
	}

	rel.cardinality = cardinality;
};

/**
 * Removes a relationship. The addition that created it is flagged. Returns
 * the removal report.
 */
DataFlowCatalog.prototype.removeRelationship = function(id, report)
{
	var rel = this.require(this.relationships, id, 'relationship');
	report = report || DataFlowCatalog.createReport();
	delete this.relationships[id];
	report.relationships.push(id);

	if (rel.action != null && this.actions[rel.action] != null)
	{
		this.flagAction(rel.action, 'relationshipRemoved', id, report);
	}

	return report;
};

/**
 * Actions. The configuration is sanitized (docs/DATAFLOW.md §4.2). Returns
 * the ID of the new action.
 */
DataFlowCatalog.prototype.addAction = function(type, config)
{
	if (mxUtils.indexOf(DataFlow.ACTION_TYPES, type) < 0)
	{
		throw new Error('DataFlowCatalog: invalid action type ' + type);
	}

	var id = this.createId();
	this.actions[id] = {type: type, config: this.sanitizeConfig(type, config, id),
		attention: []};

	return id;
};

/**
 * Replaces the configuration of an action (sanitized) and clears its
 * attention flags, as after confirming its dialog.
 */
DataFlowCatalog.prototype.setActionConfig = function(id, config)
{
	var action = this.require(this.actions, id, 'action');
	action.config = this.sanitizeConfig(action.type, config, id);
	action.attention = [];
};

/**
 * Marks an action as needing attention for the given reason.
 */
DataFlowCatalog.prototype.flagAction = function(id, code, entityId, report)
{
	var action = this.require(this.actions, id, 'action');
	action.attention.push({code: code, id: (entityId != null) ? entityId : null});

	if (report != null && mxUtils.indexOf(report.flagged, id) < 0)
	{
		report.flagged.push(id);
	}
};

/**
 * Returns true if the given action needs attention.
 */
DataFlowCatalog.prototype.needsAttention = function(id)
{
	return this.require(this.actions, id, 'action').attention.length > 0;
};

/**
 * Removes an action. Datasets it created are kept without origin (lineage
 * stays), relationships an addition created are removed. Returns the
 * removal report.
 */
DataFlowCatalog.prototype.removeAction = function(id, report)
{
	this.require(this.actions, id, 'action');
	report = report || DataFlowCatalog.createReport();

	// Removed first so that the relationships do not flag it
	delete this.actions[id];
	report.actions.push(id);

	var relationships = this.getRelationshipIds(null, id);

	for (var i = 0; i < relationships.length; i++)
	{
		this.removeRelationship(relationships[i], report);
	}

	for (var dId in this.datasets)
	{
		var origin = this.datasets[dId].origin;

		if (origin != null && origin.action == id)
		{
			this.datasets[dId].origin = null;
		}
	}

	return report;
};

/**
 * Returns what removing the given entity would remove and flag, without
 * changing this catalog. The kind is system, dataset, attribute, action or
 * relationship.
 */
DataFlowCatalog.prototype.getRemovalImpact = function(kind, id)
{
	var copy = this.clone();
	var fn = {system: copy.removeSystem, dataset: copy.removeDataset,
		attribute: copy.removeAttribute, action: copy.removeAction,
		relationship: copy.removeRelationship}[kind];

	if (fn == null)
	{
		throw new Error('DataFlowCatalog: invalid kind ' + kind);
	}

	return fn.call(copy, id);
};
