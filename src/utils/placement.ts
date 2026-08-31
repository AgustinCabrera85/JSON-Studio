import type { JsonPath, JsonValue } from '../types/json'
import type { ToolboxDropPayload } from '../types/toolbox'
import { getAtPath } from './json'

const singularize = (value: string) => {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, 'y')
  if (/sses$/i.test(value)) return value.replace(/es$/i, '')
  if (/ses$/i.test(value)) return value.replace(/es$/i, '')
  if (/s$/i.test(value) && !/ss$/i.test(value)) return value.slice(0, -1)
  return value
}

const normalize = (value: string) => singularize(value)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')

const pathName = (path: JsonPath) => {
  const stringSegment = [...path].reverse().find(segment => typeof segment === 'string')
  return typeof stringSegment === 'string' ? normalize(stringSegment) : ''
}

const payloadNames = (payload: ToolboxDropPayload) => {
  const names = [payload.name, ...(payload.contexts ?? [])]
    .map(normalize)
    .filter(Boolean)
  return [...new Set(names)]
}

export const targetSemanticallyMatchesPayload = (path: JsonPath, payload: ToolboxDropPayload) => {
  const target = pathName(path)
  if (!target) return false
  return payloadNames(payload).some(name => target === name || target.includes(name) || name.includes(target))
}

const isPrefix = (prefix: JsonPath, path: JsonPath) =>
  prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])

interface ContainerCandidate {
  path: JsonPath
  value: JsonValue
}

const collectContainers = (root: JsonValue) => {
  const result: ContainerCandidate[] = []

  const visit = (value: JsonValue, path: JsonPath) => {
    if (Array.isArray(value)) {
      result.push({ path, value })
      value.forEach((child, index) => visit(child, [...path, index]))
      return
    }
    if (value !== null && typeof value === 'object') {
      result.push({ path, value })
      Object.entries(value).forEach(([key, child]) => visit(child, [...path, key]))
    }
  }

  visit(root, [])
  return result
}

/**
 * Finds the destination that most likely represents the dragged component.
 * This lets the + button behave like "add where it belongs" instead of
 * blindly inserting into the currently selected object.
 */
export const findSmartTargetPath = (
  root: JsonValue,
  selectedPath: JsonPath,
  payload: ToolboxDropPayload,
): JsonPath => {
  const candidates = collectContainers(root)
  if (candidates.length === 0) return []

  const scored = candidates.map(candidate => {
    const isArray = Array.isArray(candidate.value)
    const exactSelected = candidate.path.length === selectedPath.length && isPrefix(candidate.path, selectedPath)
    let score = isArray ? 12 : 4

    if (candidate.path.length === 0) score += 4
    if (exactSelected) score += 55
    if (selectedPath.length > 0 && isPrefix(selectedPath, candidate.path)) score += 34
    if (selectedPath.length > 0 && isPrefix(candidate.path, selectedPath)) score += 20

    if (targetSemanticallyMatchesPayload(candidate.path, payload)) {
      score += 105
      if (isArray) score += 20
    }

    if (candidate.path.length === 0 && isArray && payload.kind === 'structure') score += 42

    try {
      const selected = getAtPath(root, selectedPath)
      if (payload.kind === 'primitive' && candidate.value === selected) score += 45
    } catch {
      // Selection may have become stale; ignore it.
    }

    return { ...candidate, score }
  })

  scored.sort((a, b) => b.score - a.score || b.path.length - a.path.length)
  return scored[0]?.path ?? []
}
