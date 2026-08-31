import type { JsonValue } from '../types/json'

/**
 * Builds an empty-but-compatible document from a sample.
 * Objects keep their keys, arrays become empty collections and primitive
 * values are replaced by neutral defaults. This preserves the composition
 * topology without copying sample data into the new document.
 */
export const createCompositionShell = (value: JsonValue, depth = 0): JsonValue => {
  if (depth > 24) return null

  if (Array.isArray(value)) return []

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, createCompositionShell(child, depth + 1)]),
    )
  }

  if (typeof value === 'string') return ''
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return false
  return null
}
