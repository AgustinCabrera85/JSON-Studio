import type { JsonValue } from './json'

export type ToolboxItemKind = 'structure' | 'primitive' | 'guided'

export interface ToolboxDropPayload {
  name: string
  value: JsonValue
  source?: string
  contexts?: string[]
  parentStructures?: string[]
  kind?: ToolboxItemKind
}

export interface GuidedComponent {
  id: string
  name: string
  value: JsonValue
  createdAt: number
}
