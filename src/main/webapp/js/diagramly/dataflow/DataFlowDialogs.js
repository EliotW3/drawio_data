/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * Dialogs of the data flow diagrams (docs/DATAFLOW.md §5.2, §5.3). They
 * follow docs/dialog-style-guide.md: CustomDialog, sections and form rows,
 * automatic height. The dialogs only collect input and hand it to the
 * given callback; DataFlowUi applies it.
 */
var DataFlowDialogs = {};

/**
 * Returns a new form row with a label for the given control.
 */
DataFlowDialogs.addRow = function(parent, label, control, top)
{
	var row = document.createElement('div');
	row.className = 'geDialogFormRow' + ((top) ? ' geDialogFormRowTop' : '');

	var lbl = document.createElement('label');
	lbl.className = 'geDialogFormLabel';
	mxUtils.write(lbl, label);

	if (control.id == '')
	{
		control.id = 'geDataFlow-' + Editor.guid();
	}

	lbl.setAttribute('for', control.id);
	row.appendChild(lbl);
	row.appendChild(control);
	parent.appendChild(row);

	return row;
};

/**
 * Returns a new text input with the given value.
 */
DataFlowDialogs.createInput = function(value, placeholder)
{
	var input = document.createElement('input');
	input.setAttribute('type', 'text');
	input.value = (value != null) ? value : '';

	if (placeholder != null)
	{
		input.setAttribute('placeholder', placeholder);
	}

	return input;
};

/**
 * Returns a new section in the given parent.
 */
DataFlowDialogs.addSection = function(parent)
{
	var section = document.createElement('div');
	section.className = 'geDialogSection';
	parent.appendChild(section);

	return section;
};

/**
 * Returns a select with the given [value, label] options.
 */
DataFlowDialogs.createSelect = function(options)
{
	var select = document.createElement('select');

	for (var i = 0; i < options.length; i++)
	{
		var option = document.createElement('option');
		option.value = options[i][0];
		mxUtils.write(option, options[i][1]);
		select.appendChild(option);
	}

	return select;
};

/**
 * Returns the given [id, name] pairs sorted by name.
 */
DataFlowDialogs.sortByName = function(items)
{
	return items.sort(function(a, b)
	{
		return a[1].toLowerCase().localeCompare(b[1].toLowerCase());
	});
};

/**
 * Shows the given content as a dialog. The OK function returns an error
 * message to keep the dialog open, or nothing to close it.
 */
DataFlowDialogs.show = function(ui, div, okLabel, okFn, focus)
{
	var dlg = new CustomDialog(ui, div, okFn, null, okLabel, null, null, null,
		null, true);
	ui.showDialog(dlg.container, 440, null, true, true);

	if (focus != null)
	{
		focus.focus();

		if (focus.select != null)
		{
			focus.select();
		}
	}

	return dlg;
};

/**
 * System dialog. For a new placement (systemId is null) it offers the
 * existing systems of the page or a new one. The callback receives
 * {id, includeDatasets} for an existing system, otherwise {props} with
 * name, owner, environment and notes.
 */
DataFlowDialogs.showSystemDialog = function(ui, catalog, systemId, fn)
{
	var system = (systemId != null) ? catalog.getSystem(systemId) : null;
	var div = document.createElement('div');
	var hd = document.createElement('h3');
	mxUtils.write(hd, mxResources.get((system != null) ? 'dfEditSystem' : 'dfAddSystem'));
	div.appendChild(hd);

	var existing = null;
	var radioNew = null;
	var include = null;
	var systems = [];

	if (system == null)
	{
		var ids = catalog.getSystemIds();

		for (var i = 0; i < ids.length; i++)
		{
			systems.push([ids[i], catalog.getSystem(ids[i]).name]);
		}
	}

	if (systems.length > 0)
	{
		var choice = DataFlowDialogs.addSection(div);
		var group = 'geDataFlowSystem-' + Editor.guid();
		var radioExisting = ui.addCheckbox(choice, mxResources.get('dfExistingSystem'),
			false, null, null, null, true, group, true);
		existing = DataFlowDialogs.createSelect(DataFlowDialogs.sortByName(systems));
		existing.setAttribute('aria-label', mxResources.get('dfExistingSystem'));
		radioExisting.checkRow.appendChild(existing);
		include = ui.addCheckbox(choice, mxResources.get('dfAddItsDatasets'),
			true, null, null, null, null, null, true);
		include.checkRow.style.paddingLeft = '24px';
		radioNew = ui.addCheckbox(choice, mxResources.get('dfNewSystem'),
			true, null, null, null, true, group, true);
	}

	var fields = DataFlowDialogs.addSection(div);
	var name = DataFlowDialogs.createInput((system != null) ? system.name : '');
	DataFlowDialogs.addRow(fields, mxResources.get('name'), name);
	var owner = DataFlowDialogs.createInput((system != null) ? system.owner : '');
	DataFlowDialogs.addRow(fields, mxResources.get('dfOwner'), owner);

	var env = DataFlowDialogs.createInput((system != null) ? system.environment : '');
	var list = document.createElement('datalist');
	list.id = 'geDataFlowEnv-' + Editor.guid();
	var envs = catalog.getEnvironments();

	for (var i = 0; i < envs.length; i++)
	{
		var option = document.createElement('option');
		option.value = envs[i];
		list.appendChild(option);
	}

	env.setAttribute('list', list.id);
	DataFlowDialogs.addRow(fields, mxResources.get('dfEnvironment'), env).appendChild(list);
	var envHint = document.createElement('div');
	envHint.className = 'geDialogHint';
	envHint.style.paddingLeft = '108px';
	mxUtils.write(envHint, mxResources.get('dfEnvironmentHint'));
	fields.appendChild(envHint);

	var notes = document.createElement('textarea');
	notes.setAttribute('rows', '3');
	notes.style.resize = 'vertical';
	notes.value = (system != null) ? system.notes : '';
	DataFlowDialogs.addRow(fields, mxResources.get('dfNotes'), notes, true);

	// Fields only apply to a new system
	function update()
	{
		var useExisting = radioNew != null && !radioNew.checked;
		existing.disabled = !useExisting;
		include.disabled = !useExisting;
		name.disabled = useExisting;
		owner.disabled = useExisting;
		env.disabled = useExisting;
		notes.disabled = useExisting;
	};

	if (radioNew != null)
	{
		mxEvent.addListener(radioNew, 'change', update);
		mxEvent.addListener(radioExisting, 'change', update);
		update();
	}

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get((system != null) ? 'apply' : 'add'), function()
	{
		if (radioNew != null && !radioNew.checked)
		{
			ui.hideDialog();
			fn({id: existing.value, includeDatasets: include.checked});
		}
		else if (mxUtils.trim(name.value) == '')
		{
			return mxResources.get('dfNameRequired');
		}
		else
		{
			ui.hideDialog();
			fn({props: {name: name.value, owner: owner.value,
				environment: env.value, notes: notes.value}});
		}
	}, name);

	dlg.fields = {existing: existing, radioNew: radioNew, include: include,
		name: name, owner: owner, environment: env, notes: notes};

	return dlg;
};

/**
 * The attribute editor: one text field per attribute that can be added,
 * removed and reordered. Pasting several names (lines, commas or tabs)
 * adds them all. Returns {container, getEntries} where getEntries returns
 * the {id, name} list for DataFlowCatalog.setDatasetAttributes, or an error
 * message.
 */
DataFlowDialogs.createAttributeEditor = function(entries)
{
	var container = document.createElement('div');
	var list = document.createElement('div');
	list.className = 'geDataFlowAttrList';
	container.appendChild(list);

	function addRow(id, value, after)
	{
		var row = document.createElement('div');
		row.className = 'geDataFlowAttrRow';
		row.attributeId = id;

		var input = DataFlowDialogs.createInput(value, mxResources.get('dfAttributeName'));
		input.setAttribute('aria-label', mxResources.get('dfAttributeName'));
		row.appendChild(input);

		function button(label, title, fn)
		{
			var btn = mxUtils.button(label, fn);
			btn.className = 'geBtn geDataFlowAttrBtn';
			btn.setAttribute('title', title);
			btn.setAttribute('aria-label', title);
			row.appendChild(btn);
		};

		button('↑', mxResources.get('dfMoveUp'), function()
		{
			if (row.previousSibling != null)
			{
				list.insertBefore(row, row.previousSibling);
				input.focus();
			}
		});

		button('↓', mxResources.get('dfMoveDown'), function()
		{
			if (row.nextSibling != null)
			{
				list.insertBefore(row.nextSibling, row);
				input.focus();
			}
		});

		button('✕', mxResources.get('remove'), function()
		{
			var next = row.nextSibling || row.previousSibling;
			list.removeChild(row);

			if (next != null)
			{
				next.firstChild.focus();
			}
		});

		// Enter adds a row below
		mxEvent.addListener(input, 'keydown', function(evt)
		{
			if (evt.keyCode == 13)
			{
				mxEvent.consume(evt);
				addRow(null, '', row).firstChild.focus();
			}
		});

		// Pasting several names adds one row per name
		mxEvent.addListener(input, 'paste', function(evt)
		{
			var text = (evt.clipboardData != null) ? evt.clipboardData.getData('text/plain') : null;

			if (text != null && /[\n\r\t,]/.test(mxUtils.trim(text)))
			{
				mxEvent.consume(evt);
				var names = DataFlowDialogs.splitNames(text);

				if (names.length > 0)
				{
					var last = row;

					if (mxUtils.trim(input.value) == '')
					{
						input.value = names.shift();
					}

					for (var i = 0; i < names.length; i++)
					{
						last = addRow(null, names[i], last);
					}

					last.firstChild.focus();
				}
			}
		});

		if (after != null)
		{
			list.insertBefore(row, after.nextSibling);
		}
		else
		{
			list.appendChild(row);
		}

		return row;
	};

	for (var i = 0; i < entries.length; i++)
	{
		addRow(entries[i].id, entries[i].name);
	}

	var add = mxUtils.button(mxResources.get('dfAddAttribute'), function()
	{
		addRow(null, '').firstChild.focus();
		list.scrollTop = list.scrollHeight;
	});
	add.className = 'geBtn geDataFlowAttrAdd';
	container.appendChild(add);

	var hint = document.createElement('div');
	hint.className = 'geDialogHint';
	mxUtils.write(hint, mxResources.get('dfAttributesHint'));
	container.appendChild(hint);

	return {
		container: container,
		addRow: addRow,
		list: list,
		getEntries: function()
		{
			var result = [];
			var seen = {};

			for (var row = list.firstChild; row != null; row = row.nextSibling)
			{
				var value = mxUtils.trim(row.firstChild.value);

				if (value == '')
				{
					// Empty new rows are ignored, emptied existing rows are an error
					if (row.attributeId != null)
					{
						return mxResources.get('dfAttributeNameEmpty');
					}
				}
				else
				{
					var key = ' ' + value.toLowerCase();

					if (seen[key])
					{
						return mxResources.get('dfDuplicateAttribute', [value]);
					}

					seen[key] = true;
					result.push({id: row.attributeId, name: value});
				}
			}

			return result;
		}
	};
};

/**
 * Splits pasted text into attribute names: lines, tabs or commas, trimmed,
 * empty names dropped.
 */
DataFlowDialogs.splitNames = function(text)
{
	return text.split(/[\r\n\t,]+/).map(function(name)
	{
		return mxUtils.trim(name);
	}).filter(function(name)
	{
		return name.length > 0;
	});
};

/**
 * Dataset dialog. For a new placement (datasetId is null) it offers the
 * system's datasets that are not in the given exclude list, or a new one.
 * The callback receives {id} for an existing dataset, otherwise
 * {name, entries} with the attribute entries.
 */
DataFlowDialogs.showDatasetDialog = function(ui, catalog, systemId, datasetId, exclude, fn)
{
	var dataset = (datasetId != null) ? catalog.getDataset(datasetId) : null;
	var system = catalog.getSystem(systemId);
	var div = document.createElement('div');
	var hd = document.createElement('h3');
	mxUtils.write(hd, mxResources.get((dataset != null) ? 'dfEditDataset' : 'dfAddDataset'));
	div.appendChild(hd);

	var hint = document.createElement('p');
	hint.className = 'geDialogHint';
	hint.style.margin = '0 0 10px 0';
	mxUtils.write(hint, mxResources.get('dfInSystem', [system.name]));
	div.appendChild(hint);

	var existing = null;
	var radioNew = null;
	var datasets = [];

	if (dataset == null)
	{
		var ids = catalog.getDatasetIds(systemId);

		for (var i = 0; i < ids.length; i++)
		{
			if (exclude == null || mxUtils.indexOf(exclude, ids[i]) < 0)
			{
				datasets.push([ids[i], catalog.getDataset(ids[i]).name]);
			}
		}
	}

	if (datasets.length > 0)
	{
		var choice = DataFlowDialogs.addSection(div);
		var group = 'geDataFlowDataset-' + Editor.guid();
		var radioExisting = ui.addCheckbox(choice, mxResources.get('dfExistingDataset'),
			false, null, null, null, true, group, true);
		existing = DataFlowDialogs.createSelect(DataFlowDialogs.sortByName(datasets));
		existing.setAttribute('aria-label', mxResources.get('dfExistingDataset'));
		radioExisting.checkRow.appendChild(existing);
		radioNew = ui.addCheckbox(choice, mxResources.get('dfNewDataset'),
			true, null, null, null, true, group, true);
	}

	var fields = DataFlowDialogs.addSection(div);
	var name = DataFlowDialogs.createInput((dataset != null) ? dataset.name : '');
	DataFlowDialogs.addRow(fields, mxResources.get('name'), name);

	var entries = [];

	if (dataset != null)
	{
		for (var i = 0; i < dataset.attributes.length; i++)
		{
			entries.push({id: dataset.attributes[i],
				name: catalog.getAttribute(dataset.attributes[i]).name});
		}
	}

	var editor = DataFlowDialogs.createAttributeEditor(entries);
	var label = document.createElement('span');
	label.className = 'geDialogFormLabel';
	mxUtils.write(label, mxResources.get('dfAttributes'));
	var row = document.createElement('div');
	row.className = 'geDialogFormRow geDialogFormRowTop';
	row.appendChild(label);
	editor.container.style.flex = '1';
	editor.container.style.minWidth = '0';
	row.appendChild(editor.container);
	fields.appendChild(row);

	if (dataset == null)
	{
		editor.addRow(null, '');
	}

	function update()
	{
		var useExisting = radioNew != null && !radioNew.checked;
		existing.disabled = !useExisting;
		name.disabled = useExisting;
		fields.style.opacity = (useExisting) ? '0.5' : '';

		var inputs = fields.querySelectorAll('input, button');

		for (var i = 0; i < inputs.length; i++)
		{
			inputs[i].disabled = useExisting;
		}
	};

	if (radioNew != null)
	{
		mxEvent.addListener(radioNew, 'change', update);
		mxEvent.addListener(radioExisting, 'change', update);
		update();
	}

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get((dataset != null) ? 'apply' : 'add'), function()
	{
		if (radioNew != null && !radioNew.checked)
		{
			ui.hideDialog();
			fn({id: existing.value});
		}
		else if (mxUtils.trim(name.value) == '')
		{
			return mxResources.get('dfNameRequired');
		}
		else
		{
			var result = editor.getEntries();

			if (typeof result === 'string')
			{
				return result;
			}

			ui.hideDialog();
			fn({name: name.value, entries: result});
		}
	}, name);

	dlg.fields = {existing: existing, radioNew: radioNew, name: name, editor: editor};

	return dlg;
};

/**
 * Returns a heading paragraph and hint for an action dialog.
 */
DataFlowDialogs.createActionDialog = function(title, hint)
{
	var div = document.createElement('div');
	var hd = document.createElement('h3');
	mxUtils.write(hd, title);
	div.appendChild(hd);

	if (hint != null)
	{
		var p = document.createElement('p');
		p.className = 'geDialogHint';
		p.style.margin = '0 0 10px 0';
		mxUtils.write(p, hint);
		div.appendChild(p);
	}

	return div;
};

/**
 * A tree of a stream: one check box per dataset and per attribute. The
 * dataset box checks or clears all its attributes and shows a partial
 * selection as indeterminate. The checked function gives the initial state
 * of an attribute. Returns {container, getSelection} where getSelection
 * returns [{dataset, attributes}] for the datasets with checked boxes.
 */
DataFlowDialogs.createStreamTree = function(catalog, stream, checked)
{
	var container = document.createElement('div');
	container.className = 'geDataFlowTree';
	var groups = [];

	for (var i = 0; i < stream.length; i++)
	{
		(function(entry)
		{
			var dataset = catalog.getDataset(entry.dataset);
			var group = {dataset: entry.dataset, boxes: []};

			var row = document.createElement('label');
			row.className = 'geDataFlowTreeDataset';
			var box = document.createElement('input');
			box.setAttribute('type', 'checkbox');
			row.appendChild(box);
			var name = document.createElement('b');
			mxUtils.write(name, dataset.name);
			row.appendChild(name);
			var system = catalog.getSystem(dataset.system);
			var sys = document.createElement('span');
			sys.className = 'geDialogHint';
			mxUtils.write(sys, (system != null) ? system.name : '');
			row.appendChild(sys);
			container.appendChild(row);
			group.box = box;

			for (var j = 0; j < entry.attributes.length; j++)
			{
				var aRow = document.createElement('label');
				aRow.className = 'geDataFlowTreeAttribute';
				var aBox = document.createElement('input');
				aBox.setAttribute('type', 'checkbox');
				aBox.checked = checked(entry.dataset, entry.attributes[j]);
				aBox.attributeId = entry.attributes[j];
				aRow.appendChild(aBox);
				mxUtils.write(aRow, catalog.getAttribute(entry.attributes[j]).name);
				container.appendChild(aRow);
				group.boxes.push(aBox);
				mxEvent.addListener(aBox, 'change', update);
			}

			// A dataset without attributes is selected on its own
			if (group.boxes.length == 0)
			{
				box.checked = checked(entry.dataset, null);
			}

			function update()
			{
				if (group.boxes.length > 0)
				{
					var count = group.boxes.filter(function(b) { return b.checked; }).length;
					box.checked = count > 0;
					box.indeterminate = count > 0 && count < group.boxes.length;
				}
			};

			mxEvent.addListener(box, 'change', function()
			{
				for (var j = 0; j < group.boxes.length; j++)
				{
					group.boxes[j].checked = box.checked;
				}

				box.indeterminate = false;
			});

			update();
			groups.push(group);
		})(stream[i]);
	}

	return {
		container: container,
		groups: groups,
		getSelection: function()
		{
			var result = [];

			for (var i = 0; i < groups.length; i++)
			{
				var attrs = groups[i].boxes.filter(function(b) { return b.checked; }).
					map(function(b) { return b.attributeId; });

				if (groups[i].box.checked || attrs.length > 0)
				{
					result.push({dataset: groups[i].dataset, attributes: attrs});
				}
			}

			return result;
		}
	};
};

/**
 * Export dialog. The existing output dataset (or null) gives the initial
 * name and selection. The callback receives {name, attributes} with the
 * selected source attribute IDs in stream order.
 */
DataFlowDialogs.showExportDialog = function(ui, catalog, stream, targetName, output, fn)
{
	var div = DataFlowDialogs.createActionDialog(mxResources.get('dfConfigure_export'),
		mxResources.get('dfExportHint', [targetName]));
	var sources = [];

	if (output != null)
	{
		for (var i = 0; i < output.attributes.length; i++)
		{
			sources.push(catalog.getAttribute(output.attributes[i]).derivedFrom);
		}
	}

	var fields = DataFlowDialogs.addSection(div);
	var name = DataFlowDialogs.createInput((output != null) ? output.name :
		((stream.length == 1) ? catalog.getDataset(stream[0].dataset).name : ''));
	DataFlowDialogs.addRow(fields, mxResources.get('dfNewDatasetName'), name);

	var section = DataFlowDialogs.addSection(div);
	var tree = DataFlowDialogs.createStreamTree(catalog, stream, function(datasetId, attributeId)
	{
		return (output != null) ? mxUtils.indexOf(sources, attributeId) >= 0 : stream.length == 1;
	});
	section.appendChild(tree.container);

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get('apply'), function()
	{
		var attributes = [];
		var selection = tree.getSelection();

		for (var i = 0; i < selection.length; i++)
		{
			attributes = attributes.concat(selection[i].attributes);
		}

		if (mxUtils.trim(name.value) == '')
		{
			return mxResources.get('dfNameRequired');
		}
		else if (attributes.length == 0)
		{
			return mxResources.get('dfSelectAttributes');
		}

		ui.hideDialog();
		fn({name: name.value, attributes: attributes});
	}, name);

	dlg.fields = {name: name, tree: tree};

	return dlg;
};

/**
 * Filter dialog. Unchecking drops a dataset or attribute. The config of a
 * configured filter gives the initial state. The callback receives
 * {kept: [{dataset, attributes}]}.
 */
DataFlowDialogs.showFilterDialog = function(ui, catalog, stream, targetName, config, fn)
{
	var div = DataFlowDialogs.createActionDialog(mxResources.get('dfConfigure_filter'),
		mxResources.get('dfFilterHint', [targetName]));
	var configured = config != null && Object.keys(config.copies).length > 0;

	var section = DataFlowDialogs.addSection(div);
	var tree = DataFlowDialogs.createStreamTree(catalog, stream, function(datasetId, attributeId)
	{
		if (!configured)
		{
			return true;
		}
		else if (config.copies[datasetId] == null)
		{
			return false;
		}

		return attributeId == null || mxUtils.indexOf(config.dropped.attributes, attributeId) < 0;
	});
	section.appendChild(tree.container);

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get('apply'), function()
	{
		var kept = tree.getSelection();

		if (kept.length == 0)
		{
			return mxResources.get('dfKeepSomething');
		}

		ui.hideDialog();
		fn({kept: kept});
	});

	dlg.fields = {tree: tree};

	return dlg;
};

/**
 * Returns the ID in the list whose catalog entity has the same name
 * (ignoring case), or null.
 */
DataFlowDialogs.matchByName = function(name, ids, lookup)
{
	for (var i = 0; i < ids.length; i++)
	{
		if (lookup(ids[i]).name.toLowerCase() == name.toLowerCase())
		{
			return ids[i];
		}
	}

	return null;
};

/**
 * Adds one row per attribute of the left dataset with a select of the
 * attributes of the right dataset (and optionally a cardinality select) to
 * the given container. Returns a function that returns the selected
 * [left, right, cardinality] triples.
 */
DataFlowDialogs.addMappingRows = function(container, catalog, left, right, initial)
{
	var rows = [];
	var leftAttrs = catalog.getDataset(left).attributes;
	var rightAttrs = (right != null) ? catalog.getDataset(right).attributes : [];

	for (var i = 0; i < leftAttrs.length; i++)
	{
		var row = document.createElement('div');
		row.className = 'geDataFlowMapRow';
		var name = document.createElement('span');
		mxUtils.write(name, catalog.getAttribute(leftAttrs[i]).name);
		row.appendChild(name);

		var arrow = document.createElement('span');
		arrow.className = 'geDialogHint';
		mxUtils.write(arrow, '↔');
		row.appendChild(arrow);

		var options = [['', mxResources.get('dfNotCompared')]];

		for (var j = 0; j < rightAttrs.length; j++)
		{
			options.push([rightAttrs[j], catalog.getAttribute(rightAttrs[j]).name]);
		}

		var select = DataFlowDialogs.createSelect(options);
		select.setAttribute('aria-label', catalog.getAttribute(leftAttrs[i]).name);
		var init = initial(leftAttrs[i]);
		// A saved mapping wins (also a saved "not compared"), otherwise equal names
		select.value = (init != null && init.to != null) ?
			((mxUtils.indexOf(rightAttrs, init.to) >= 0) ? init.to : '') :
			(DataFlowDialogs.matchByName(catalog.getAttribute(leftAttrs[i]).name, rightAttrs,
			function(id) { return catalog.getAttribute(id); }) || '');
		row.appendChild(select);

		var card = null;

		if (init !== undefined && init != null && init.cardinality !== undefined)
		{
			card = DataFlowDialogs.createSelect(DataFlow.CARDINALITIES.map(function(c) { return [c, c]; }));
			card.value = init.cardinality || '1:1';
			card.setAttribute('aria-label', mxResources.get('dfCardinality'));
			row.appendChild(card);
		}

		container.appendChild(row);
		rows.push({left: leftAttrs[i], select: select, card: card});
	}

	return function()
	{
		var result = [];

		for (var i = 0; i < rows.length; i++)
		{
			if (rows[i].select.value != '')
			{
				result.push([rows[i].left, rows[i].select.value,
					(rows[i].card != null) ? rows[i].card.value : null]);
			}
		}

		return result;
	};
};

/**
 * Validation dialog: each dataset of the input can be paired with a
 * dataset of the reference system (suggested by equal names), and within a
 * pair attributes can be paired (suggested by equal names). The callback
 * receives {pairs} in the catalog format.
 */
DataFlowDialogs.showValidationDialog = function(ui, catalog, stream, reference, referenceName, config, fn)
{
	var div = DataFlowDialogs.createActionDialog(mxResources.get('dfConfigure_validation'),
		mxResources.get('dfValidationHint', [referenceName]));
	var pairs = (config != null) ? config.pairs : [];
	var groups = [];

	function existing(primary)
	{
		for (var i = 0; i < pairs.length; i++)
		{
			if (pairs[i].primary == primary)
			{
				return pairs[i];
			}
		}

		return null;
	};

	for (var i = 0; i < stream.length; i++)
	{
		(function(primary)
		{
			var section = DataFlowDialogs.addSection(div);
			var options = [['', mxResources.get('dfNotCompared')]];

			for (var j = 0; j < reference.length; j++)
			{
				options.push([reference[j], catalog.getDataset(reference[j]).name]);
			}

			var select = DataFlowDialogs.createSelect(options);
			var pair = existing(primary);
			select.value = (pair != null && mxUtils.indexOf(reference, pair.reference) >= 0) ? pair.reference :
				((pairs.length == 0) ? (DataFlowDialogs.matchByName(catalog.getDataset(primary).name, reference,
				function(id) { return catalog.getDataset(id); }) || '') : '');
			DataFlowDialogs.addRow(section, catalog.getDataset(primary).name, select);

			var mapping = document.createElement('div');
			mapping.className = 'geDataFlowMapping';
			section.appendChild(mapping);
			var group = {primary: primary, select: select, getMappings: null};

			function update()
			{
				mapping.innerHTML = '';
				group.getMappings = null;

				if (select.value != '')
				{
					var same = pair != null && pair.reference == select.value;

					group.getMappings = DataFlowDialogs.addMappingRows(mapping, catalog, primary, select.value,
						function(left)
						{
							if (same)
							{
								for (var k = 0; k < pair.attributes.length; k++)
								{
									if (pair.attributes[k][0] == left)
									{
										return {to: pair.attributes[k][1]};
									}
								}

								return {to: ''};
							}

							return null;
						});
				}
			};

			mxEvent.addListener(select, 'change', update);
			update();
			groups.push(group);
		})(stream[i].dataset);
	}

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get('apply'), function()
	{
		var result = [];

		for (var i = 0; i < groups.length; i++)
		{
			if (groups[i].select.value != '')
			{
				result.push({primary: groups[i].primary, reference: groups[i].select.value,
					attributes: groups[i].getMappings().map(function(m) { return [m[0], m[1]]; })});
			}
		}

		if (result.length == 0)
		{
			return mxResources.get('dfPairSomething');
		}

		ui.hideDialog();
		fn({pairs: result});
	});

	dlg.fields = {groups: groups};

	return dlg;
};

/**
 * Addition dialog: pick the dataset to add from the second system, then
 * relate incoming attributes to its attributes with a cardinality. The
 * callback receives {dataset, mappings: [{from, to, cardinality}]}.
 */
DataFlowDialogs.showAdditionDialog = function(ui, catalog, stream, second, secondName, config, existing, fn)
{
	var div = DataFlowDialogs.createActionDialog(mxResources.get('dfConfigure_addition'),
		mxResources.get('dfAdditionHint', [secondName]));
	var choice = DataFlowDialogs.addSection(div);
	var select = DataFlowDialogs.createSelect(second.map(function(id)
	{
		return [id, catalog.getDataset(id).name];
	}));

	if (config != null && mxUtils.indexOf(second, config.dataset) >= 0)
	{
		select.value = config.dataset;
	}

	DataFlowDialogs.addRow(choice, mxResources.get('dfDatasetToAdd'), select);

	var mapping = DataFlowDialogs.addSection(div);
	var getters = [];

	function update()
	{
		mapping.innerHTML = '';
		getters = [];
		var hint = document.createElement('div');
		hint.className = 'geDialogHint';
		mxUtils.write(hint, mxResources.get('dfRelateHint'));
		mapping.appendChild(hint);

		for (var i = 0; i < stream.length; i++)
		{
			var title = document.createElement('div');
			title.className = 'geDataFlowMapTitle';
			mxUtils.write(title, catalog.getDataset(stream[i].dataset).name);
			mapping.appendChild(title);

			getters.push(DataFlowDialogs.addMappingRows(mapping, catalog, stream[i].dataset, select.value,
				function(left)
				{
					for (var k = 0; k < existing.length; k++)
					{
						if (existing[k].from == left && existing[k].to != null &&
							catalog.getAttribute(existing[k].to) != null &&
							catalog.getAttribute(existing[k].to).dataset == select.value)
						{
							return {to: existing[k].to, cardinality: existing[k].cardinality};
						}
					}

					return {to: null, cardinality: '1:1'};
				}));
		}
	};

	mxEvent.addListener(select, 'change', update);
	update();

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get('apply'), function()
	{
		var mappings = [];

		for (var i = 0; i < getters.length; i++)
		{
			mappings = mappings.concat(getters[i]().map(function(m)
			{
				return {from: m[0], to: m[1], cardinality: m[2]};
			}));
		}

		ui.hideDialog();
		fn({dataset: select.value, mappings: mappings});
	}, select);

	dlg.fields = {select: select};

	return dlg;
};

/**
 * Cardinality picker for a relationship between two attributes (§7.3).
 * The current cardinality (or null for a new relationship) is preselected.
 * The callback receives the chosen cardinality.
 */
DataFlowDialogs.showCardinalityDialog = function(ui, catalog, from, to, current, fn)
{
	function describe(id)
	{
		var attribute = catalog.getAttribute(id);

		return catalog.getDataset(attribute.dataset).name + '.' + attribute.name;
	};

	var div = DataFlowDialogs.createActionDialog(mxResources.get((current != null) ?
		'dfChangeCardinality' : 'dfAddRelationship'),
		mxResources.get('dfRelationshipHint', [describe(from), describe(to)]));
	var section = DataFlowDialogs.addSection(div);
	var keys = {'1:1': 'dfCard11', '1:M': 'dfCard1M', 'M:1': 'dfCardM1', 'M:M': 'dfCardMM'};
	var select = DataFlowDialogs.createSelect(DataFlow.CARDINALITIES.map(function(c)
	{
		return [c, mxResources.get(keys[c])];
	}));
	select.value = (current != null) ? current : '1:M';
	DataFlowDialogs.addRow(section, mxResources.get('dfCardinality'), select);

	var dlg = DataFlowDialogs.show(ui, div, mxResources.get((current != null) ? 'apply' : 'add'), function()
	{
		ui.hideDialog();
		fn(select.value);
	}, select);

	dlg.fields = {select: select};

	return dlg;
};
