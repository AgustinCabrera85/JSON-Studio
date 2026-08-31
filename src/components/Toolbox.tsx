import {
  ApartmentOutlined,
  BarsOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  FontSizeOutlined,
  NumberOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Collapse, Empty, Input, Segmented, Tag, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { DiscoveredStructure } from '../analyzer/types'
import type { JsonValue } from '../types/json'
import type { GuidedComponent, ToolboxDropPayload } from '../types/toolbox'
import { useI18n } from '../i18n'
import { GuidedStructureModal } from './GuidedStructureModal'

interface ToolboxProps {
  structures: DiscoveredStructure[]
  guidedComponents: GuidedComponent[]
  onCreateGuided: (component: GuidedComponent) => void
  onDeleteGuided: (id: string) => void
  onInsert: (payload: ToolboxDropPayload) => void
  onDragStateChange?: (payload: ToolboxDropPayload | null) => void
}

const primitiveDefinitions: Array<{ name: string; value: JsonValue; icon: React.ReactNode; descriptionKey: string }> = [
  { name: 'string', value: '', icon: <FontSizeOutlined />, descriptionKey: 'type.stringDescription' },
  { name: 'number', value: 0, icon: <NumberOutlined />, descriptionKey: 'type.numberDescription' },
  { name: 'boolean', value: false, icon: <CheckSquareOutlined />, descriptionKey: 'type.booleanDescription' },
  { name: 'object', value: {}, icon: <ApartmentOutlined />, descriptionKey: 'type.objectDescription' },
  { name: 'array', value: [], icon: <BarsOutlined />, descriptionKey: 'type.arrayDescription' },
  { name: 'null', value: null, icon: <span className="null-type-icon">∅</span>, descriptionKey: 'type.nullDescription' },
]

const drag = (
  event: React.DragEvent,
  payload: ToolboxDropPayload,
  onDragStateChange?: (payload: ToolboxDropPayload | null) => void,
) => {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-json-studio-toolbox', JSON.stringify(payload))
  event.dataTransfer.setData('text/plain', JSON.stringify(payload.value, null, 2))
  onDragStateChange?.(payload)
}

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, char => char.toUpperCase())

const StructureCard = ({
  structure,
  mode,
  onInsert,
  onDragStateChange,
}: {
  structure: DiscoveredStructure
  mode: 'minimal' | 'recommended'
  onInsert: (payload: ToolboxDropPayload) => void
  onDragStateChange?: (payload: ToolboxDropPayload | null) => void
}) => {
  const { t } = useI18n()
  const value = mode === 'minimal' ? structure.minimalValue : structure.recommendedValue
  const payload: ToolboxDropPayload = {
    name: structure.name,
    value,
    source: structure.id,
    contexts: structure.contexts,
    parentStructures: structure.parentStructures,
    kind: 'structure',
  }
  const required = structure.fields.filter(field => field.frequency === 'required').length
  const optional = structure.fields.length - required
  const primaryContext = structure.contexts[0] && structure.contexts[0] !== structure.name
    ? humanize(structure.contexts[0])
    : undefined
  const parent = structure.parentStructures[0]

  return (
    <article
      className={`toolbox-card friendly-component-card ${parent ? 'nested-component-card' : 'root-component-card'}`}
      draggable
      onDragStart={event => drag(event, payload, onDragStateChange)}
      onDragEnd={() => onDragStateChange?.(null)}
    >
      <div className="toolbox-card-main">
        <div className="component-icon"><ApartmentOutlined /></div>
        <div className="toolbox-card-copy">
          <strong>{structure.name}</strong>
          <Typography.Text type="secondary">
            {primaryContext ? `${primaryContext} · ` : ''}{structure.instances} {structure.instances === 1 ? t('common.foundSingular') : t('common.foundPlural')}
          </Typography.Text>
        </div>
        <Tooltip title={t('toolbox.autoAdd')}>
          <Button
            className="component-add-button"
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onInsert(payload)}
          />
        </Tooltip>
      </div>

      {parent && (
        <div className="component-parent-hint">
          <span>↳</span>
          <Typography.Text type="secondary">{t('toolbox.inside', { parent })}</Typography.Text>
        </div>
      )}

      <div className="component-meta-row">
        <Tag color="success">{required} {t('common.required')}</Tag>
        {optional > 0 && <Tag>{optional} {t('common.optional')}</Tag>}
      </div>
      <div className="component-field-preview">
        {structure.fields.slice(0, 4).map(field => <span key={field.name}>{field.name}</span>)}
        {structure.fields.length > 4 && <span>+{structure.fields.length - 4}</span>}
      </div>
    </article>
  )
}

const GuidedCard = ({
  component,
  onInsert,
  onDelete,
  onDragStateChange,
}: {
  component: GuidedComponent
  onInsert: (payload: ToolboxDropPayload) => void
  onDelete: (id: string) => void
  onDragStateChange?: (payload: ToolboxDropPayload | null) => void
}) => {
  const { t } = useI18n()
  const payload: ToolboxDropPayload = {
    name: component.name,
    value: component.value,
    source: component.id,
    kind: 'guided',
  }
  const fieldNames = component.value !== null && typeof component.value === 'object' && !Array.isArray(component.value)
    ? Object.keys(component.value)
    : []

  return (
    <article
      className="toolbox-card friendly-component-card guided-component-card"
      draggable
      onDragStart={event => drag(event, payload, onDragStateChange)}
      onDragEnd={() => onDragStateChange?.(null)}
    >
      <div className="toolbox-card-main">
        <div className="component-icon guided-component-icon"><ApartmentOutlined /></div>
        <div className="toolbox-card-copy">
          <strong>{component.name}</strong>
          <Typography.Text type="secondary">{t('toolbox.createdGuided')}</Typography.Text>
        </div>
        <Tooltip title={t('toolbox.autoAdd')}>
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onInsert(payload)} />
        </Tooltip>
        <Tooltip title={t('common.delete')}>
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={event => {
              event.stopPropagation()
              onDelete(component.id)
            }}
          />
        </Tooltip>
      </div>
      <div className="component-field-preview">
        {fieldNames.slice(0, 5).map(field => <span key={field}>{field}</span>)}
        {fieldNames.length > 5 && <span>+{fieldNames.length - 5}</span>}
      </div>
    </article>
  )
}

export const Toolbox = ({
  structures,
  guidedComponents,
  onCreateGuided,
  onDeleteGuided,
  onInsert,
  onDragStateChange,
}: ToolboxProps) => {
  const { t } = useI18n()
  const [mode, setMode] = useState<'minimal' | 'recommended'>('recommended')
  const [search, setSearch] = useState('')
  const [guidedOpen, setGuidedOpen] = useState(false)

  const visibleStructures = useMemo(() => structures
    .filter(structure => !structure.contexts.includes('Root'))
    .filter(structure => {
      const haystack = `${structure.name} ${structure.contexts.join(' ')} ${structure.parentStructures.join(' ')} ${structure.fields.map(field => field.name).join(' ')}`.toLowerCase()
      return haystack.includes(search.toLowerCase())
    }), [structures, search])

  const visibleGuided = useMemo(() => guidedComponents.filter(component => {
    const fieldNames = component.value !== null && typeof component.value === 'object' && !Array.isArray(component.value)
      ? Object.keys(component.value).join(' ')
      : ''
    return `${component.name} ${fieldNames}`.toLowerCase().includes(search.toLowerCase())
  }), [guidedComponents, search])

  const primaryStructures = visibleStructures.filter(structure => structure.parentStructures.length === 0)
  const nestedStructures = visibleStructures.filter(structure => structure.parentStructures.length > 0)

  return (
    <div className="toolbox friendly-toolbox">
      <GuidedStructureModal open={guidedOpen} onClose={() => setGuidedOpen(false)} onCreate={onCreateGuided} />

      <div className="toolbox-intro">
        <Typography.Title level={5}>{t('toolbox.title')}</Typography.Title>
        <Typography.Text type="secondary">{t('toolbox.descriptionV8')}</Typography.Text>
      </div>

      <Button
        block
        type="primary"
        icon={<PlusOutlined />}
        className="create-component-button"
        onClick={() => setGuidedOpen(true)}
      >
        {t('toolbox.createComponent')}
      </Button>

      <div className="toolbox-controls">
        <Input
          allowClear
          value={search}
          prefix={<SearchOutlined />}
          placeholder={t('toolbox.search')}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      {visibleGuided.length > 0 && (
        <>
          <div className="toolbox-section-title">{t('toolbox.myComponents')}</div>
          <div className="toolbox-list">
            {visibleGuided.map(component => (
              <GuidedCard
                key={component.id}
                component={component}
                onInsert={onInsert}
                onDelete={onDeleteGuided}
                onDragStateChange={onDragStateChange}
              />
            ))}
          </div>
        </>
      )}

      {structures.length > 0 && (
        <div className="sample-component-controls">
          <div className="toolbox-section-title sample-components-title">{t('toolbox.sampleComponents')}</div>
          <Segmented
            block
            value={mode}
            options={[
              { label: t('toolbox.essential'), value: 'minimal' },
              { label: t('toolbox.complete'), value: 'recommended' },
            ]}
            onChange={value => setMode(value as 'minimal' | 'recommended')}
          />
          <Typography.Text type="secondary" className="toolbox-mode-help">
            {mode === 'minimal' ? t('toolbox.essentialHelp') : t('toolbox.completeHelp')}
          </Typography.Text>
        </div>
      )}

      {structures.length > 0 && visibleStructures.length === 0 && visibleGuided.length === 0 && search && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('toolbox.noMatches')} />
      )}

      {primaryStructures.length > 0 && (
        <>
          <div className="toolbox-section-title">{t('toolbox.mainComponents')}</div>
          <div className="toolbox-list">
            {primaryStructures.map(structure => (
              <StructureCard
                key={structure.id}
                structure={structure}
                mode={mode}
                onInsert={onInsert}
                onDragStateChange={onDragStateChange}
              />
            ))}
          </div>
        </>
      )}

      {nestedStructures.length > 0 && (
        <>
          <div className="toolbox-section-title nested-section-title">{t('toolbox.internalComponents')}</div>
          <div className="toolbox-list">
            {nestedStructures.map(structure => (
              <StructureCard
                key={structure.id}
                structure={structure}
                mode={mode}
                onInsert={onInsert}
                onDragStateChange={onDragStateChange}
              />
            ))}
          </div>
        </>
      )}

      {structures.length === 0 && guidedComponents.length === 0 && (
        <div className="toolbox-start-hint">
          <ApartmentOutlined />
          <strong>{t('toolbox.startWithoutSample')}</strong>
          <span>{t('toolbox.startWithoutSampleHelp')}</span>
        </div>
      )}

      <Collapse
        ghost
        className="basic-types-collapse"
        defaultActiveKey={['basic']}
        items={[{
          key: 'basic',
          label: t('toolbox.jsonTypes'),
          children: (
            <div className="primitive-grid">
              {primitiveDefinitions.map(item => {
                const payload: ToolboxDropPayload = { name: item.name, value: item.value, source: 'primitive', kind: 'primitive' }
                return (
                  <button
                    type="button"
                    key={item.name}
                    className="primitive-card"
                    draggable
                    onDragStart={event => drag(event, payload, onDragStateChange)}
                    onDragEnd={() => onDragStateChange?.(null)}
                    onDoubleClick={() => onInsert(payload)}
                  >
                    {item.icon}
                    <span>
                      <strong>{item.name}</strong>
                      <small>{t(item.descriptionKey)}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ),
        }]}
      />
    </div>
  )
}
