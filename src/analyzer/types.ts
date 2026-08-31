import type { JsonObject, JsonPath, JsonType, JsonValue } from '../types/json'

export type FieldFrequency = 'required' | 'common' | 'optional' | 'rare'

export interface ObjectOccurrence {
  path: JsonPath
  value: JsonObject
  context: string
  depth: number
}

export interface FieldAnalysis {
  name: string
  presence: number
  frequency: FieldFrequency
  types: Array<{ type: JsonType; count: number }>
  dominantType: JsonType
  examples: JsonValue[]
  constantValue?: JsonValue
  enumValues?: JsonValue[]
  uuidLike: boolean
}

export interface DiscoveredStructure {
  id: string
  name: string
  instances: number
  confidence: number
  contexts: string[]
  paths: JsonPath[]
  parentStructures: string[]
  fields: FieldAnalysis[]
  minimalValue: JsonObject
  recommendedValue: JsonObject
}

export interface UuidLocation {
  path: JsonPath
  key: string
  alias?: string
  score: number
}

export interface UuidReference {
  uuid: string
  alias: string
  target?: UuidLocation
  references: UuidLocation[]
  unresolved: boolean
}

export interface JsonAnalysisResult {
  structures: DiscoveredStructure[]
  uuidReferences: UuidReference[]
  objectCount: number
  arrayCount: number
  primitiveCount: number
  maxDepth: number
}
