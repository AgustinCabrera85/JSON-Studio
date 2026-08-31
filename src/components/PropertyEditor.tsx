import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  LinkOutlined,
  PlusOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Collapse,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { isUuid } from '../analyzer/analyzeJson'
import type { JsonAnalysisResult } from '../analyzer/types'
import { useI18n } from '../i18n'
import type { JsonPath, JsonType, JsonValue } from '../types/json'
import { defaultValueForType, detectType, getAtPath } from '../utils/json'

interface PropertyEditorProps {
  root: JsonValue
  analysis: JsonAnalysisResult
  selectedPath: JsonPath
  onRename: (name: string) => void
  onChangeType: (type: JsonType) => void
  onChangeValue: (value: JsonValue) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (direction: -1 | 1) => void
  onAddProperty: (key: string, type: JsonType) => void
  onAddArrayItem: (type: JsonType) => void
  onNavigateSample?: () => void
}

const normalizeUuid = (value: string) => value.replace(/[{}]/g, '').toLowerCase()

export const PropertyEditor = ({
  root,
  analysis,
  selectedPath,
  onRename,
  onChangeType,
  onChangeValue,
  onDelete,
  onDuplicate,
  onMove,
  onAddProperty,
  onAddArrayItem,
  onNavigateSample,
}: PropertyEditorProps) => {
  const [addOpen, setAddOpen] = useState(false)
  const [newKey, setNewKey] = useState('new_field')
  const [newType, setNewType] = useState<JsonType>('string')
  const [keyDraft, setKeyDraft] = useState('')
  const [messageApi, contextHolder] = message.useMessage()
  const { t } = useI18n()

  const typeOptions: Array<{ value: JsonType; label: string }> = [
    { value: 'string', label: t('type.string') },
    { value: 'number', label: t('type.number') },
    { value: 'boolean', label: t('type.boolean') },
    { value: 'object', label: t('type.object') },
    { value: 'array', label: t('type.array') },
    { value: 'null', label: t('type.null') },
  ]

  const selected = useMemo(() => getAtPath(root, selectedPath), [root, selectedPath])
  const type = detectType(selected)
  const key = selectedPath.at(-1)
  const isRoot = selectedPath.length === 0
  const parent = !isRoot ? getAtPath(root, selectedPath.slice(0, -1)) : undefined
  const isArrayChild = Array.isArray(parent)
  const isObjectChild = !isRoot && parent !== null && typeof parent === 'object' && !Array.isArray(parent)
  const selectedUuid = typeof selected === 'string' && isUuid(selected) ? normalizeUuid(selected) : undefined
  const reference = selectedUuid ? analysis.uuidReferences.find(item => item.uuid === selectedUuid) : undefined

  const previewValue = (value: JsonValue): string => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return `[${t('common.elements', { count: value.length })}]`
    if (typeof value === 'object') return `{${t('common.properties', { count: Object.keys(value).length })}}`
    if (typeof value === 'string') return value || '""'
    return String(value)
  }

  useEffect(() => {
    setAddOpen(false)
  }, [selectedPath])

  useEffect(() => {
    setKeyDraft(isObjectChild ? String(key) : '')
  }, [isObjectChild, key, selectedPath])

  const safe = (fn: () => void) => {
    try { fn() } catch (error) { messageApi.error(error instanceof Error ? error.message : t('property.actionFailed')) }
  }

  const commitKeyDraft = () => {
    if (!isObjectChild || typeof key !== 'string') return
    const nextKey = keyDraft.trim()
    if (nextKey && nextKey !== key) safe(() => onRename(nextKey))
    else if (!nextKey) setKeyDraft(key)
  }

  const displayName = isRoot
    ? t('common.document')
    : typeof key === 'number'
      ? t('common.item', { number: key + 1 })
      : String(key)

  const valueControl = () => {
    if (type === 'string') {
      if (selectedUuid) {
        const options = analysis.uuidReferences.map(item => ({
          value: item.uuid,
          label: item.alias,
          title: `${item.alias} · ${item.uuid}`,
        }))
        return (
          <div className="reference-editor">
            <div className="reference-editor-label"><LinkOutlined /> {t('property.referenceDetected')}</div>
            <Select
              showSearch
              optionFilterProp="label"
              value={selectedUuid}
              options={options}
              placeholder={t('property.selectReference')}
              onChange={value => onChangeValue(value)}
              style={{ width: '100%' }}
            />
            {reference ? (
              <div className="reference-friendly-card">
                <div>
                  <Typography.Text type="secondary">{t('property.pointsTo')}</Typography.Text>
                  <strong>{reference.alias}</strong>
                </div>
                <Tag color={reference.unresolved ? 'warning' : 'success'}>{reference.unresolved ? t('common.unresolved') : t('common.resolved')}</Tag>
                <Typography.Text code copyable className="uuid-small">{selected as string}</Typography.Text>
                {reference.target && onNavigateSample && (
                  <Button type="link" size="small" onClick={onNavigateSample}>{t('property.viewDefinition')}</Button>
                )}
              </div>
            ) : (
              <Alert type="warning" showIcon message={t('property.guidMissing')} />
            )}
          </div>
        )
      }

      return <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={selected as string} onChange={e => onChangeValue(e.target.value)} />
    }
    if (type === 'number') {
      return <InputNumber style={{ width: '100%' }} value={selected as number} onChange={value => onChangeValue(value ?? 0)} />
    }
    if (type === 'boolean') {
      return (
        <div className="boolean-control">
          <Switch checked={selected as boolean} onChange={onChangeValue} />
          <span>{selected ? 'true' : 'false'} <Typography.Text type="secondary">({selected ? t('common.true') : t('common.false')})</Typography.Text></span>
        </div>
      )
    }
    if (type === 'null') {
      return <Alert type="info" showIcon message={t('property.nullValue')} />
    }
    return (
      <div className="container-summary-card">
        <strong>{type === 'object' ? t('type.object') : t('type.array')}</strong>
        <Typography.Text type="secondary">
          {type === 'object'
            ? t('common.properties', { count: Object.keys(selected as object).length })
            : t('common.elements', { count: (selected as JsonValue[]).length })}
        </Typography.Text>
      </div>
    )
  }

  return (
    <div className="property-editor friendly-property-editor">
      {contextHolder}
      <div className="inspector-heading">
        <Typography.Text type="secondary">{isObjectChild ? t('property.selectedProperty') : t('property.editing')}</Typography.Text>
        <Typography.Title level={4} className={isObjectChild ? 'json-key-heading' : undefined}>{displayName}</Typography.Title>
      </div>

      {isObjectChild && (
        <div className="key-value-summary" aria-label={t('property.keyValueSummaryAria')}>
          <div className="key-value-summary-cell">
            <span>{t('common.key')}</span>
            <code>{String(key)}</code>
          </div>
          <div className="key-value-summary-divider">→</div>
          <div className="key-value-summary-cell value-cell">
            <span>{t('common.value')}</span>
            <strong title={previewValue(selected)}>{previewValue(selected)}</strong>
          </div>
        </div>
      )}

      <Form layout="vertical">
        {isObjectChild && (
          <Form.Item
            label={t('property.keyLabel')}
            extra={t('property.keyHelp')}
          >
            <Input
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onPressEnter={commitKeyDraft}
              onBlur={commitKeyDraft}
            />
          </Form.Item>
        )}

        {type !== 'object' && type !== 'array' && (
          <Form.Item label={selectedUuid ? t('property.referenceValueLabel') : t('property.valueLabel')}>
            {valueControl()}
          </Form.Item>
        )}
        {(type === 'object' || type === 'array') && valueControl()}
      </Form>

      {(type === 'object' || type === 'array') && (
        <div className="inspector-primary-action">
          {type === 'object' ? (
            <Button block type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              {t('property.addProperty')}
            </Button>
          ) : (
            <Space.Compact block>
              <Select
                style={{ width: 230 }}
                value={newType}
                options={typeOptions}
                onChange={value => setNewType(value)}
              />
              <Button block type="primary" icon={<PlusOutlined />} onClick={() => safe(() => onAddArrayItem(newType))}>
                {t('property.addElement')}
              </Button>
            </Space.Compact>
          )}
        </div>
      )}

      {!isRoot && (
        <>
          <Divider />
          <Flex gap={8} wrap>
            <Button icon={<CopyOutlined />} onClick={onDuplicate}>{t('common.duplicate')}</Button>
            {isArrayChild && <Button icon={<UpOutlined />} onClick={() => onMove(-1)}>{t('common.up')}</Button>}
            {isArrayChild && <Button icon={<DownOutlined />} onClick={() => onMove(1)}>{t('common.down')}</Button>}
            <Button danger icon={<DeleteOutlined />} onClick={onDelete}>{t('common.delete')}</Button>
          </Flex>
        </>
      )}

      <Collapse
        ghost
        className="advanced-collapse"
        items={[{
          key: 'advanced',
          label: t('property.advanced'),
          children: (
            <Form layout="vertical">
              <Form.Item label="JSON path">
                <Input value={isRoot ? '$' : `$${selectedPath.map(segment => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('')}`} disabled />
              </Form.Item>
              <Form.Item
                label={t('property.jsonType')}
                extra={t('property.jsonTypeHelp')}
              >
                <Select value={type} options={typeOptions} onChange={onChangeType} />
              </Form.Item>
            </Form>
          ),
        }]}
      />

      <Modal
        title={t('property.addProperty')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        okText={t('common.add')}
        cancelText={t('common.cancel')}
        onOk={() => safe(() => {
          onAddProperty(newKey, newType)
          setAddOpen(false)
          setNewKey('new_field')
          setNewType('string')
        })}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Typography.Text type="secondary">{t('property.keyLabel')}</Typography.Text>
            <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={t('property.newKeyPlaceholder')} />
          </div>
          <div>
            <Typography.Text type="secondary">{t('property.jsonType')}</Typography.Text>
            <Select style={{ width: '100%' }} value={newType} options={typeOptions} onChange={setNewType} />
          </div>
          <Typography.Text type="secondary">{t('property.initialValue', { value: JSON.stringify(defaultValueForType(newType)) })}</Typography.Text>
        </Space>
      </Modal>
    </div>
  )
}
