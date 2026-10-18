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
