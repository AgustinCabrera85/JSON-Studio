export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]

export type JsonType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'

export type PathSegment = string | number
export type JsonPath = PathSegment[]

export interface TemplateDefinition {
  id: string
  name: string
  description: string
  value: JsonValue
}
