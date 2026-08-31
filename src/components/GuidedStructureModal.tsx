import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { JsonObject, JsonType, JsonValue } from '../types/json'
import type { GuidedComponent } from '../types/toolbox'
import { defaultValueForType } from '../utils/json'

interface GuidedStructureModalProps {
  open: boolean
  onClose: () => void
  onCreate: (component: GuidedComponent) => void
}

interface FieldDraft {
  id: string
  key: string
  type: JsonType
  value: JsonValue
}

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `guided-${Date.now()}-${Math.random().toString(16).slice(2)}`

const createField = (): FieldDraft => ({
  id: makeId(),
  key: 'newField',
  type: 'string',
  value: '',
})

export const GuidedStructureModal = ({ open, onClose, onCreate }: GuidedStructureModalProps) => {
  const { t } = useI18n()
  const [messageApi, contextHolder] = message.useMessage()
  const [name, setName] = useState(() => t('guided.defaultName'))
  const [fields, setFields] = useState<FieldDraft[]>([createField()])

  const typeOptions = useMemo<Array<{ value: JsonType; label: string }>>(() => [
    { value: 'string', label: t('type.string') },
    { value: 'number', label: t('type.number') },
    { value: 'boolean', label: t('type.boolean') },
    { value: 'object', label: t('type.object') },
    { value: 'array', label: t('type.array') },
    { value: 'null', label: t('type.null') },
  ], [t])

  const preview = useMemo<JsonObject>(() => {
    const result: JsonObject = {}
    fields.forEach(field => {
      const key = field.key.trim()
      if (key && !Object.prototype.hasOwnProperty.call(result, key)) result[key] = field.value
    })
    return result
  }, [fields])

  const updateField = (id: string, patch: Partial<FieldDraft>) => {
    setFields(current => current.map(field => field.id === id ? { ...field, ...patch } : field))
  }

  const changeType = (id: string, type: JsonType) => {
    updateField(id, { type, value: defaultValueForType(type) })
  }

  const primitiveValueEditor = (field: FieldDraft) => {
    if (field.type === 'string') {
      return (
        <Input
          value={field.value as string}
          placeholder={t('guided.defaultValue')}
          onChange={event => updateField(field.id, { value: event.target.value })}
        />
      )
    }
    if (field.type === 'number') {
      return (
        <InputNumber
          style={{ width: '100%' }}
          value={field.value as number}
          onChange={value => updateField(field.id, { value: value ?? 0 })}
        />
      )
    }
    if (field.type === 'boolean') {
      return (
        <div className="guided-boolean-value">
          <Switch
            checked={field.value as boolean}
            onChange={value => updateField(field.id, { value })}
          />
          <Typography.Text type="secondary">{String(field.value)}</Typography.Text>
        </div>
      )
    }
    return (
      <div className="guided-container-value">
        <code>{JSON.stringify(field.value)}</code>
        <Typography.Text type="secondary">{t('guided.editNestedLater')}</Typography.Text>
      </div>
    )
  }

  const reset = () => {
    setName(t('guided.defaultName'))
    setFields([createField()])
  }

  const save = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      messageApi.warning(t('guided.nameRequired'))
      return
    }
    const keys = fields.map(field => field.key.trim()).filter(Boolean)
    if (keys.length !== fields.length) {
      messageApi.warning(t('guided.fieldNameRequired'))
      return
    }
    if (new Set(keys).size !== keys.length) {
      messageApi.warning(t('guided.duplicateFields'))
      return
    }
    onCreate({ id: makeId(), name: trimmedName, value: preview, createdAt: Date.now() })
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      width={820}
      title={t('guided.title')}
      okText={t('guided.create')}
      cancelText={t('common.cancel')}
      onCancel={onClose}
      onOk={save}
    >
      {contextHolder}
      <Typography.Paragraph type="secondary" className="guided-intro">
        {t('guided.description')}
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item label={t('guided.componentName')}>
          <Input value={name} onChange={event => setName(event.target.value)} placeholder={t('guided.componentNamePlaceholder')} />
        </Form.Item>
      </Form>

      <div className="guided-fields-header">
        <div>
          <strong>{t('guided.fields')}</strong>
          <Typography.Text type="secondary">{t('guided.fieldsHelp')}</Typography.Text>
        </div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => setFields(current => [...current, createField()])}>
          {t('guided.addField')}
        </Button>
      </div>

      <div className="guided-field-list">
        {fields.map((field, index) => (
          <div className="guided-field-row" key={field.id}>
            <div className="guided-field-index">{index + 1}</div>
            <div className="guided-field-cell">
              <span>{t('guided.key')}</span>
              <Input value={field.key} onChange={event => updateField(field.id, { key: event.target.value })} />
            </div>
            <div className="guided-field-cell">
              <span>{t('guided.type')}</span>
              <Select value={field.type} options={typeOptions} onChange={type => changeType(field.id, type)} />
            </div>
            <div className="guided-field-cell guided-value-cell">
              <span>{t('guided.initialValue')}</span>
              {primitiveValueEditor(field)}
            </div>
            <Button
              type="text"
              danger
              aria-label={t('guided.removeField')}
              icon={<DeleteOutlined />}
              disabled={fields.length === 1}
              onClick={() => setFields(current => current.filter(item => item.id !== field.id))}
            />
          </div>
        ))}
      </div>

      <div className="guided-preview">
        <div className="guided-preview-heading">
          <strong>{t('guided.preview')}</strong>
          <Typography.Text type="secondary">{t('guided.previewHelp')}</Typography.Text>
        </div>
        <pre>{JSON.stringify(preview, null, 2)}</pre>
      </div>
    </Modal>
  )
}
