import type { JsonObject, JsonType, JsonValue } from '../types/json'
import { detectType } from './json'
import type { ExcelFormulaCell, ExcelSheetData } from './excel'

export interface FormulaGeneratedRow {
  rowNumber: number
  rawText: string
  value?: JsonValue
  repairedText?: string
  repaired: boolean
  error?: string
}

export type LearnedFormulaKind = 'direct' | 'derived' | 'constant' | 'unresolved'

export interface LearnedFormulaField {
  targetPath: string
  label: string
  jsonType: JsonType
  sampleValue: JsonValue
  kind: LearnedFormulaKind
  confidence: number
  sourceColumnIndex?: number
  sourceHeader?: string
  helperColumnIndex?: number
  helperHeader?: string
  dependencyColumnIndexes: number[]
  dependencyHeaders: string[]
  formula?: string
  explanation: string
  transform?: 'wrap-array'
}

export interface FormulaJsonCandidate {
  columnIndex: number
  header: string
  confidence: number
  formulaCount: number
  generatedCount: number
  parseableCount: number
  repairedCount: number
  errorCount: number
  representativeRowNumber?: number
  representativeFormula?: string
  generatedRows: FormulaGeneratedRow[]
  learnedFields: LearnedFormulaField[]
  dependencyColumnIndexes: number[]
  dependencyHeaders: string[]
  externalLookups: string[]
}

export interface FormulaDiscoveryResult {
  candidates: FormulaJsonCandidate[]
  preferred?: FormulaJsonCandidate
}

const isObject = (value: JsonValue): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const isBlank = (value: JsonValue | undefined) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
const serialized = (value: JsonValue) => JSON.stringify(value)
const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const parseLooseScalar = (value: JsonValue): JsonValue => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true'
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return numeric
  }
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try { return JSON.parse(trimmed) as JsonValue } catch { /* keep string */ }
  }
  return trimmed
}

const comparable = (value: JsonValue | undefined) => {
  if (value === undefined) return '__undefined__'
  const normalized = parseLooseScalar(value)
  // Spreadsheet generators often wrap a scalar source into a one-item JSON array
  // (for example Type -> category: [Type], or plane -> [plane]). Treat those as equivalent for inference.
  if (Array.isArray(normalized) && normalized.length === 1 && (typeof normalized[0] === 'string' || typeof normalized[0] === 'number' || typeof normalized[0] === 'boolean')) {
    return comparable(normalized[0] as JsonValue)
  }
  if (typeof normalized === 'string') return normalized.trim().toLowerCase()
  return serialized(normalized).toLowerCase()
}

const stripTrailingCommas = (input: string) => {
  let output = input
  for (let index = 0; index < 4; index += 1) output = output.replace(/,\s*([}\]])/g, '$1')
  return output
}

/**
 * Repair the small syntax defects commonly produced by spreadsheet string-concatenation formulas:
 * trailing commas and unmatched closing brackets/braces. This is intentionally conservative.
 */
export const repairGeneratedJsonText = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed || /^#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!)/i.test(trimmed)) {
    return { text: trimmed, repaired: false, error: 'Excel formula did not return JSON text' }
  }

  const firstObject = trimmed.indexOf('{')
  const firstArray = trimmed.indexOf('[')
  const starts = [firstObject, firstArray].filter(index => index >= 0)
  if (!starts.length) return { text: trimmed, repaired: false, error: 'No JSON object or array was found' }

  let source = trimmed.slice(Math.min(...starts))
  source = stripTrailingCommas(source)

  const output: string[] = []
  const stack: string[] = []
  let inString = false
  let escaped = false
  let changed = source !== trimmed
  const expectedOpen: Record<string, string> = { '}': '{', ']': '[' }
  const expectedClose: Record<string, string> = { '{': '}', '[': ']' }

  for (const char of source) {
    if (inString) {
      // Excel concatenations occasionally introduce raw control characters inside quoted values.
      if ((char === '\n' || char === '\r' || char === '\t') && !escaped) {
        output.push(char === '\n' ? '\\n' : char === '\r' ? '\\r' : '\\t')
        changed = true
        continue
      }
      output.push(char)
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      output.push(char)
      continue
    }
    if (char === '{' || char === '[') {
      stack.push(char)
      output.push(char)
      continue
    }
    if (char === '}' || char === ']') {
      if (stack.length && stack[stack.length - 1] === expectedOpen[char]) {
        stack.pop()
        output.push(char)
      } else {
        changed = true
      }
      continue
    }
    output.push(char)
  }

  while (stack.length) {
    output.push(expectedClose[stack.pop()!] ?? '')
    changed = true
  }

  const repaired = stripTrailingCommas(output.join(''))
  if (repaired !== source) changed = true
  return { text: repaired, repaired: changed }
}

export const parseGeneratedJsonText = (raw: string): FormulaGeneratedRow => {
  const repaired = repairGeneratedJsonText(raw)
  if (repaired.error) return { rowNumber: 0, rawText: raw, repaired: false, error: repaired.error }
  try {
    return {
      rowNumber: 0,
      rawText: raw,
      repairedText: repaired.text,
      repaired: repaired.repaired,
      value: JSON.parse(repaired.text) as JsonValue,
    }
  } catch (error) {
    return {
      rowNumber: 0,
      rawText: raw,
      repairedText: repaired.text,
      repaired: repaired.repaired,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

interface CellReference {
  rowNumber: number
  columnIndex: number
  address: string
  external?: string
}

const columnLettersToIndex = (letters: string) => {
  let value = 0
  for (const char of letters.toUpperCase()) value = value * 26 + (char.charCodeAt(0) - 64)
  return value - 1
}

const columnIndexToLetters = (columnIndex: number) => {
  let current = columnIndex + 1
  let result = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}

const cellAddress = (rowNumber: number, columnIndex: number) => `${columnIndexToLetters(columnIndex)}${rowNumber}`

const extractReferences = (formula: string): CellReference[] => {
  const references: CellReference[] = []
  const seen = new Set<string>()
  // Supports A1, $A$1, A1:C1 and optionally a quoted sheet/workbook prefix.
  const regex = /(?:(?:'([^']+)'|([A-Za-z0-9_\[\]. -]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    const external = match[1] || match[2]
    const startColumn = columnLettersToIndex(match[3])
    const startRow = Number(match[4])
    const endColumn = match[5] ? columnLettersToIndex(match[5]) : startColumn
    const endRow = match[6] ? Number(match[6]) : startRow
    const columnSpan = Math.abs(endColumn - startColumn)
    const rowSpan = Math.abs(endRow - startRow)
    // Formula JSON builders mainly use short horizontal ranges. Avoid exploding whole-sheet ranges.
    if (columnSpan > 80 || rowSpan > 30) continue
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
      for (let column = Math.min(startColumn, endColumn); column <= Math.max(startColumn, endColumn); column += 1) {
        const key = `${external ?? ''}:${row}:${column}`
        if (seen.has(key)) continue
        seen.add(key)
        references.push({ rowNumber: row, columnIndex: column, address: cellAddress(row, column), external })
      }
    }
  }
  return references
}

interface FormulaLineage {
  allColumns: Map<number, number>
  rawColumns: Map<number, number>
  formulaColumns: Map<number, number>
  externalLookups: Set<string>
}

const traceFormulaLineage = (sheet: ExcelSheetData, rowNumber: number, outputColumnIndex: number, formulaMapArg?: Map<string, ExcelFormulaCell>): FormulaLineage => {
  const formulaMap = formulaMapArg ?? new Map(sheet.formulaCells.map(cell => [`${cell.rowNumber}:${cell.columnIndex}`, cell]))
  const allColumns = new Map<number, number>()
  const rawColumns = new Map<number, number>()
  const formulaColumns = new Map<number, number>()
  const externalLookups = new Set<string>()
  const visited = new Set<string>()

  const visit = (row: number, column: number, depth: number) => {
    if (depth > 12) return
    const key = `${row}:${column}`
    if (visited.has(key)) return
    visited.add(key)
    const cell = formulaMap.get(key)
    if (!cell) {
      if (row !== sheet.headerRowNumber) {
        const current = rawColumns.get(column)
        if (current === undefined || depth < current) rawColumns.set(column, depth)
        const all = allColumns.get(column)
        if (all === undefined || depth < all) allColumns.set(column, depth)
      }
      return
    }

    const formulaDepth = formulaColumns.get(column)
    if (formulaDepth === undefined || depth < formulaDepth) formulaColumns.set(column, depth)
    const all = allColumns.get(column)
    if (all === undefined || depth < all) allColumns.set(column, depth)

    const formulaUpper = cell.formula.toUpperCase()
    const externalMatches = cell.formula.match(/'([^']+)'!|([A-Za-z0-9_\[\]. -]+)!/g) ?? []
    externalMatches.forEach(item => externalLookups.add(item.replace(/!$/, '').replace(/^'|'$/g, '')))
    if (/XLOOKUP|VLOOKUP|HLOOKUP|INDEX\s*\(|MATCH\s*\(/.test(formulaUpper)) externalLookups.add('lookup')

    for (const ref of extractReferences(cell.formula)) {
      if (ref.external) {
        externalLookups.add(ref.external)
        continue
      }
      if (ref.rowNumber === sheet.headerRowNumber) continue
      visit(ref.rowNumber, ref.columnIndex, depth + 1)
    }
  }

  visit(rowNumber, outputColumnIndex, 0)
  return { allColumns, rawColumns, formulaColumns, externalLookups }
}

const selectorKeys = ['attributeKey', 'name', 'id', 'key', 'type', 'code']
const identityKeyForArray = (value: JsonValue[]) => {
  const objects = value.filter(isObject)
  if (objects.length !== value.length || !objects.length) return undefined
  return selectorKeys.find(key => {
    const values = objects.map(item => item[key])
    return values.every(item => typeof item === 'string' || typeof item === 'number')
      && new Set(values.map(item => String(item))).size === values.length
  })
}

const flattenGenerated = (value: JsonValue, prefix = '', labelPrefix: string[] = [], depth = 0): Array<{ path: string; label: string; value: JsonValue; type: JsonType }> => {
  if (depth > 10) return []
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key
      const labels = [...labelPrefix, key]
      if (isObject(child)) return flattenGenerated(child, path, labels, depth + 1)
      if (Array.isArray(child)) {
        const identityKey = identityKeyForArray(child)
        if (identityKey) {
          return child.flatMap(item => {
            if (!isObject(item)) return []
            const identity = item[identityKey]
            const selector = `${path}[${identityKey}=${JSON.stringify(String(identity))}]`
            return flattenGenerated(item, selector, [...labels, String(identity)], depth + 1)
          })
        }
        return [{ path, label: labels.join(' › '), value: child, type: 'array' as JsonType }]
      }
      return [{ path, label: labels.join(' › '), value: child, type: detectType(child) }]
    })
  }
  return [{ path: prefix || '$', label: labelPrefix.join(' › ') || '$', value, type: detectType(value) }]
}

const formulaByCell = (sheet: ExcelSheetData, rowNumber: number, columnIndex: number) => sheet.formulaCells.find(cell => cell.rowNumber === rowNumber && cell.columnIndex === columnIndex)
const dataRowByWorksheetRow = (sheet: ExcelSheetData, rowNumber: number) => {
  const index = sheet.rowNumbers.indexOf(rowNumber)
  return index >= 0 ? sheet.rows[index] : undefined
}

const headerAffinity = (header: string, targetPath: string) => {
  const target = semanticFormulaPath(targetPath).split('.').pop() ?? targetPath
  const a = normalizeText(header.replace(/["':,]/g, ' '))
  const b = normalizeText(target)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.82
  return 0
}

const matchRatio = (sheet: ExcelSheetData, generatedRows: FormulaGeneratedRow[], path: string, columnIndex: number) => {
  let compared = 0
  let matched = 0
  for (const generated of generatedRows) {
    if (generated.value === undefined) continue
    const leaf = flattenGenerated(generated.value).find(item => item.path === path)
    if (!leaf || isBlank(leaf.value)) continue
    const row = dataRowByWorksheetRow(sheet, generated.rowNumber)
    if (!row) continue
    const source = row[columnIndex]
    if (isBlank(source)) continue
    compared += 1
    if (comparable(leaf.value) === comparable(source)) matched += 1
  }
  return { compared, ratio: compared ? matched / compared : 0 }
}

const sameFormulaShape = (formula: string) => formula.replace(/\$?([A-Z]{1,3})\$?\d+/g, '$1#').replace(/\s+/g, ' ').trim()

const discoverCandidateColumns = (sheet: ExcelSheetData) => {
  const byColumn = new Map<number, ExcelFormulaCell[]>()
  sheet.formulaCells.filter(cell => cell.rowNumber > sheet.headerRowNumber).forEach(cell => {
    const list = byColumn.get(cell.columnIndex) ?? []
    list.push(cell)
    byColumn.set(cell.columnIndex, list)
  })

  return [...byColumn.entries()].map(([columnIndex, cells]) => {
    const header = sheet.headers[columnIndex] ?? columnIndexToLetters(columnIndex)
    const generatedRows = cells
      .filter(cell => typeof cell.cachedValue === 'string' && String(cell.cachedValue).trim())
      .map(cell => {
        const parsed = parseGeneratedJsonText(String(cell.cachedValue))
        return { ...parsed, rowNumber: cell.rowNumber }
      })
      .filter(row => row.rawText.trim().startsWith('{') || row.rawText.trim().startsWith('[') || row.value !== undefined)

    const formulaErrorCount = cells.filter(cell => typeof cell.cachedValue === 'string' && /^#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!)/i.test(String(cell.cachedValue).trim())).length
    const parseableCount = generatedRows.filter(row => row.value !== undefined).length
    const repairedCount = generatedRows.filter(row => row.value !== undefined && row.repaired).length
    const headerSignal = /(^|\b)(json|full|output|payload|result)(\b|$)/i.test(header) ? 0.24 : 0
    const formulaSignal = cells.some(cell => /CHAR\s*\(|TEXTJOIN\s*\(|\&/.test(cell.formula.toUpperCase())) ? 0.16 : 0
    const parseSignal = generatedRows.length ? Math.min(0.52, 0.52 * (parseableCount / generatedRows.length)) : 0
    const densitySignal = Math.min(0.08, generatedRows.length / Math.max(1, sheet.rowCount) * 0.4)
    const confidence = Math.min(0.99, headerSignal + formulaSignal + parseSignal + densitySignal)
    return { columnIndex, header, cells, generatedRows, parseableCount, repairedCount, formulaErrorCount, confidence }
  }).filter(item => item.generatedRows.length > 0 && (item.parseableCount > 0 || item.confidence >= 0.55))
    .sort((a, b) => b.confidence - a.confidence || b.parseableCount - a.parseableCount)
}

const directRawSource = (sheet: ExcelSheetData, rowNumber: number, helperColumnIndex: number, generatedRows: FormulaGeneratedRow[], targetPath: string, formulaMap?: Map<string, ExcelFormulaCell>) => {
  const helperFormula = formulaMap?.get(`${rowNumber}:${helperColumnIndex}`) ?? formulaByCell(sheet, rowNumber, helperColumnIndex)
  if (!helperFormula) return undefined
  const upper = helperFormula.formula.toUpperCase()
  if (/XLOOKUP|VLOOKUP|HLOOKUP|INDEX\s*\(|MATCH\s*\(/.test(upper)) return undefined
  const refs = extractReferences(helperFormula.formula).filter(ref => !ref.external && ref.rowNumber !== sheet.headerRowNumber)
  const candidates = [...new Set(refs.map(ref => ref.columnIndex))]
    .map(columnIndex => ({ columnIndex, ...matchRatio(sheet, generatedRows, targetPath, columnIndex) }))
    .filter(item => item.compared >= Math.min(2, generatedRows.filter(row => row.value !== undefined).length) && item.ratio >= 0.92)
    .sort((a, b) => b.ratio - a.ratio || a.columnIndex - b.columnIndex)
  return candidates[0]?.columnIndex
}

const inferredTransform = (sheet: ExcelSheetData, rowNumber: number, columnIndex: number, targetType: JsonType): LearnedFormulaField['transform'] => {
  if (targetType !== 'array') return undefined
  const row = dataRowByWorksheetRow(sheet, rowNumber)
  const source = row?.[columnIndex]
  const parsed = source === undefined ? undefined : parseLooseScalar(source)
  return Array.isArray(parsed) ? undefined : 'wrap-array'
}

const learnFields = (sheet: ExcelSheetData, outputColumnIndex: number, generatedRows: FormulaGeneratedRow[], representativeRowNumber: number, lineage: FormulaLineage): LearnedFormulaField[] => {
  const parseable = generatedRows.filter((row): row is FormulaGeneratedRow & { value: JsonValue } => row.value !== undefined)
  if (!parseable.length) return []
  const leafByPath = new Map<string, { path: string; label: string; value: JsonValue; type: JsonType }>()
  parseable.forEach(row => flattenGenerated(row.value).forEach(leaf => {
    if (!leafByPath.has(leaf.path)) leafByPath.set(leaf.path, leaf)
  }))
  const firstLeaves = [...leafByPath.values()]
  const formulaMap = new Map(sheet.formulaCells.map(cell => [`${cell.rowNumber}:${cell.columnIndex}`, cell]))
  const lineageCache = new Map<number, FormulaLineage>()
  const allCandidateColumns = new Set<number>([
    ...lineage.allColumns.keys(),
    ...sheet.profiles.map(profile => profile.index),
  ])

  return firstLeaves.map(leaf => {
    const allValues = parseable
      .map(row => flattenGenerated(row.value).find(item => item.path === leaf.path)?.value)
      .filter((value): value is JsonValue => value !== undefined)
    const values = allValues.filter(value => !isBlank(value))
    const uniqueValues = new Set(allValues.map(value => comparable(value)))
    const constant = allValues.length > 0 && uniqueValues.size <= 1

    const scored = [...allCandidateColumns].map(columnIndex => {
      const match = matchRatio(sheet, parseable, leaf.path, columnIndex)
      const depth = lineage.allColumns.get(columnIndex) ?? 99
      const affinity = headerAffinity(sheet.headers[columnIndex] ?? '', leaf.path)
      const formulaCell = formulaMap.get(`${representativeRowNumber}:${columnIndex}`)
      const inLineage = lineage.allColumns.has(columnIndex)
      const score = match.ratio * 0.75 + affinity * 0.18 + (inLineage ? 0.05 : 0) + (depth < 99 ? Math.max(0, 0.02 - depth * 0.001) : 0)
      return { columnIndex, match, depth, affinity, formulaCell, score }
    }).filter(item => item.match.compared > 0 && item.match.ratio >= 0.82)
      .sort((a, b) => b.score - a.score || a.depth - b.depth || a.columnIndex - b.columnIndex)

    const helper = scored[0]
    if (!helper) {
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type,
        sampleValue: leaf.value,
        kind: constant ? 'constant' : 'unresolved',
        confidence: constant ? 1 : 0,
        dependencyColumnIndexes: [],
        dependencyHeaders: [],
        explanation: constant ? 'Same generated value across rows' : 'No matching Excel source was found',
      }
    }

    const helperFormula = helper.formulaCell
    const raw = directRawSource(sheet, representativeRowNumber, helper.columnIndex, parseable, leaf.path, formulaMap)
    const hasLookup = !!helperFormula && /XLOOKUP|VLOOKUP|HLOOKUP|INDEX\s*\(|MATCH\s*\(/i.test(helperFormula.formula)
    let dependencyLineage: FormulaLineage | undefined
    if (helperFormula) {
      dependencyLineage = lineageCache.get(helper.columnIndex)
      if (!dependencyLineage) {
        dependencyLineage = traceFormulaLineage(sheet, representativeRowNumber, helper.columnIndex, formulaMap)
        lineageCache.set(helper.columnIndex, dependencyLineage)
      }
    }
    const dependencies = dependencyLineage ? [...dependencyLineage.rawColumns.keys()] : []

    if (constant && helper.match.ratio >= 0.95 && helper.affinity < 0.5) {
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type,
        sampleValue: leaf.value,
        kind: 'constant',
        confidence: 1,
        helperColumnIndex: helper.columnIndex,
        helperHeader: sheet.headers[helper.columnIndex],
        dependencyColumnIndexes: dependencies,
        dependencyHeaders: dependencies.map(index => sheet.headers[index] ?? columnIndexToLetters(index)),
        formula: helperFormula?.formula,
        explanation: 'The generated value remains constant across the detected module rows',
      }
    }

    if (raw !== undefined) {
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type,
        sampleValue: leaf.value,
        kind: 'direct',
        confidence: Math.min(1, helper.match.ratio * 0.82 + 0.18),
        sourceColumnIndex: raw,
        sourceHeader: sheet.headers[raw],
        helperColumnIndex: helper.columnIndex,
        helperHeader: sheet.headers[helper.columnIndex],
        dependencyColumnIndexes: dependencies,
        dependencyHeaders: dependencies.map(index => sheet.headers[index] ?? columnIndexToLetters(index)),
        formula: helperFormula?.formula,
        explanation: helper.columnIndex === raw ? 'Generated field matches this Excel column' : `Formula helper ${sheet.headers[helper.columnIndex] ?? columnIndexToLetters(helper.columnIndex)} resolves directly to ${sheet.headers[raw] ?? columnIndexToLetters(raw)}`,
        transform: inferredTransform(sheet, representativeRowNumber, raw, leaf.type),
      }
    }

    if (helperFormula) {
      return {
        targetPath: leaf.path,
        label: leaf.label,
        jsonType: leaf.type,
        sampleValue: leaf.value,
        kind: 'derived',
        confidence: Math.min(0.98, helper.match.ratio * 0.78 + helper.affinity * 0.14 + 0.06),
        // Use the evaluated helper column when applying the recipe to the current workbook.
        sourceColumnIndex: helper.columnIndex,
        sourceHeader: sheet.headers[helper.columnIndex],
        helperColumnIndex: helper.columnIndex,
        helperHeader: sheet.headers[helper.columnIndex],
        dependencyColumnIndexes: dependencies,
        dependencyHeaders: dependencies.map(index => sheet.headers[index] ?? columnIndexToLetters(index)),
        formula: helperFormula.formula,
        explanation: hasLookup
          ? `Derived by lookup/formula from ${dependencies.map(index => sheet.headers[index]).filter(Boolean).join(', ') || 'other workbook data'}`
          : `Derived by spreadsheet formula${dependencies.length ? ` from ${dependencies.map(index => sheet.headers[index]).filter(Boolean).join(', ')}` : ''}`,
        transform: inferredTransform(sheet, representativeRowNumber, helper.columnIndex, leaf.type),
      }
    }

    // Literal helper columns can still encode the intended JSON field. Prefer an earlier matching source with the same semantic header when possible.
    const earlierEquivalent = scored.find(item => item.columnIndex < helper.columnIndex && item.affinity >= 0.8 && item.match.ratio >= 0.95)
    const sourceColumnIndex = earlierEquivalent?.columnIndex ?? helper.columnIndex
    return {
      targetPath: leaf.path,
      label: leaf.label,
      jsonType: leaf.type,
      sampleValue: leaf.value,
      kind: constant ? 'constant' : 'direct',
      confidence: Math.min(0.98, helper.match.ratio * 0.82 + Math.max(helper.affinity, earlierEquivalent?.affinity ?? 0) * 0.16),
      sourceColumnIndex: constant ? undefined : sourceColumnIndex,
      sourceHeader: constant ? undefined : sheet.headers[sourceColumnIndex],
      helperColumnIndex: helper.columnIndex,
      helperHeader: sheet.headers[helper.columnIndex],
      dependencyColumnIndexes: [],
      dependencyHeaders: [],
      explanation: constant ? 'Same generated value across rows' : 'Generated field matches a workbook helper/input column',
      transform: constant ? undefined : inferredTransform(sheet, representativeRowNumber, sourceColumnIndex, leaf.type),
    }
  })
}

export const discoverFormulaGeneratedJson = (sheet: ExcelSheetData): FormulaDiscoveryResult => {
  const formulaMap = new Map(sheet.formulaCells.map(cell => [`${cell.rowNumber}:${cell.columnIndex}`, cell]))
  const discovered = discoverCandidateColumns(sheet).map((candidate, candidateIndex) => {
    const representative = candidate.generatedRows.find(row => row.value !== undefined)
    const representativeRowNumber = representative?.rowNumber ?? candidate.cells[0]?.rowNumber
    const representativeCell = representativeRowNumber
      ? candidate.cells.find(cell => cell.rowNumber === representativeRowNumber) ?? candidate.cells[0]
      : candidate.cells[0]
    const lineage = representativeRowNumber
      ? traceFormulaLineage(sheet, representativeRowNumber, candidate.columnIndex, formulaMap)
      : { allColumns: new Map<number, number>(), rawColumns: new Map<number, number>(), formulaColumns: new Map<number, number>(), externalLookups: new Set<string>() }
    const learnedFields = representativeRowNumber && candidateIndex === 0
      ? learnFields(sheet, candidate.columnIndex, candidate.generatedRows, representativeRowNumber, lineage)
      : []
    return {
      columnIndex: candidate.columnIndex,
      header: candidate.header,
      confidence: candidate.confidence,
      formulaCount: candidate.cells.length,
      generatedCount: candidate.generatedRows.length + candidate.formulaErrorCount,
      parseableCount: candidate.parseableCount,
      repairedCount: candidate.repairedCount,
      errorCount: candidate.generatedRows.length - candidate.parseableCount + candidate.formulaErrorCount,
      representativeRowNumber,
      representativeFormula: representativeCell?.formula,
      generatedRows: candidate.generatedRows,
      learnedFields,
      dependencyColumnIndexes: [...lineage.rawColumns.keys()].sort((a, b) => a - b),
      dependencyHeaders: [...lineage.rawColumns.keys()].sort((a, b) => a - b).map(index => sheet.headers[index] ?? columnIndexToLetters(index)),
      externalLookups: [...lineage.externalLookups],
    } satisfies FormulaJsonCandidate
  })
  return { candidates: discovered, preferred: discovered[0] }
}

export const generatedJsonArrayFromCandidate = (candidate: FormulaJsonCandidate): JsonValue[] => candidate.generatedRows
  .filter((row): row is FormulaGeneratedRow & { value: JsonValue } => row.value !== undefined)
  .map(row => row.value)

/** Normalize object-vs-named-array rule paths so learned formula fields can be applied to a guide with a different representation. */
export const semanticFormulaPath = (path: string) => {
  const selectorExpanded = path.replace(/\[([^=\]]+)=(["']?)([^\]"']+)\2\]/g, (_match, _key, _quote, value) => `.${value}`)
  return selectorExpanded
    .split('.')
    .map(part => part.trim().toLowerCase())
    .filter(part => part && part !== 'detail')
    .join('.')
}

export const learnedFieldForTemplatePath = (path: string, fields: LearnedFormulaField[]) => {
  const semantic = semanticFormulaPath(path)
  return fields.find(field => semanticFormulaPath(field.targetPath) === semantic)
}

export const formulaKindLabel = (kind: LearnedFormulaKind) => kind

export const formulaShapeSignature = (candidate: FormulaJsonCandidate) => candidate.representativeFormula ? sameFormulaShape(candidate.representativeFormula) : ''
