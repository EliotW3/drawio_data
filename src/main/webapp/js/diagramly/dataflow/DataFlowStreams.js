/**
 * Copyright (c) 2026, drawio_data contributors
 *
 * Streams and connection rules of the data flow diagrams (docs/DATAFLOW.md
 * §6). A stream is what flows along a connection: a list of
 * {dataset, attributes} entries. Nodes are system shapes and action shapes;
 * flow edges between them have a role (primary, secondary or output) in
 * their value (dfRole).
 */
var DataFlowStreams = {};

/**
 * Edge roles.
 */
DataFlowStreams.PRIMARY = 'primary';
DataFlowStreams.SECONDARY = 'secondary';
DataFlowStreams.OUTPUT = 'output';

/**
 * Returns true if the given cell is a system or action shape.
 */
DataFlowStreams.isNode = function(cell)
{
	var type = DataFlowView.getType(cell);

	return type == DataFlowView.SYSTEM || type == DataFlowView.ACTION;
};

/**
 * Returns the action type of an action shape, or null.
 */
DataFlowStreams.getActionType = function(cell)
{
	return (DataFlowView.getType(cell) == DataFlowView.ACTION) ?
		cell.value.getAttribute('dfAction') : null;
};

/**
 * Returns true for Export and Filter, whose output is a system.
 */
DataFlowStreams.isSystemOutput = function(type)
{
	return type == DataFlow.ACTION_EXPORT || type == DataFlow.ACTION_FILTER;
};

/**
 * Returns true for Validation and Addition, which take a second input.
 */
DataFlowStreams.hasSecondInput = function(type)
{
	return type == DataFlow.ACTION_VALIDATION || type == DataFlow.ACTION_ADDITION;
};

/**
 * Returns the role of a flow edge, or null.
 */
DataFlowStreams.getRole = function(edge)
{
	return (DataFlowView.getType(edge) == DataFlowView.FLOW) ?
		edge.value.getAttribute('dfRole') : null;
};

/**
 * Returns the incoming flow edges of the given node with the given role,
 * ignoring the given edge.
 */
DataFlowStreams.getIncoming = function(graph, cell, role, ignore)
{
	return graph.model.getIncomingEdges(cell).filter(function(edge)
	{
		return edge != ignore && DataFlowStreams.getRole(edge) == role &&
			DataFlowStreams.isNode(graph.model.getTerminal(edge, true));
	});
};

/**
 * Returns the outgoing flow edges of the given node, ignoring the given edge.
 */
DataFlowStreams.getOutgoing = function(graph, cell, ignore)
{
	return graph.model.getOutgoingEdges(cell).filter(function(edge)
	{
		var role = DataFlowStreams.getRole(edge);

		return edge != ignore && role != null && role != 'invalid' &&
			DataFlowStreams.isNode(graph.model.getTerminal(edge, false));
	});
};

/**
 * Returns the source node of the action's input with the given role, or null.
 */
DataFlowStreams.getInputNode = function(graph, action, role)
{
	var edges = DataFlowStreams.getIncoming(graph, action, role);

	return (edges.length > 0) ? graph.model.getTerminal(edges[0], true) : null;
};

/**
 * Returns the system shape an Export or Filter leads to, or null.
 */
DataFlowStreams.getOutputSystem = function(graph, action)
{
	var edges = DataFlowStreams.getOutgoing(graph, action);

	for (var i = 0; i < edges.length; i++)
	{
		var target = graph.model.getTerminal(edges[i], false);

		if (DataFlowView.getType(target) == DataFlowView.SYSTEM)
		{
			return target;
		}
	}

	return null;
};

/**
 * Returns true if the target action reaches the source action by following
 * action-to-action edges, so that an edge from source to target would close
 * a loop. Systems end a chain, so loops can only run through actions.
 */
DataFlowStreams.reaches = function(graph, from, to)
{
	var seen = [];
	var stack = [from];

	while (stack.length > 0)
	{
		var cell = stack.pop();

		if (cell == to)
		{
			return true;
		}

		if (mxUtils.indexOf(seen, cell) < 0)
		{
			seen.push(cell);
			var edges = DataFlowStreams.getOutgoing(graph, cell);

			for (var i = 0; i < edges.length; i++)
			{
				var target = graph.model.getTerminal(edges[i], false);

				if (DataFlowView.getType(target) == DataFlowView.ACTION)
				{
					stack.push(target);
				}
			}
		}
	}

	return false;
};

/**
 * Returns the role an edge from source to target gets, or an error message
 * (as {error}) if the connection breaks the rules of §6.2. The given edge
 * is ignored when checking free ports (for reconnecting it). Secondary is
 * preferred for Validation and Addition if requested (dropped on the
 * bottom port) or if the primary input is taken. Returns null if the
 * connection is not between data flow nodes.
 */
DataFlowStreams.getConnection = function(graph, edge, source, target, preferSecondary)
{
	var sType = DataFlowView.getType(source);
	var tType = DataFlowView.getType(target);

	if (sType == DataFlowView.DATASET || sType == DataFlowView.ATTRIBUTE ||
		tType == DataFlowView.DATASET || tType == DataFlowView.ATTRIBUTE)
	{
		return {error: mxResources.get('dfConnectToSystem')};
	}

	if (!DataFlowStreams.isNode(source) || !DataFlowStreams.isNode(target))
	{
		return null;
	}

	if (source == target)
	{
		return {error: mxResources.get('dfConnectLoop')};
	}

	var sAction = DataFlowStreams.getActionType(source);
	var tAction = DataFlowStreams.getActionType(target);

	// Into a system: only from Export or Filter, exactly one output
	if (tType == DataFlowView.SYSTEM)
	{
		if (sType == DataFlowView.SYSTEM)
		{
			return {error: mxResources.get('dfConnectSystems')};
		}
		else if (!DataFlowStreams.isSystemOutput(sAction))
		{
			return {error: mxResources.get('dfConnectNoSystemOutput')};
		}
		else if (DataFlowStreams.getOutgoing(graph, source, edge).length > 0)
		{
			return {error: mxResources.get('dfConnectOneOutput')};
		}

		return {role: DataFlowStreams.OUTPUT};
	}

	// Into an action
	if (sType == DataFlowView.ACTION)
	{
		if (DataFlowStreams.isSystemOutput(sAction))
		{
			return {error: mxResources.get('dfConnectSystemOutput')};
		}
		else if (DataFlowStreams.reaches(graph, target, source))
		{
			return {error: mxResources.get('dfConnectLoop')};
		}
	}

	var primaryFree = DataFlowStreams.getIncoming(graph, target, DataFlowStreams.PRIMARY, edge).length == 0;
	var secondaryFree = DataFlowStreams.hasSecondInput(tAction) && sType == DataFlowView.SYSTEM &&
		DataFlowStreams.getIncoming(graph, target, DataFlowStreams.SECONDARY, edge).length == 0;

	if (secondaryFree && (preferSecondary || !primaryFree))
	{
		return {role: DataFlowStreams.SECONDARY};
	}
	else if (primaryFree)
	{
		return {role: DataFlowStreams.PRIMARY};
	}

	return {error: mxResources.get(DataFlowStreams.hasSecondInput(tAction) ?
		'dfConnectInputsTaken' : 'dfConnectInputTaken')};
};

/**
 * Returns the stream of all datasets shown in a system shape.
 */
DataFlowStreams.getSystemStream = function(graph, catalog, systemCell)
{
	var result = [];
	var ids = DataFlowView.getDatasetIds(graph, systemCell);

	for (var i = 0; i < ids.length; i++)
	{
		var dataset = catalog.getDataset(ids[i]);

		if (dataset != null)
		{
			result.push({dataset: ids[i], attributes: dataset.attributes.slice()});
		}
	}

	return result;
};

/**
 * Returns the stream a node passes on along an action-to-action edge
 * (§6.1): a system shape passes its datasets, Validation its primary input,
 * Addition its primary input plus the added dataset. Export and Filter pass
 * nothing on directly, their output continues from the target system.
 */
DataFlowStreams.getNodeStream = function(graph, catalog, cell, visited)
{
	if (DataFlowView.getType(cell) == DataFlowView.SYSTEM)
	{
		return DataFlowStreams.getSystemStream(graph, catalog, cell);
	}

	visited = visited || [];

	if (mxUtils.indexOf(visited, cell) >= 0)
	{
		return [];
	}

	visited.push(cell);
	var type = DataFlowStreams.getActionType(cell);
	var input = DataFlowStreams.getInputStream(graph, catalog, cell, visited);

	if (type == DataFlow.ACTION_VALIDATION)
	{
		return input || [];
	}
	else if (type == DataFlow.ACTION_ADDITION)
	{
		var result = (input || []).slice();
		var action = catalog.getAction(DataFlowView.getId(cell));
		var added = (action != null) ? catalog.getDataset(action.config.dataset) : null;

		if (added != null && !DataFlowStreams.containsDataset(result, action.config.dataset))
		{
			result.push({dataset: action.config.dataset, attributes: added.attributes.slice()});
		}

		return result;
	}

	return [];
};

/**
 * Returns the primary input stream of an action, or null if unconnected.
 */
DataFlowStreams.getInputStream = function(graph, catalog, action, visited)
{
	var source = DataFlowStreams.getInputNode(graph, action, DataFlowStreams.PRIMARY);

	return (source != null) ? DataFlowStreams.getNodeStream(graph, catalog, source, visited) : null;
};

/**
 * Returns the dataset IDs of the system shape at the action's second input,
 * or null if unconnected.
 */
DataFlowStreams.getSecondDatasets = function(graph, action)
{
	var source = DataFlowStreams.getInputNode(graph, action, DataFlowStreams.SECONDARY);

	return (source != null) ? DataFlowView.getDatasetIds(graph, source) : null;
};

/**
 * Returns true if the stream contains the given dataset.
 */
DataFlowStreams.containsDataset = function(stream, datasetId)
{
	for (var i = 0; stream != null && i < stream.length; i++)
	{
		if (stream[i].dataset == datasetId)
		{
			return true;
		}
	}

	return false;
};

/**
 * Returns true if the stream contains the given attribute.
 */
DataFlowStreams.containsAttribute = function(stream, attributeId)
{
	for (var i = 0; stream != null && i < stream.length; i++)
	{
		if (mxUtils.indexOf(stream[i].attributes, attributeId) >= 0)
		{
			return true;
		}
	}

	return false;
};

/**
 * Returns the connections an action still lacks, as resource keys.
 */
DataFlowStreams.getMissingConnections = function(graph, action)
{
	var type = DataFlowStreams.getActionType(action);
	var missing = [];

	if (DataFlowStreams.getInputNode(graph, action, DataFlowStreams.PRIMARY) == null)
	{
		missing.push('dfMissingInput');
	}

	if (DataFlowStreams.hasSecondInput(type) &&
		DataFlowStreams.getInputNode(graph, action, DataFlowStreams.SECONDARY) == null)
	{
		missing.push((type == DataFlow.ACTION_VALIDATION) ? 'dfMissingReference' : 'dfMissingSecond');
	}

	if (DataFlowStreams.isSystemOutput(type) && DataFlowStreams.getOutputSystem(graph, action) == null)
	{
		missing.push('dfMissingOutput');
	}

	return missing;
};

/**
 * Returns true if the action's dialog has been completed.
 */
DataFlowStreams.isConfigured = function(catalog, actionId)
{
	var action = catalog.getAction(actionId);

	if (action == null)
	{
		return false;
	}

	var config = action.config;

	if (action.type == DataFlow.ACTION_EXPORT || action.type == DataFlow.ACTION_ADDITION)
	{
		return config.dataset != null;
	}
	else if (action.type == DataFlow.ACTION_FILTER)
	{
		return Object.keys(config.copies).length > 0;
	}

	return config.pairs.length > 0;
};

/**
 * Returns the state of an action shape: {setup, problems}. Setup is true
 * while connections are missing or the dialog was not completed; problems
 * lists (as text) what no longer matches the inputs (§6.3).
 */
DataFlowStreams.getActionState = function(graph, catalog, cell)
{
	var id = DataFlowView.getId(cell);
	var action = catalog.getAction(id);
	var missing = DataFlowStreams.getMissingConnections(graph, cell);
	var problems = [];

	if (action == null)
	{
		return {setup: true, missing: missing, problems: problems};
	}

	var configured = DataFlowStreams.isConfigured(catalog, id);

	for (var i = 0; i < action.attention.length; i++)
	{
		var key = {datasetRemoved: 'dfProblemDatasetRemoved', attributeRemoved: 'dfProblemAttributeRemoved',
			relationshipRemoved: 'dfProblemRelationshipRemoved'}[action.attention[i].code];
		var text = mxResources.get(key || 'dfProblemChanged');

		if (mxUtils.indexOf(problems, text) < 0)
		{
			problems.push(text);
		}
	}

	if (configured && missing.length == 0)
	{
		var input = DataFlowStreams.getInputStream(graph, catalog, cell);
		var config = action.config;

		function name(id, kind)
		{
			var entity = (kind == 'dataset') ? catalog.getDataset(id) : catalog.getAttribute(id);

			return (entity != null) ? entity.name : '?';
		};

		if (action.type == DataFlow.ACTION_EXPORT)
		{
			var out = catalog.getDataset(config.dataset);
			var system = DataFlowStreams.getOutputSystem(graph, cell);

			if (out.system != DataFlowView.getId(system))
			{
				problems.push(mxResources.get('dfProblemOtherSystem', [out.name]));
			}

			for (var i = 0; i < out.attributes.length; i++)
			{
				var src = catalog.getAttribute(out.attributes[i]).derivedFrom;

				if (src != null && !DataFlowStreams.containsAttribute(input, src))
				{
					problems.push(mxResources.get('dfProblemNotInInput', [name(src, 'attribute')]));
				}
			}
		}
		else if (action.type == DataFlow.ACTION_FILTER)
		{
			var system = DataFlowView.getId(DataFlowStreams.getOutputSystem(graph, cell));

			for (var src in config.copies)
			{
				if (!DataFlowStreams.containsDataset(input, src))
				{
					problems.push(mxResources.get('dfProblemNotInInput', [name(src, 'dataset')]));
				}

				var copy = catalog.getDataset(config.copies[src]);

				if (copy != null && copy.system != system)
				{
					problems.push(mxResources.get('dfProblemOtherSystem', [copy.name]));
				}
			}
		}
		else if (action.type == DataFlow.ACTION_VALIDATION)
		{
			var reference = DataFlowStreams.getSecondDatasets(graph, cell);

			for (var i = 0; i < config.pairs.length; i++)
			{
				if (!DataFlowStreams.containsDataset(input, config.pairs[i].primary))
				{
					problems.push(mxResources.get('dfProblemNotInInput', [name(config.pairs[i].primary, 'dataset')]));
				}

				if (mxUtils.indexOf(reference, config.pairs[i].reference) < 0)
				{
					problems.push(mxResources.get('dfProblemNotInSecond', [name(config.pairs[i].reference, 'dataset')]));
				}
			}
		}
		else if (action.type == DataFlow.ACTION_ADDITION)
		{
			if (mxUtils.indexOf(DataFlowStreams.getSecondDatasets(graph, cell), config.dataset) < 0)
			{
				problems.push(mxResources.get('dfProblemNotInSecond', [name(config.dataset, 'dataset')]));
			}

			var rels = catalog.getRelationshipIds(null, id);

			for (var i = 0; i < rels.length; i++)
			{
				var from = catalog.getRelationship(rels[i]).from;

				if (!DataFlowStreams.containsAttribute(input, from))
				{
					problems.push(mxResources.get('dfProblemNotInInput', [name(from, 'attribute')]));
				}
			}
		}
	}

	return {setup: missing.length > 0 || !configured, missing: missing, problems: problems};
};
