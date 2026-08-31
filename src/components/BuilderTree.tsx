import {
  ApartmentOutlined,
  BarsOutlined,
  CheckSquareOutlined,
  FontSizeOutlined,
  NumberOutlined,
} from '@ant-design/icons'
import { Tag, Typography } from 'antd'
import { useState } from 'react'
import type { JsonPath, JsonValue } from '../types/json'
import type { ToolboxDropPayload } from '../types/toolbox'
import { detectType, pathToKey } from '../utils/json'

export type { ToolboxDropPayload } from '../types/toolbox'

interface BuilderTreeProps {
  value: JsonValue
  selectedPath: JsonPath
  onSelect: (path: JsonPath) => void
  onDropValue: (path: JsonPath, payload: ToolboxDropPayload) => void
}

const iconFor = (value: JsonValue) => {
  const type = detectType(value)
  if (type === 'object') return <ApartmentOutlined />
  if (type === 'array') return <BarsOutlined />
  if (type === 'string') return <FontSizeOutlined />
  if (type === 'number') return <NumberOutlined />
  if (type === 'boolean') return <CheckSquareOutlined />
  return <span>∅</span>
}

const preview = (value: JsonValue) => {
  const type = detectType(value)
  if (type === 'object') return `${Object.keys(value as object).length} props`
  if (type === 'array') return `${(value as JsonValue[]).length} items`
  if (type === 'string') {
    const text = value as string
    return text.length > 34 ? `“${text.slice(0, 31)}…”` : `“${text}”`
  }
  return String(value)
}

const Node = ({
  value,
  label,
  path,
  depth,
  selectedPath,
  onSelect,
  onDropValue,
}: {
  value: JsonValue
  label: string
  path: JsonPath
  depth: number
  selectedPath: JsonPath
  onSelect: (path: JsonPath) => void
  onDropValue: (path: JsonPath, payload: ToolboxDropPayload) => void
}) => {
  const [dropActive, setDropActive] = useState(false)
  const type = detectType(value)
  const container = type === 'object' || type === 'array'
  const selected = pathToKey(path) === pathToKey(selectedPath)

  const children = type === 'object'
    ? Object.entries(value as Record<string, JsonValue>).map(([key, child]) => ({ key, label: key, value: child, path: [...path, key] as JsonPath }))
    : type === 'array'
      ? (value as JsonValue[]).map((child, index) => ({ key: String(index), label: `[${index}]`, value: child, path: [...path, index] as JsonPath }))
      : []

  return (
    <div className="builder-node">
      <div
        className={`builder-node-row ${selected ? 'selected' : ''} ${dropActive ? 'drop-active' : ''}`}
        style={{ paddingLeft: 10 + depth * 18 }}
        onClick={() => onSelect(path)}
        onDragOver={event => {
          if (!container) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropActive(true)
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={event => {
          if (!container) return
          event.preventDefault()
          event.stopPropagation()
          setDropActive(false)
          const raw = event.dataTransfer.getData('application/x-json-studio-toolbox')
          if (!raw) return
          try {
            onDropValue(path, JSON.parse(raw) as ToolboxDropPayload)
          } catch {
            // Ignore malformed external drag data.
          }
        }}
      >
        <span className="builder-node-icon">{iconFor(value)}</span>
        <strong className="builder-node-label">{label}</strong>
        <Typography.Text type="secondary" className="builder-node-preview">{preview(value)}</Typography.Text>
        {container && <Tag className="drop-hint">drop</Tag>}
      </div>
      {children.map(child => (
        <Node
          key={`${pathToKey(child.path)}-${child.key}`}
          value={child.value}
          label={child.label}
          path={child.path}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDropValue={onDropValue}
        />
      ))}
    </div>
  )
}

export const BuilderTree = ({ value, selectedPath, onSelect, onDropValue }: BuilderTreeProps) => (
  <div className="builder-tree">
    <Node
      value={value}
      label="root"
      path={[]}
      depth={0}
      selectedPath={selectedPath}
      onSelect={onSelect}
      onDropValue={onDropValue}
    />
  </div>
)
