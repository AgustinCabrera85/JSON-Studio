import {
  ApartmentOutlined,
  BarsOutlined,
  CheckCircleOutlined,
  DragOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { JsonAnalysisResult } from '../analyzer/types'
import { useI18n } from '../i18n'
import type { JsonObject, JsonPath, JsonValue } from '../types/json'
import type { ToolboxDropPayload } from '../types/toolbox'
import { detectType, pathToKey } from '../utils/json'

interface VisualBuilderProps {
  value: JsonValue
  analysis: JsonAnalysisResult
  selectedPath: JsonPath
  draggedTool: ToolboxDropPayload | null
  preferredTargetPath: JsonPath | null
  onSelect: (path: JsonPath) => void
  onOpenInspector: (path: JsonPath) => void
  onDropValue: (path: JsonPath, payload: ToolboxDropPayload) => void
  onSmartDrop: (payload: ToolboxDropPayload) => void
}

const normalizeUuid = (value: string) => value.replace(/[{}]/g, '').toLowerCase()

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, char => char.toUpperCase())

const objectDisplayName = (value: JsonObject, fallback: string) => {
  for (const key of ['name', 'title', 'label', 'display_name', 'displayName']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  for (const key of ['category', 'type', 'kind', 'toolBoxType', 'toolboxType']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return humanize(candidate)
    if (Array.isArray(candidate) && candidate.length === 1 && typeof candidate[0] === 'string') return humanize(candidate[0])
  }
  return humanize(fallback)
}

const isContainer = (value: JsonValue) => {
  const type = detectType(value)
  return type === 'object' || type === 'array'
}

const isPrimitive = (value: JsonValue) => !isContainer(value)

const readPayload = (event: React.DragEvent): ToolboxDropPayload | null => {
  const raw = event.dataTransfer.getData('application/x-json-studio-toolbox')
  if (!raw) return null
  try { return JSON.parse(raw) as ToolboxDropPayload } catch { return null }
}

const DropZone = ({
  path,
  label,
  visible,
  preferred = false,
  large = false,
  onDropValue,
}: {
  path: JsonPath
  label: string
  visible: boolean
  preferred?: boolean
  large?: boolean
  onDropValue: (path: JsonPath, payload: ToolboxDropPayload) => void
}) => {
  const [active, setActive] = useState(false)
  const { t } = useI18n()

  return (
    <div
      className={`visual-drop-zone ${visible ? 'visible' : ''} ${active ? 'active' : ''} ${preferred ? 'preferred' : ''} ${large ? 'large' : ''}`}
      onDragOver={event => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
        setActive(true)
      }}
      onDragLeave={event => {
        event.stopPropagation()
        setActive(false)
      }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
        setActive(false)
        const payload = readPayload(event)
        if (payload) onDropValue(path, payload)
      }}
    >
      <span className="drop-zone-icon">{active ? <PlusOutlined /> : <DragOutlined />}</span>
      <span className="drop-zone-copy">
        <strong>{active ? t('visual.dropToAdd') : label}</strong>
        {preferred && !active && <small>{t('visual.suggestedDestination')}</small>}
      </span>
    </div>
  )
}

const PrimitiveValue = ({ value, analysis }: { value: JsonValue; analysis: JsonAnalysisResult }) => {
  const { t } = useI18n()
  if (typeof value === 'string') {
    const reference = analysis.uuidReferences.find(item => item.uuid === normalizeUuid(value))
    if (reference) {
      return (
        <span className="reference-pill">
          <LinkOutlined />
          <span>{reference.alias}</span>
          <Typography.Text type="secondary" className="reference-pill-id">{value.slice(0, 8)}…</Typography.Text>
        </span>
      )
    }
  }

  if (typeof value === 'boolean') return <Tag color={value ? 'success' : 'default'}>{value ? t('common.yes') : t('common.no')}</Tag>
  if (value === null) return <Tag>Null</Tag>
  if (typeof value === 'string') return <span className="visual-field-value">{value || t('common.empty')}</span>
  return <span className="visual-field-value">{String(value)}</span>
}

interface SharedNodeProps {
  analysis: JsonAnalysisResult
  selectedPath: JsonPath
  draggedTool: ToolboxDropPayload | null
  preferredTargetPath: JsonPath | null
  onSelect: (path: JsonPath) => void
  onOpenInspector: (path: JsonPath) => void
  onDropValue: (path: JsonPath, payload: ToolboxDropPayload) => void
}

const ObjectCard = ({
  value,
  label,
  path,
  depth,
  analysis,
  selectedPath,
  draggedTool,
  preferredTargetPath,
  onSelect,
  onOpenInspector,
  onDropValue,
}: SharedNodeProps & {
  value: JsonObject
  label: string
  path: JsonPath
  depth: number
}) => {
  const { t } = useI18n()
  const selected = pathToKey(path) === pathToKey(selectedPath)
  const entries = Object.entries(value)
  const primitiveEntries = entries.filter(([, child]) => isPrimitive(child))
  const nestedEntries = entries.filter(([, child]) => isContainer(child))
  const title = path.length === 0 ? t('common.document') : objectDisplayName(value, label)
  const subtitle = path.length === 0 ? t('visual.rootStructure') : humanize(label)
  const preferred = !!draggedTool && !!preferredTargetPath && pathToKey(path) === pathToKey(preferredTargetPath)

  return (
    <article
      className={`visual-object-card ${selected ? 'selected' : ''} depth-${Math.min(depth, 3)} ${preferred ? 'smart-target' : ''}`}
      onClick={event => {
        event.stopPropagation()
        onSelect(path)
      }}
    >
      <header className="visual-card-header">
        <div className="visual-card-icon"><ApartmentOutlined /></div>
        <div className="visual-card-title-wrap">
          <Typography.Text strong className="visual-card-title">{title}</Typography.Text>
          <Typography.Text type="secondary" className="visual-card-subtitle">{subtitle} · {t('common.fields', { count: entries.length })}</Typography.Text>
        </div>
        <Button
          type="text"
          size="small"
          onClick={event => {
            event.stopPropagation()
            onOpenInspector(path)
          }}
        >{t('common.edit')}</Button>
      </header>

      {entries.length === 0 && !draggedTool && (
        <div className="empty-object-hint">
          <ApartmentOutlined />
          <span>{t('visual.objectEmpty')}</span>
        </div>
      )}

      {primitiveEntries.length > 0 && (
        <div className="visual-fields-grid">
          {primitiveEntries.map(([key, child]) => {
            const childPath = [...path, key] as JsonPath
            const childSelected = pathToKey(childPath) === pathToKey(selectedPath)
            return (
              <button
                type="button"
                key={key}
                className={`visual-field ${childSelected ? 'selected' : ''}`}
                onClick={event => {
                  event.stopPropagation()
                  onSelect(childPath)
                  onOpenInspector(childPath)
                }}
              >
                <span className="visual-field-key-caption">{t('visual.key')}</span>
                <code className="visual-field-key" title={key}>{key}</code>
                <span className="visual-field-value-caption">{t('visual.value')}</span>
                <PrimitiveValue value={child} analysis={analysis} />
              </button>
            )
          })}
        </div>
      )}

      {nestedEntries.length > 0 && (
        <div className="visual-nested-stack">
          {nestedEntries.map(([key, child]) => (
            Array.isArray(child) ? (
              <ArrayCollection
                key={key}
                value={child}
                label={key}
                path={[...path, key]}
                depth={depth + 1}
                analysis={analysis}
                selectedPath={selectedPath}
                draggedTool={draggedTool}
                preferredTargetPath={preferredTargetPath}
                onSelect={onSelect}
                onOpenInspector={onOpenInspector}
                onDropValue={onDropValue}
              />
            ) : (
              <ObjectCard
                key={key}
                value={child as JsonObject}
                label={key}
                path={[...path, key]}
                depth={depth + 1}
                analysis={analysis}
                selectedPath={selectedPath}
                draggedTool={draggedTool}
                preferredTargetPath={preferredTargetPath}
                onSelect={onSelect}
                onOpenInspector={onOpenInspector}
                onDropValue={onDropValue}
              />
            )
          ))}
        </div>
      )}

      <DropZone
        path={path}
        label={path.length === 0 ? t('visual.addToDocument') : t('visual.addInside', { name: title })}
        visible={!!draggedTool}
        preferred={preferred}
        onDropValue={onDropValue}
      />
    </article>
  )
}

const ArrayCollection = ({
  value,
  label,
  path,
  depth,
  analysis,
  selectedPath,
  draggedTool,
  preferredTargetPath,
  onSelect,
  onOpenInspector,
  onDropValue,
}: SharedNodeProps & {
  value: JsonValue[]
  label: string
  path: JsonPath
  depth: number
}) => {
  const { t } = useI18n()
  const selected = pathToKey(path) === pathToKey(selectedPath)
  const allPrimitive = value.length > 0 && value.every(isPrimitive)
  const isRoot = path.length === 0
  const preferred = !!draggedTool && !!preferredTargetPath && pathToKey(path) === pathToKey(preferredTargetPath)
  const collectionName = isRoot ? t('common.document') : humanize(label)

  return (
    <section
      className={`visual-array-section ${selected ? 'selected' : ''} ${isRoot ? 'root-array-section' : ''} ${preferred ? 'smart-target' : ''}`}
      onClick={event => {
        event.stopPropagation()
        onSelect(path)
      }}
    >
      <header className="visual-collection-header">
        <div>
          <span className="visual-collection-kicker"><BarsOutlined /> {isRoot ? t('visual.rootCollection') : t('visual.collection')}</span>
          <Typography.Title level={5} className="visual-collection-title">{collectionName}</Typography.Title>
          {isRoot && <Typography.Text type="secondary" className="root-collection-help">{t('visual.rootCollectionHelp')}</Typography.Text>}
        </div>
        <div className="visual-collection-actions">
          <Tag>{value.length === 1 ? t('common.element', { count: value.length }) : t('common.elements', { count: value.length })}</Tag>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={event => {
              event.stopPropagation()
              onSelect(path)
              onOpenInspector(path)
            }}
          >{t('visual.add')}</Button>
        </div>
      </header>

      {value.length === 0 ? (
        <div className={`empty-collection ${isRoot ? 'root-empty-collection' : ''}`}>
          <DragOutlined />
          <strong>{isRoot ? t('visual.dragHere') : t('visual.collectionEmpty')}</strong>
          <span>{isRoot ? t('visual.rootEmptyHelp') : t('visual.collectionEmptyHelp')}</span>
        </div>
      ) : allPrimitive ? (
        <div className="primitive-collection">
          {value.map((child, index) => {
            const childPath = [...path, index] as JsonPath
            return (
              <button
                type="button"
                key={index}
                className={`primitive-chip ${pathToKey(childPath) === pathToKey(selectedPath) ? 'selected' : ''}`}
                onClick={event => {
                  event.stopPropagation()
                  onSelect(childPath)
                  onOpenInspector(childPath)
                }}
              >
                <PrimitiveValue value={child} analysis={analysis} />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="collection-cards">
          {value.map((child, index) => {
            const childPath = [...path, index] as JsonPath
            if (Array.isArray(child)) {
              return (
                <ArrayCollection
                  key={index}
                  value={child}
                  label={`${humanize(label)} ${index + 1}`}
                  path={childPath}
                  depth={depth + 1}
                  analysis={analysis}
                  selectedPath={selectedPath}
                  draggedTool={draggedTool}
                  preferredTargetPath={preferredTargetPath}
                  onSelect={onSelect}
                  onOpenInspector={onOpenInspector}
                  onDropValue={onDropValue}
                />
              )
            }
            if (child !== null && typeof child === 'object') {
              return (
                <ObjectCard
                  key={index}
                  value={child as JsonObject}
                  label={`${humanize(label)} ${index + 1}`}
                  path={childPath}
                  depth={depth + 1}
                  analysis={analysis}
                  selectedPath={selectedPath}
                  draggedTool={draggedTool}
                  preferredTargetPath={preferredTargetPath}
                  onSelect={onSelect}
                  onOpenInspector={onOpenInspector}
                  onDropValue={onDropValue}
                />
              )
            }
            return null
          })}
        </div>
      )}

      <DropZone
        path={path}
        label={isRoot ? t('visual.addComponentToDocument') : t('visual.addToCollection', { name: humanize(label) })}
        visible={!!draggedTool || value.length === 0}
        preferred={preferred}
        large={isRoot && value.length === 0}
        onDropValue={onDropValue}
      />
    </section>
  )
}

export const VisualBuilder = ({
  value,
  analysis,
  selectedPath,
  draggedTool,
  preferredTargetPath,
  onSelect,
  onOpenInspector,
  onDropValue,
  onSmartDrop,
}: VisualBuilderProps) => {
  const [canvasActive, setCanvasActive] = useState(false)
  const { t } = useI18n()

  const content = useMemo(() => {
    if (Array.isArray(value)) {
      return (
        <ArrayCollection
          value={value}
          label="Root"
          path={[]}
          depth={0}
          analysis={analysis}
          selectedPath={selectedPath}
          draggedTool={draggedTool}
          preferredTargetPath={preferredTargetPath}
          onSelect={onSelect}
          onOpenInspector={onOpenInspector}
          onDropValue={onDropValue}
        />
      )
    }
    if (value !== null && typeof value === 'object') {
      return (
        <ObjectCard
          value={value as JsonObject}
          label="Root"
          path={[]}
          depth={0}
          analysis={analysis}
          selectedPath={selectedPath}
          draggedTool={draggedTool}
          preferredTargetPath={preferredTargetPath}
          onSelect={onSelect}
          onOpenInspector={onOpenInspector}
          onDropValue={onDropValue}
        />
      )
    }
    return (
      <div className="primitive-root-card">
        <CheckCircleOutlined />
        <div>
          <Typography.Title level={5}>{t('visual.rootValue')}</Typography.Title>
          <PrimitiveValue value={value} analysis={analysis} />
        </div>
      </div>
    )
  }, [value, analysis, selectedPath, draggedTool, preferredTargetPath, onSelect, onOpenInspector, onDropValue, t])

  return (
    <div
      className={`visual-builder-canvas ${draggedTool ? 'dragging-component' : ''} ${canvasActive ? 'canvas-drop-active' : ''}`}
      onDragOver={event => {
        if (!draggedTool) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setCanvasActive(true)
      }}
      onDragLeave={event => {
        if (event.currentTarget === event.target) setCanvasActive(false)
      }}
      onDrop={event => {
        if (!draggedTool) return
        event.preventDefault()
        setCanvasActive(false)
        const payload = readPayload(event)
        if (payload) onSmartDrop(payload)
      }}
    >
      {draggedTool && (
        <div className="drag-guidance-banner">
          <DragOutlined />
          <span>{t('visual.dragGuidance', { name: draggedTool.name })}</span>
        </div>
      )}
      {content}
    </div>
  )
}
