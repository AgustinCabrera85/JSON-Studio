import { useCallback, useMemo, useState } from 'react'
import type { JsonValue } from '../types/json'
import { cloneJson } from '../utils/json'

interface Snapshot {
  value: JsonValue
}

export const useJsonHistory = (initialValue: JsonValue) => {
  const [past, setPast] = useState<Snapshot[]>([])
  const [present, setPresent] = useState<JsonValue>(cloneJson(initialValue))
  const [future, setFuture] = useState<Snapshot[]>([])

  const commit = useCallback((next: JsonValue) => {
    setPresent(current => {
      if (JSON.stringify(current) === JSON.stringify(next)) return current
      setPast(items => [...items.slice(-49), { value: cloneJson(current) }])
      setFuture([])
      return cloneJson(next)
    })
  }, [])

  const replace = useCallback((next: JsonValue) => {
    setPast([])
    setFuture([])
    setPresent(cloneJson(next))
  }, [])

  const undo = useCallback(() => {
    setPast(items => {
      const previous = items.at(-1)
      if (!previous) return items
      setPresent(current => {
        setFuture(next => [{ value: cloneJson(current) }, ...next].slice(0, 50))
        return cloneJson(previous.value)
      })
      return items.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture(items => {
      const next = items[0]
      if (!next) return items
      setPresent(current => {
        setPast(prev => [...prev.slice(-49), { value: cloneJson(current) }])
        return cloneJson(next.value)
      })
      return items.slice(1)
    })
  }, [])

  return useMemo(() => ({
    value: present,
    commit,
    replace,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }), [present, commit, replace, undo, redo, past.length, future.length])
}
