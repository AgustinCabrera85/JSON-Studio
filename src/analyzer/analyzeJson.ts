import type { JsonObject, JsonPath, JsonType, JsonValue } from '../types/json'
import { cloneJson, detectType } from '../utils/json'
import type {
  DiscoveredStructure,
  FieldAnalysis,
  FieldFrequency,
  JsonAnalysisResult,
  ObjectOccurrence,
  UuidLocation,
  UuidReference,
} from './types'

const UUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}?$/i
const LABEL_KEYS = ['name', 'title', 'label', 'display_name', 'displayName', 'description']

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, char => char.toUpperCase())

const singularize = (value: string) => {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, 'y')
  if (/sses$/i.test(value)) return value.replace(/es$/i, '')
  if (/ses$/i.test(value)) return value.replace(/es$/i, '')
  if (/s$/i.test(value) && !/ss$/i.test(value)) return value.slice(0, -1)
  return value
}

const contextForPath = (path: JsonPath) => {
  if (path.length === 0) return 'Root'
  const last = path[path.length - 1]
  if (typeof last === 'string') return humanize(singularize(last)) || 'Object'
  const previous = [...path].reverse().find(segment => typeof segment === 'string')
  return previous ? humanize(singularize(String(previous))) : 'Item'
}

const pathLabel = (path: JsonPath) => path.length === 0
  ? '$'
  : `$${path.map(segment => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('')}`

const collectOccurrences = (root: JsonValue) => {
  const objects: ObjectOccurrence[] = []
  let arrayCount = 0
  let primitiveCount = 0
  let maxDepth = 0

  const visit = (value: JsonValue, path: JsonPath, depth: number) => {
    maxDepth = Math.max(maxDepth, depth)
    if (Array.isArray(value)) {
      arrayCount += 1
      value.forEach((child, index) => visit(child, [...path, index], depth + 1))
      return
    }
    if (value !== null && typeof value === 'object') {
      const object = value as JsonObject
      if (Object.keys(object).length > 0) {
        objects.push({ path, value: object, context: contextForPath(path), depth })
      }
      Object.entries(object).forEach(([key, child]) => visit(child, [...path, key], depth + 1))
      return
    }
    primitiveCount += 1
  }

  visit(root, [], 0)
  return { objects, arrayCount, primitiveCount, maxDepth }
}

const objectTypes = (object: JsonObject) => new Map(Object.entries(object).map(([key, value]) => [key, detectType(value)]))

const structuralSimilarity = (a: ObjectOccurrence, b: ObjectOccurrence) => {
  const aTypes = objectTypes(a.value)
  const bTypes = objectTypes(b.value)
  const aKeys = new Set(aTypes.keys())
  const bKeys = new Set(bTypes.keys())
  const shared = [...aKeys].filter(key => bKeys.has(key))
  const union = new Set([...aKeys, ...bKeys])

  if (shared.length === 0) return 0
  if (shared.length === 1 && union.size > 3 && a.context !== b.context) return 0

  const jaccard = shared.length / union.size
  const typeAgreement = shared.reduce((score, key) => score + (aTypes.get(key) === bTypes.get(key) ? 1 : 0), 0) / shared.length
  const contextBoost = a.context === b.context ? 0.18 : 0
  return Math.min(1, jaccard * 0.68 + typeAgreement * 0.32 + contextBoost)
}

const clusterObjects = (objects: ObjectOccurrence[]) => {
  const clusters: ObjectOccurrence[][] = []
  const sorted = [...objects].sort((a, b) => Object.keys(b.value).length - Object.keys(a.value).length)

  for (const occurrence of sorted) {
    let bestIndex = -1
    let bestScore = 0

    clusters.forEach((cluster, index) => {
      const sample = cluster.slice(0, 5)
      const score = sample.reduce((sum, member) => sum + structuralSimilarity(occurrence, member), 0) / sample.length
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    const sameContextThreshold = bestIndex >= 0 && clusters[bestIndex].some(member => member.context === occurrence.context) ? 0.55 : 0.76
    if (bestIndex >= 0 && bestScore >= sameContextThreshold) clusters[bestIndex].push(occurrence)
    else clusters.push([occurrence])
  }

  return clusters
}

const frequencyFor = (presence: number): FieldFrequency => {
  if (presence >= 0.999) return 'required'
  if (presence >= 0.6) return 'common'
  if (presence >= 0.2) return 'optional'
  return 'rare'
}

const primitiveKey = (value: JsonValue) => {
  if (value !== null && typeof value === 'object') return null
  return `${typeof value}:${JSON.stringify(value)}`
}

const analyzeFields = (cluster: ObjectOccurrence[]): FieldAnalysis[] => {
  const fieldNames = new Set(cluster.flatMap(item => Object.keys(item.value)))

  return [...fieldNames].sort().map(name => {
    const values = cluster.flatMap(item => Object.prototype.hasOwnProperty.call(item.value, name) ? [item.value[name]] : [])
    const presence = values.length / cluster.length
    const counts = new Map<JsonType, number>()
    values.forEach(value => counts.set(detectType(value), (counts.get(detectType(value)) ?? 0) + 1))
    const types = [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
    const dominantType = types[0]?.type ?? 'null'

    const distinctPrimitives = new Map<string, JsonValue>()
    values.forEach(value => {
      const key = primitiveKey(value)
      if (key !== null) distinctPrimitives.set(key, cloneJson(value))
    })
    const primitiveValues = [...distinctPrimitives.values()]
    const allPrimitive = primitiveValues.length > 0 && values.every(value => value === null || typeof value !== 'object')
    const hasEnoughSamples = cluster.length >= 2
    const constantValue = hasEnoughSamples && allPrimitive && primitiveValues.length === 1 ? primitiveValues[0] : undefined
    const enumValues = hasEnoughSamples && allPrimitive && primitiveValues.length >= 2 && primitiveValues.length <= 6 ? primitiveValues : undefined
    const uuidCount = values.filter(value => typeof value === 'string' && UUID_RE.test(value)).length

    return {
      name,
      presence,
      frequency: frequencyFor(presence),
      types,
      dominantType,
      examples: values.slice(0, 4).map(cloneJson),
      constantValue,
      enumValues,
      uuidLike: values.length > 0 && uuidCount / values.length >= 0.5,
    }
  })
}

const defaultForType = (type: JsonType, values: JsonValue[], mode: 'minimal' | 'recommended', depth = 0): JsonValue => {
  if (depth > 3) return type === 'array' ? [] : type === 'object' ? {} : type === 'string' ? '' : type === 'number' ? 0 : type === 'boolean' ? false : null
  if (type === 'string') return ''
  if (type === 'number') return 0
  if (type === 'boolean') return false
  if (type === 'null') return null
  if (type === 'array') return []

  const objects = values.filter(value => value !== null && typeof value === 'object' && !Array.isArray(value)) as JsonObject[]
  if (objects.length === 0) return {}
  return synthesizeObject(objects, mode, depth + 1)
}

const synthesizeObject = (objects: JsonObject[], mode: 'minimal' | 'recommended', depth = 0): JsonObject => {
  const result: JsonObject = {}
  const fields = analyzeFields(objects.map((value, index) => ({ value, path: [index], context: 'Nested', depth })))
  fields.forEach(field => {
    const include = field.frequency === 'required' || (mode === 'recommended' && field.frequency === 'common')
    if (!include) return
    const fieldValues = objects.flatMap(object => Object.prototype.hasOwnProperty.call(object, field.name) ? [object[field.name]] : [])
    result[field.name] = field.constantValue !== undefined
      ? cloneJson(field.constantValue)
      : defaultForType(field.dominantType, fieldValues, mode, depth)
  })
  return result
}

const chooseClusterName = (cluster: ObjectOccurrence[], fields: FieldAnalysis[], index: number) => {
  const contextCounts = new Map<string, number>()
  cluster.forEach(item => contextCounts.set(item.context, (contextCounts.get(item.context) ?? 0) + 1))
  const context = [...contextCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (context === 'Root') return 'Root Object'
  if (context && !['Object', 'Item'].includes(context)) return context

  // Root array items often don't have a useful path context. Try common semantic
  // discriminator fields before falling back to "Root Object".
  for (const key of ['type', 'category', 'kind', 'objectType', 'object_type', 'toolBoxType', 'toolboxType', 'moduleType']) {
    const field = fields.find(candidate => candidate.name === key)
    if (field?.constantValue && typeof field.constantValue === 'string') {
      const label = humanize(field.constantValue)
      return key === 'type' && !label.toLowerCase().includes('object') ? `${label} Object` : label
    }

    const values = cluster.flatMap(item => Object.prototype.hasOwnProperty.call(item.value, key) ? [item.value[key]] : [])
    const labels = values.flatMap(value => {
      if (typeof value === 'string' && value.trim()) return [value.trim()]
      if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' && value[0].trim()) return [value[0].trim()]
      return []
    })
    if (labels.length === cluster.length && new Set(labels.map(label => label.toLowerCase())).size === 1) {
      return humanize(labels[0])
    }
  }

  const nameField = fields.find(field => field.name === 'name' && field.constantValue && typeof field.constantValue === 'string')
  if (nameField) return humanize(String(nameField.constantValue))

  return index === 0 ? 'Root Object' : `Object ${index + 1}`
}

const createStructures = (objects: ObjectOccurrence[]): DiscoveredStructure[] => clusterObjects(objects)
  .map((cluster, index) => {
    const fields = analyzeFields(cluster)
    const name = chooseClusterName(cluster, fields, index)
    const minimalValue = synthesizeObject(cluster.map(item => item.value), 'minimal')
    const recommendedValue = synthesizeObject(cluster.map(item => item.value), 'recommended')
    const similarities = cluster.length <= 1
      ? [1]
      : cluster.slice(1).map(item => structuralSimilarity(cluster[0], item))
    const confidence = similarities.reduce((sum, score) => sum + score, 0) / similarities.length

    return {
      id: `structure-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      instances: cluster.length,
      confidence,
      contexts: [...new Set(cluster.map(item => item.context))],
      paths: cluster.map(item => item.path),
      parentStructures: [],
      fields,
      minimalValue,
      recommendedValue,
    }
  })
  .sort((a, b) => b.instances - a.instances || b.fields.length - a.fields.length)


const pathIsStrictPrefix = (parent: JsonPath, child: JsonPath) =>
  parent.length < child.length && parent.every((segment, index) => segment === child[index])

const inferStructureParents = (structures: DiscoveredStructure[]): DiscoveredStructure[] => structures.map(child => {
  const parentCounts = new Map<string, number>()

  child.paths.forEach(childPath => {
    let bestParent: { name: string; depth: number } | undefined

    structures.forEach(candidate => {
      if (candidate.id === child.id || candidate.contexts.includes('Root') || candidate.name === 'Root Object') return
      candidate.paths.forEach(parentPath => {
        if (!pathIsStrictPrefix(parentPath, childPath)) return
        if (!bestParent || parentPath.length > bestParent.depth) bestParent = { name: candidate.name, depth: parentPath.length }
      })
    })

    if (bestParent) parentCounts.set(bestParent.name, (parentCounts.get(bestParent.name) ?? 0) + 1)
  })

  return {
    ...child,
    parentStructures: [...parentCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name),
  }
})

const getParentObject = (root: JsonValue, path: JsonPath): JsonObject | null => {
  if (path.length === 0) return null
  let current: JsonValue = root
  let nearest: JsonObject | null = null
  for (const segment of path.slice(0, -1)) {
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) nearest = current as JsonObject
    if (Array.isArray(current) && typeof segment === 'number') current = current[segment]
    else if (current !== null && typeof current === 'object' && !Array.isArray(current) && typeof segment === 'string') current = current[segment]
    else return nearest
  }
  return current !== null && typeof current === 'object' && !Array.isArray(current) ? current as JsonObject : nearest
}

const aliasForObject = (object: JsonObject | null, fallback: string) => {
  if (object) {
    for (const key of LABEL_KEYS) {
      const value = object[key]
      if (typeof value === 'string' && value.trim()) return value.length > 72 ? `${value.slice(0, 69)}…` : value
    }
  }
  return fallback
}

const definitionScore = (key: string, object: JsonObject | null) => {
  const normalized = key.toLowerCase()
  let score = 0
  if (['id', 'uuid', 'guid'].includes(normalized)) score += 5
  if (normalized.endsWith('_uuid') || normalized.endsWith('_guid')) score += 3
  if (normalized.endsWith('_id')) score += 1
  if (object && LABEL_KEYS.some(label => typeof object[label] === 'string' && String(object[label]).trim())) score += 2
  return score
}

const resolveUuidReferences = (root: JsonValue): UuidReference[] => {
  const index = new Map<string, UuidLocation[]>()

  const visit = (value: JsonValue, path: JsonPath) => {
    if (Array.isArray(value)) {
      value.forEach((child, indexValue) => visit(child, [...path, indexValue]))
      return
    }
    if (value !== null && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => visit(child, [...path, key]))
      return
    }
    if (typeof value !== 'string' || !UUID_RE.test(value)) return

    const normalizedUuid = value.replace(/[{}]/g, '').toLowerCase()
    const keySegment = [...path].reverse().find(segment => typeof segment === 'string')
    const key = String(keySegment ?? 'value')
    const object = getParentObject(root, path)
    const location: UuidLocation = {
      path,
      key,
      alias: aliasForObject(object, humanize(key)),
      score: definitionScore(key, object),
    }
    index.set(normalizedUuid, [...(index.get(normalizedUuid) ?? []), location])
  }

  visit(root, [])

  return [...index.entries()].map(([uuid, locations]) => {
    const ordered = [...locations].sort((a, b) => b.score - a.score)
    const target = ordered[0]?.score >= 5 ? ordered[0] : undefined
    const references = target ? locations.filter(location => location !== target) : locations
    return {
      uuid,
      alias: target?.alias || references[0]?.alias || uuid,
      target,
      references,
      unresolved: !target,
    }
  }).sort((a, b) => (b.references.length - a.references.length) || a.alias.localeCompare(b.alias))
}

export const analyzeJson = (root: JsonValue): JsonAnalysisResult => {
  const scan = collectOccurrences(root)
  const structures = inferStructureParents(createStructures(scan.objects))
  return {
    structures,
    uuidReferences: resolveUuidReferences(root),
    objectCount: scan.objects.length,
    arrayCount: scan.arrayCount,
    primitiveCount: scan.primitiveCount,
    maxDepth: scan.maxDepth,
  }
}

export const formatJsonPath = pathLabel
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)
