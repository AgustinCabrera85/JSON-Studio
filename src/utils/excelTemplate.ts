import type { JsonObject, JsonPath, JsonType, JsonValue } from '../types/json'
import { cloneJson, detectType, getAtPath, setAtPath } from './json'
import { convertExcelValue, type ExcelSemanticType, type ExcelSheetData } from './excel'

export interface TemplateLeafPath {
  path: string
  type: JsonType
  label: string
  sampleValues: JsonValue[]
  constant: boolean
}

export interface TemplateRepeatTarget {
  id: string
  kind: 'array' | 'root-object'
  path: JsonPath
  label: string
  prototype: JsonObject
  examples: JsonObject[]
  existingCount: number
  leaves: TemplateLeafPath[]
}

export type TemplatePopulateMode = 'replace' | 'append'
export type TemplateFieldMode = 'preserve' | 'map'

export type TemplateFieldTransform = 'wrap-array'

export interface TemplateFieldMapping {
  targetPath: string
  label: string
  jsonType: JsonType
  mode: TemplateFieldMode
  sourceColumnIndex?: number
  sourceHeader?: string
  semanticType?: ExcelSemanticType
  confidence: number
  constant: boolean
  guideValue: JsonValue
  transform?: TemplateFieldTransform
}

const pathLabel = (path: JsonPath) => {
  if (path.length === 0) return '$'
  let output = '$'
  path.forEach(segment => {
    output += typeof segment === 'number' ? `[${segment}]` : `.${segment}`
  })
  return output
}

const isObject = (value: JsonValue): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const isBlank = (value: JsonValue | undefined) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
const serialized = (value: JsonValue) => JSON.stringify(value)

const selectorKeys = ['attributeKey', 'name', 'id', 'key', 'type', 'code']

const identityKeyForArray = (value: JsonValue[]) => {
  const objects = value.filter(isObject)
  if (objects.length !== value.length || objects.length === 0) return undefined
  return selectorKeys.find(key => {
    const values = objects.map(item => item[key])
    return values.every(item => typeof item === 'string' || typeof item === 'number')
      && new Set(values.map(item => String(item))).size === values.length
  })
}

const quoteSelector = (value: JsonValue) => JSON.stringify(String(value))

const collectLeafDefinitions = (value: JsonValue, prefix = '', labelPrefix: string[] = [], depth = 0): Array<Omit<TemplateLeafPath, 'sampleValues' | 'constant'>> => {
  if (depth > 9 || !isObject(value)) return []
  const leaves: Array<Omit<TemplateLeafPath, 'sampleValues' | 'constant'>> = []

  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const labels = [...labelPrefix, key]

    if (isObject(child)) {
      const nested = collectLeafDefinitions(child, path, labels, depth + 1)
      if (nested.length === 0) leaves.push({ path, type: 'object', label: labels.join(' › ') })
      else leaves.push(...nested)
      return
    }

    if (Array.isArray(child)) {
      const identityKey = identityKeyForArray(child)
      if (identityKey) {
        child.forEach(item => {
          if (!isObject(item)) return
          const identity = item[identityKey]
          const selectorPath = `${path}[${identityKey}=${quoteSelector(identity)}]`
          const selectorLabel = [...labels, String(identity)]
          const nested = collectLeafDefinitions(item, selectorPath, selectorLabel, depth + 1)
          if (nested.length === 0) leaves.push({ path: selectorPath, type: 'object', label: selectorLabel.join(' › ') })
          else leaves.push(...nested)
        })
        return
      }
      leaves.push({ path, type: 'array', label: labels.join(' › ') })
      return
    }

    leaves.push({ path, type: detectType(child), label: labels.join(' › ') })
  })

  return leaves
}

interface ParsedSegment {
  key: string
  selectorKey?: string
  selectorValue?: string
}

const splitTemplatePath = (path: string) => {
  const parts: string[] = []
  let current = ''
  let bracketDepth = 0
  for (const char of path) {
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === '.' && bracketDepth === 0) {
      if (current) parts.push(current)
      current = ''
    } else current += char
  }
  if (current) parts.push(current)
  return parts
}

const parseSegment = (segment: string): ParsedSegment => {
  const match = segment.match(/^([^[]+)(?:\[([^=\]]+)=([\s\S]+)\])?$/)
  if (!match) return { key: segment }
  const rawValue = match[3]
  let selectorValue: string | undefined
  if (rawValue !== undefined) {
    try { selectorValue = String(JSON.parse(rawValue)) }
    catch { selectorValue = rawValue.replace(/^['"]|['"]$/g, '') }
  }
  return { key: match[1], selectorKey: match[2], selectorValue }
}

export const getTemplatePathValue = (root: JsonObject, path: string): JsonValue | undefined => {
  let cursor: JsonValue = root
  for (const raw of splitTemplatePath(path)) {
    const segment = parseSegment(raw)
    if (!isObject(cursor)) return undefined
    const next = cursor[segment.key]
    if (segment.selectorKey) {
      if (!Array.isArray(next)) return undefined
      cursor = next.find(item => isObject(item) && String(item[segment.selectorKey!]) === segment.selectorValue)
      if (cursor === undefined) return undefined
    } else cursor = next
  }
  return cursor
}

const setTemplatePathValue = (root: JsonObject, path: string, value: JsonValue) => {
  const segments = splitTemplatePath(path).map(parseSegment)
  if (segments.length === 0) return
  let cursor: JsonObject = root

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    if (segment.selectorKey) {
      let array = cursor[segment.key]
      if (!Array.isArray(array)) {
        array = []
        cursor[segment.key] = array
      }
      let item = array.find(candidate => isObject(candidate) && String(candidate[segment.selectorKey!]) === segment.selectorValue)
      if (!isObject(item)) {
        item = { [segment.selectorKey]: segment.selectorValue ?? '' }
        array.push(item)
      }
      if (isLast) {
        // Selector paths normally identify an object, but support replacing it if explicitly mapped.
        const itemIndex = array.indexOf(item)
        array[itemIndex] = cloneJson(value)
        return
      }
      cursor = item
      return
    }

    if (isLast) {
      cursor[segment.key] = cloneJson(value)
      return
    }

    const existing = cursor[segment.key]
    if (!isObject(existing)) cursor[segment.key] = {}
    cursor = cursor[segment.key] as JsonObject
  })
}

const enrichLeaves = (prototype: JsonObject, examples: JsonObject[]) => collectLeafDefinitions(prototype).map(definition => {
  const values = examples
    .map(example => getTemplatePathValue(example, definition.path))
    .filter((value): value is JsonValue => value !== undefined)
  const meaningful = values.filter(value => !isBlank(value))
  const unique = new Set(meaningful.map(serialized))
  return {
    ...definition,
    sampleValues: values,
    constant: meaningful.length > 0 && unique.size <= 1,
  }
})

export const findTemplateRepeatTargets = (root: JsonValue): TemplateRepeatTarget[] => {
  const targets: TemplateRepeatTarget[] = []

  const visit = (value: JsonValue, path: JsonPath, depth: number) => {
    if (depth > 8) return
    if (Array.isArray(value)) {
      const examples = value.filter(isObject).slice(0, 40)
      const prototypeCandidate = examples[0]
      if (value.length === 0 || prototypeCandidate) {
        const prototype = prototypeCandidate ? cloneJson(prototypeCandidate) : {}
        targets.push({
          id: `array:${JSON.stringify(path)}`,
          kind: 'array',
          path,
          label: `${pathLabel(path)}[]`,
          prototype,
          examples,
          existingCount: value.length,
          leaves: enrichLeaves(prototype, examples.length ? examples : [prototype]),
        })
      }
      value.forEach((item, index) => visit(item, [...path, index], depth + 1))
      return
    }
    if (isObject(value)) Object.entries(value).forEach(([key, child]) => visit(child, [...path, key], depth + 1))
  }

  visit(root, [], 0)

  if (targets.length === 0 && isObject(root)) {
    const prototype = cloneJson(root)
    targets.push({
      id: 'root-object',
      kind: 'root-object',
      path: [],
      label: '$ (repeat root object)',
      prototype,
      examples: [prototype],
      existingCount: 1,
      leaves: enrichLeaves(prototype, [prototype]),
    })
  }

  return targets
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
const tokenSet = (value: string) => new Set(value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))

const headerSimilarity = (header: string, leaf: TemplateLeafPath) => {
  const cleanedHeader = header.replace(/["':,]/g, ' ')
  const normalizedHeader = normalize(cleanedHeader)
  const lastPart = leaf.path.split('.').pop() ?? leaf.path
  const selectorStripped = lastPart.replace(/\[[^\]]+\]/g, '')
  const normalizedLeaf = normalize(selectorStripped)
  const normalizedFull = normalize(leaf.path.replace(/\[[^\]]+\]/g, ' '))
  if (!normalizedHeader || !normalizedLeaf) return 0
  if (normalizedHeader === normalizedLeaf) return 1
  if (normalizedHeader === normalizedFull) return 0.98
  if (normalizedLeaf.includes(normalizedHeader) || normalizedHeader.includes(normalizedLeaf)) return 0.84
  const headerTokens = tokenSet(cleanedHeader)
  const leafTokens = tokenSet(`${leaf.label} ${selectorStripped}`)
  const common = [...headerTokens].filter(token => leafTokens.has(token)).length
  if (!common) return 0
  return Math.min(0.8, common / Math.max(headerTokens.size, leafTokens.size) + 0.35)
}

const comparableValue = (value: JsonValue) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try { return serialized(JSON.parse(trimmed) as JsonValue).toLowerCase() }
      catch { /* use the original string below */ }
    }
  }
  return serialized(value).toLowerCase()
}

const valueOverlap = (sheet: ExcelSheetData, columnIndex: number, leaf: TemplateLeafPath) => {
  const expected = new Set(leaf.sampleValues.filter(value => !isBlank(value)).map(comparableValue))
  if (expected.size === 0) return 0
  const source = new Set(sheet.rows.map(row => row[columnIndex]).filter(value => !isBlank(value)).map(comparableValue))
  const hits = [...expected].filter(value => source.has(value)).length
  return hits / expected.size
}

const mappingConfidence = (sheet: ExcelSheetData, columnIndex: number, leaf: TemplateLeafPath) => {
  const header = headerSimilarity(sheet.headers[columnIndex] ?? '', leaf)
  const overlap = valueOverlap(sheet, columnIndex, leaf)
  if (overlap >= 0.99) return Math.max(0.98, header)
  if (overlap > 0) return Math.max(header, 0.68 + overlap * 0.28)
  return header
}

export const defaultFieldMappingsForTemplate = (sheet: ExcelSheetData, target: TemplateRepeatTarget): TemplateFieldMapping[] => {
  const usedColumns = new Set<number>()
  return target.leaves.map(leaf => {
    const guideValue = getTemplatePathValue(target.prototype, leaf.path) ?? null
    if (leaf.constant) {
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type === 'null' ? 'string' : leaf.type,
        mode: 'preserve',
        confidence: 1,
        constant: true,
        guideValue,
      }
    }

    let bestColumn: number | undefined
    let bestScore = 0
    sheet.profiles.forEach(profile => {
      if (usedColumns.has(profile.index)) return
      const score = mappingConfidence(sheet, profile.index, leaf)
      if (score > bestScore) {
        bestScore = score
        bestColumn = profile.index
      }
    })

    if (bestColumn !== undefined && bestScore >= 0.58) {
      usedColumns.add(bestColumn)
      const profile = sheet.profiles[bestColumn]
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type === 'null' ? (profile.inferredType === 'date' || profile.inferredType === 'uuid' ? 'string' : profile.inferredType) : leaf.type,
        mode: 'map',
        sourceColumnIndex: bestColumn,
        sourceHeader: profile.header,
        semanticType: profile.inferredType,
        confidence: bestScore,
        constant: false,
        guideValue,
      }
    }

    return {
      targetPath: leaf.path,
      label: leaf.label,
      jsonType: leaf.type === 'null' ? 'string' : leaf.type,
      mode: 'preserve',
      confidence: 0,
      constant: false,
      guideValue,
    }
  })
}

export const buildTemplateItem = (target: TemplateRepeatTarget, row: JsonValue[], mappings: TemplateFieldMapping[]): JsonObject => {
  const result = cloneJson(target.prototype)
  mappings.forEach(mapping => {
    if (mapping.mode !== 'map' || mapping.sourceColumnIndex === undefined) return
    const sourceValue = row[mapping.sourceColumnIndex] ?? null
    const converted = mapping.transform === 'wrap-array'
      ? (sourceValue === null || sourceValue === undefined || sourceValue === '' ? [] : [cloneJson(sourceValue)])
      : convertExcelValue(sourceValue, mapping.jsonType, mapping.semanticType)
    setTemplatePathValue(result, mapping.targetPath, converted)
  })
  return result
}

export const buildTemplateExcelJson = (
  template: JsonValue,
  sheet: ExcelSheetData,
  mappings: TemplateFieldMapping[],
  target: TemplateRepeatTarget,
  populateMode: TemplatePopulateMode,
): JsonValue => {
  const rows = sheet.rows.map(row => buildTemplateItem(target, row, mappings))
  if (target.kind === 'root-object') return rows

  const existing = getAtPath(template, target.path)
  const nextItems = populateMode === 'append' && Array.isArray(existing)
    ? [...existing.map(item => cloneJson(item)), ...rows]
    : rows
  return setAtPath(template, target.path, nextItems)
}
