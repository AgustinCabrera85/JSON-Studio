import type { JsonPath, JsonType, JsonValue } from '../types/json'

export const cloneJson = <T extends JsonValue>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

export const detectType = (value: JsonValue): JsonType => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as 'string' | 'number' | 'boolean'
}

export const defaultValueForType = (type: JsonType): JsonValue => {
  switch (type) {
    case 'string': return ''
    case 'number': return 0
    case 'boolean': return false
    case 'null': return null
    case 'object': return {}
    case 'array': return []
  }
}

export const pathToKey = (path: JsonPath): string => JSON.stringify(path)

export const getAtPath = (root: JsonValue, path: JsonPath): JsonValue => {
  let current: JsonValue = root
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment]
    } else if (current !== null && typeof current === 'object' && !Array.isArray(current) && typeof segment === 'string') {
      current = current[segment]
    } else {
      throw new Error(`Ruta inválida: ${pathToKey(path)}`)
    }
  }
  return current
}

export const setAtPath = (root: JsonValue, path: JsonPath, value: JsonValue): JsonValue => {
  if (path.length === 0) return cloneJson(value)
  const next = cloneJson(root)
  let current: JsonValue = next
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    current = Array.isArray(current)
      ? current[segment as number]
      : (current as Record<string, JsonValue>)[segment as string]
  }
  const last = path[path.length - 1]
  if (Array.isArray(current)) current[last as number] = cloneJson(value)
  else (current as Record<string, JsonValue>)[last as string] = cloneJson(value)
  return next
}

export const deleteAtPath = (root: JsonValue, path: JsonPath): JsonValue => {
  if (path.length === 0) return {}
  const next = cloneJson(root)
  let current: JsonValue = next
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    current = Array.isArray(current)
      ? current[segment as number]
      : (current as Record<string, JsonValue>)[segment as string]
  }
  const last = path[path.length - 1]
  if (Array.isArray(current)) current.splice(last as number, 1)
  else delete (current as Record<string, JsonValue>)[last as string]
  return next
}

export const renameObjectKey = (root: JsonValue, path: JsonPath, newKey: string): { value: JsonValue; path: JsonPath } => {
  if (path.length === 0 || typeof path[path.length - 1] !== 'string') return { value: root, path }
  const parentPath = path.slice(0, -1)
  const oldKey = path[path.length - 1] as string
  const parent = getAtPath(root, parentPath)
  if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) return { value: root, path }
  if (newKey === oldKey) return { value: root, path }
  if (!newKey.trim()) throw new Error('El nombre no puede estar vacío')
  if (Object.prototype.hasOwnProperty.call(parent, newKey)) throw new Error(`Ya existe la propiedad "${newKey}"`)

  const next = cloneJson(root)
  const nextParent = getAtPath(next, parentPath) as Record<string, JsonValue>
  const entries = Object.entries(nextParent)
  const rebuilt: Record<string, JsonValue> = {}
  for (const [key, val] of entries) rebuilt[key === oldKey ? newKey : key] = val
  const final = setAtPath(next, parentPath, rebuilt)
  return { value: final, path: [...parentPath, newKey] }
}

export const addObjectProperty = (root: JsonValue, path: JsonPath, key: string, value: JsonValue): JsonValue => {
  const target = getAtPath(root, path)
  if (target === null || typeof target !== 'object' || Array.isArray(target)) throw new Error('El nodo seleccionado no es un objeto')
  if (!key.trim()) throw new Error('El nombre no puede estar vacío')
  if (Object.prototype.hasOwnProperty.call(target, key)) throw new Error(`Ya existe la propiedad "${key}"`)
  return setAtPath(root, path, { ...target, [key]: value })
}

export const appendArrayItem = (root: JsonValue, path: JsonPath, value: JsonValue): JsonValue => {
  const target = getAtPath(root, path)
  if (!Array.isArray(target)) throw new Error('El nodo seleccionado no es un array')
  return setAtPath(root, path, [...target, value])
}

export const moveArrayItem = (root: JsonValue, path: JsonPath, direction: -1 | 1): { value: JsonValue; path: JsonPath } => {
  const index = path[path.length - 1]
  if (typeof index !== 'number') return { value: root, path }
  const parentPath = path.slice(0, -1)
  const parent = getAtPath(root, parentPath)
  if (!Array.isArray(parent)) return { value: root, path }
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= parent.length) return { value: root, path }
  const copy = [...parent]
  ;[copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]]
  return { value: setAtPath(root, parentPath, copy), path: [...parentPath, nextIndex] }
}

export const duplicateAtPath = (root: JsonValue, path: JsonPath): { value: JsonValue; path: JsonPath } => {
  if (path.length === 0) return { value: root, path }
  const parentPath = path.slice(0, -1)
  const parent = getAtPath(root, parentPath)
  const current = getAtPath(root, path)
  const last = path[path.length - 1]

  if (Array.isArray(parent) && typeof last === 'number') {
    const copy = [...parent]
    copy.splice(last + 1, 0, cloneJson(current))
    return { value: setAtPath(root, parentPath, copy), path: [...parentPath, last + 1] }
  }

  if (parent !== null && typeof parent === 'object' && !Array.isArray(parent) && typeof last === 'string') {
    let candidate = `${last}_copy`
    let n = 2
    while (Object.prototype.hasOwnProperty.call(parent, candidate)) candidate = `${last}_copy_${n++}`
    const copy = { ...parent, [candidate]: cloneJson(current) }
    return { value: setAtPath(root, parentPath, copy), path: [...parentPath, candidate] }
  }

  return { value: root, path }
}
