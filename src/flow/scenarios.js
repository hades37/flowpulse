export function availableArrows(elements) {
  return elements.filter((e) => e.type === 'arrow' && !e.isDeleted && (e.startBinding || e.start) && (e.endBinding || e.end))
}

export function makeDefaultSteps(elements) {
  return availableArrows(elements).map((edge) => ({ edgeId: edge.id, description: '' }))
}

export function resolveSteps(steps, elements) {
  const byId = new Map(availableArrows(elements).map((edge) => [edge.id, edge]))
  const missing = steps.filter((step) => !byId.has(step.edgeId))
  return { missing, steps: steps.filter((step) => byId.has(step.edgeId)).map((step) => ({ ...step, edge: byId.get(step.edgeId) })) }
}

export function normalizeFlows(value) {
  if (!Array.isArray(value)) return []
  return value.filter((flow) => flow && typeof flow.id === 'string' && Array.isArray(flow.steps)).map((flow) => ({
    id: flow.id,
    name: typeof flow.name === 'string' ? flow.name : '未命名流程',
    steps: flow.steps.filter((step) => step && typeof step.edgeId === 'string').map((step) => ({ edgeId: step.edgeId, description: typeof step.description === 'string' ? step.description : '' })),
  }))
}
