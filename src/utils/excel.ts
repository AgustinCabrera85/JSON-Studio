import type { JsonObject, JsonType, JsonValue } from '../types/json'

export type ExcelSemanticType = JsonType | 'date' | 'uuid'

export interface ExcelColumnProfile {
  index: number
  header: string
  nonEmpty: number
  uniqueCount: number
  uniqueRatio: number
  inferredType: ExcelSemanticType
  sampleValues: JsonValue[]
}

export interface ExcelSheetData {
  name: string
  headers: string[]
  rows: JsonValue[][]
  profiles: ExcelColumnProfile[]
  rowCount: number
  /** 1-based row number selected as the header row in the imported worksheet matrix. */
  headerRowNumber: number
  /** 1-based worksheet row number for every row in `rows`. */
  rowNumbers: number[]
}

export interface ExcelWorkbookData {
  fileName: string
  sheets: ExcelSheetData[]
}

export interface ExcelColumnMapping {
  columnIndex: number
  sourceHeader: string
  enabled: boolean
  targetPath: string
  jsonType: JsonType
  semanticType?: ExcelSemanticType
}

export type ExcelStructureMode = 'records' | 'collection' | 'keyed' | 'grouped'

export interface ExcelStructureSuggestion {
  mode: ExcelStructureMode
  confidence: number
  titleKey: string
  descriptionKey: string
  keyColumnIndex?: number
  groupColumnIndex?: number
}

const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const normalizeCell = (value: unknown): JsonValue => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  if (value === null || value === undefined) return null
  return String(value)
}

const uniqueHeaders = (row: unknown[], width: number) => {
  const seen = new Map<string, number>()
  return Array.from({ length: width }, (_, index) => {
    const raw = String(row[index] ?? '').trim()
    const base = raw || `column_${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const looksLikeDateString = (value: string) => {
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s].*)?$/.test(value.trim())) return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp)
}

const inferColumnType = (values: JsonValue[]): ExcelSemanticType => {
  const actual = values.filter(value => !isBlank(value))
  if (actual.length === 0) return 'string'

  let numbers = 0
  let booleans = 0
  let dates = 0
  let uuids = 0
  let strings = 0

  for (const value of actual) {
    if (typeof value === 'number') numbers += 1
    else if (typeof value === 'boolean') booleans += 1
    else if (typeof value === 'string') {
      if (UUID_RE.test(value.trim())) uuids += 1
      else if (looksLikeDateString(value)) dates += 1
      else strings += 1
    }
  }

  const threshold = actual.length * 0.8
  if (uuids >= threshold) return 'uuid'
  if (dates >= threshold) return 'date'
  if (numbers >= threshold) return 'number'
  if (booleans >= threshold) return 'boolean'
  if (strings >= threshold) return 'string'
  return 'string'
}

const headerRowScore = (row: unknown[], nextRow?: unknown[]) => {
  const cells = row.filter(cell => !isBlank(cell))
  if (cells.length === 0) return -Infinity
  const strings = cells.filter(cell => typeof cell === 'string').length
  const unique = new Set(cells.map(cell => String(cell).trim().toLowerCase())).size
  const duplicates = Math.max(0, cells.length - unique)
  const nextDensity = nextRow ? nextRow.filter(cell => !isBlank(cell)).length : 0
  // Header rows in real workbooks are usually dense, mostly textual and unique.
  // This intentionally penalizes title / metadata rows containing only one or two cells.
  return (cells.length * 5) + (strings * 1.5) + (unique * 1.25) - (duplicates * 0.75) + Math.min(nextDensity, cells.length) * 0.25
}

const detectHeaderRowIndex = (matrix: unknown[][]) => {
  const limit = Math.min(matrix.length, 30)
  let bestIndex = 0
  let bestScore = -Infinity
  for (let index = 0; index < limit; index += 1) {
    const row = matrix[index] ?? []
    const score = headerRowScore(row, matrix[index + 1])
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }
  return bestIndex
}

const profileSheet = (name: string, matrix: unknown[][]): ExcelSheetData => {
  const hasAnyData = matrix.some(row => row.some(cell => !isBlank(cell)))
  if (!hasAnyData) return { name, headers: [], rows: [], profiles: [], rowCount: 0, headerRowNumber: 1, rowNumbers: [] }

  const headerIndex = detectHeaderRowIndex(matrix)
  const headerRow = matrix[headerIndex] ?? []
  const dataRows = matrix
    .map((row, index) => ({ row, index }))
    .filter(item => item.index > headerIndex && item.row.some(cell => !isBlank(cell)))
  const width = Math.max(headerRow.length, ...dataRows.map(item => item.row.length), 0)
  const headers = uniqueHeaders(headerRow, width)
  const rows = dataRows.map(item => Array.from({ length: width }, (_, index) => normalizeCell(item.row[index])))
  const rowNumbers = dataRows.map(item => item.index + 1)

  const profiles = headers.map((header, index): ExcelColumnProfile => {
    const values = rows.map(row => row[index]).filter(value => !isBlank(value))
    const serialized = values.map(value => JSON.stringify(value))
    const uniqueCount = new Set(serialized).size
    return {
      index,
      header,
      nonEmpty: values.length,
      uniqueCount,
      uniqueRatio: values.length ? uniqueCount / values.length : 0,
      inferredType: inferColumnType(values),
      sampleValues: values.slice(0, 4),
    }
  })

  return { name, headers, rows, profiles, rowCount: rows.length, headerRowNumber: headerIndex + 1, rowNumbers }
}

export const parseExcelFile = async (file: File): Promise<ExcelWorkbookData> => {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  const sheets = workbook.SheetNames.map(name => {
    const worksheet = workbook.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    })
    return profileSheet(name, matrix)
  }).filter(sheet => sheet.headers.length > 0)

  if (sheets.length === 0) throw new Error('No tabular data was found in the workbook')
  return { fileName: file.name, sheets }
}

export const defaultMappingsForSheet = (sheet: ExcelSheetData): ExcelColumnMapping[] => sheet.profiles.map(profile => ({
  columnIndex: profile.index,
  sourceHeader: profile.header,
  enabled: true,
  targetPath: profile.header,
  jsonType: profile.inferredType === 'date' || profile.inferredType === 'uuid' ? 'string' : profile.inferredType,
  semanticType: profile.inferredType,
}))

export const convertExcelValue = (value: JsonValue, type: JsonType, semanticType?: ExcelSemanticType): JsonValue => {
  if (value === null || value === undefined || value === '') {
    if (type === 'string') return ''
    if (type === 'number') return 0
    if (type === 'boolean') return false
    if (type === 'array') return []
    if (type === 'object') return {}
    return null
  }

  if (semanticType === 'date' && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }

  if (type === 'string') return String(value)
  if (type === 'number') {
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    return Number.isFinite(numeric) ? numeric : 0
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    return ['true', 'yes', 'y', 'si', 'sí', '1'].includes(String(value).trim().toLowerCase())
  }
  if (type === 'null') return null
  if (type === 'array' || type === 'object') {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as JsonValue
        if (type === 'array' && Array.isArray(parsed)) return parsed
        if (type === 'object' && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch { /* fall through */ }
    }
    return type === 'array' ? [] : {}
  }
  return value
}

const pathSegments = (path: string) => path.split('.').map(segment => segment.trim()).filter(Boolean)

const setNested = (target: JsonObject, path: string, value: JsonValue) => {
  const segments = pathSegments(path)
  if (segments.length === 0) return
  let cursor: JsonObject = target
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value
      return
    }
    const existing = cursor[segment]
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) cursor[segment] = {}
    cursor = cursor[segment] as JsonObject
  })
}

export const mapExcelRow = (row: JsonValue[], mappings: ExcelColumnMapping[]): JsonObject => {
  const result: JsonObject = {}
  mappings.filter(mapping => mapping.enabled && mapping.targetPath.trim()).forEach(mapping => {
    setNested(result, mapping.targetPath, convertExcelValue(row[mapping.columnIndex] ?? null, mapping.jsonType, mapping.semanticType))
  })
  return result
}

export interface BuildExcelJsonOptions {
  mode: ExcelStructureMode
  collectionKey?: string
  keyColumnIndex?: number
  groupColumnIndex?: number
  groupKey?: string
  itemsKey?: string
}

export const buildExcelJson = (
  sheet: ExcelSheetData,
  mappings: ExcelColumnMapping[],
  options: BuildExcelJsonOptions,
): JsonValue => {
  const mappedRows = sheet.rows.map(row => mapExcelRow(row, mappings))

  if (options.mode === 'collection') {
    return { [options.collectionKey?.trim() || sheet.name]: mappedRows }
  }

  if (options.mode === 'keyed') {
    const keyIndex = options.keyColumnIndex ?? 0
    const result: JsonObject = {}
    sheet.rows.forEach((row, index) => {
      const rawKey = row[keyIndex]
      const key = String(rawKey ?? `row_${index + 1}`)
      result[key] = mappedRows[index]
    })
    return result
  }

  if (options.mode === 'grouped') {
    const groupIndex = options.groupColumnIndex ?? 0
    const groupKey = options.groupKey?.trim() || sheet.headers[groupIndex] || 'group'
    const itemsKey = options.itemsKey?.trim() || 'items'
    const childMappings = mappings.filter(mapping => mapping.columnIndex !== groupIndex)
    const groups = new Map<string, JsonObject[]>()
    sheet.rows.forEach(row => {
      const groupValue = String(row[groupIndex] ?? '')
      const bucket = groups.get(groupValue) ?? []
      bucket.push(mapExcelRow(row, childMappings))
      groups.set(groupValue, bucket)
    })
    return Array.from(groups.entries()).map(([groupValue, items]) => ({ [groupKey]: groupValue, [itemsKey]: items }))
  }

  return mappedRows
}

export const suggestedStructures = (sheet: ExcelSheetData): ExcelStructureSuggestion[] => {
  const suggestions: ExcelStructureSuggestion[] = [
    { mode: 'records', confidence: 0.98, titleKey: 'excel.suggestion.records', descriptionKey: 'excel.suggestion.recordsDescription' },
    { mode: 'collection', confidence: 0.9, titleKey: 'excel.suggestion.collection', descriptionKey: 'excel.suggestion.collectionDescription' },
  ]

  const uniqueCandidate = sheet.profiles
    .filter(profile => profile.nonEmpty === sheet.rowCount && profile.uniqueRatio >= 0.98 && profile.uniqueCount > 1)
    .sort((a, b) => {
      const aId = /(^id$|_id$|id$|code|key)/i.test(a.header) ? 1 : 0
      const bId = /(^id$|_id$|id$|code|key)/i.test(b.header) ? 1 : 0
      return bId - aId || b.uniqueRatio - a.uniqueRatio
    })[0]

  if (uniqueCandidate) {
    suggestions.push({
      mode: 'keyed',
      confidence: uniqueCandidate.inferredType === 'uuid' ? 0.97 : /(^id$|_id$|id$|code|key)/i.test(uniqueCandidate.header) ? 0.96 : 0.88,
      titleKey: 'excel.suggestion.keyed',
      descriptionKey: 'excel.suggestion.keyedDescription',
      keyColumnIndex: uniqueCandidate.index,
    })
  }

  const groupedCandidate = sheet.profiles
    .filter(profile => profile.uniqueCount >= 2 && profile.uniqueCount <= Math.min(25, Math.max(3, Math.floor(sheet.rowCount * 0.45))))
    .sort((a, b) => a.uniqueCount - b.uniqueCount)[0]

  if (groupedCandidate) {
    suggestions.push({
      mode: 'grouped',
      confidence: 0.84,
      titleKey: 'excel.suggestion.grouped',
      descriptionKey: 'excel.suggestion.groupedDescription',
      groupColumnIndex: groupedCandidate.index,
    })
  }

  return suggestions
}

export const mappingTemplateValue = (mappings: ExcelColumnMapping[]): JsonValue => {
  const emptyRow: JsonValue[] = []
  mappings.forEach(mapping => {
    if (mapping.jsonType === 'string') emptyRow[mapping.columnIndex] = ''
    else if (mapping.jsonType === 'number') emptyRow[mapping.columnIndex] = 0
    else if (mapping.jsonType === 'boolean') emptyRow[mapping.columnIndex] = false
    else if (mapping.jsonType === 'array') emptyRow[mapping.columnIndex] = []
    else if (mapping.jsonType === 'object') emptyRow[mapping.columnIndex] = {}
    else emptyRow[mapping.columnIndex] = null
  })
  return mapExcelRow(emptyRow, mappings)
}
