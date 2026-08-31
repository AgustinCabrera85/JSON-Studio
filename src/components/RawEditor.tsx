import Editor, { type OnMount } from '@monaco-editor/react'
import { DragOutlined } from '@ant-design/icons'
import { Alert, Flex, Tag, Typography } from 'antd'
import { findNodeAtOffset, getNodePath, parseTree } from 'jsonc-parser'
import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { JsonPath } from '../types/json'
import type { ToolboxDropPayload } from '../types/toolbox'

interface RawEditorProps {
  text: string
  error: string | null
  onChange: (text: string) => void
  title?: string
  readOnly?: boolean
  emptyStateLabel?: string
  draggedTool?: ToolboxDropPayload | null
  onDropPayload?: (payload: ToolboxDropPayload, targetPath: JsonPath) => void
}

const readPayload = (event: React.DragEvent): ToolboxDropPayload | null => {
  const raw = event.dataTransfer.getData('application/x-json-studio-toolbox')
  if (!raw) return null
  try { return JSON.parse(raw) as ToolboxDropPayload } catch { return null }
}

const pathLabel = (path: JsonPath) => path.length === 0
  ? '$'
  : `$${path.map(segment => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('')}`

export const RawEditor = ({
  text,
  error,
  onChange,
  title,
  readOnly = false,
  emptyStateLabel,
  draggedTool = null,
  onDropPayload,
}: RawEditorProps) => {
  const { t } = useI18n()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [dropPath, setDropPath] = useState<JsonPath>([])
  const isEmpty = !text.trim()
  const status = error
    ? { color: 'error' as const, label: t('raw.invalid') }
    : isEmpty && emptyStateLabel
      ? { color: 'default' as const, label: emptyStateLabel }
      : { color: 'success' as const, label: t('raw.valid') }

  const resolvePathAtPointer = (clientX: number, clientY: number): JsonPath => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || !text.trim() || error) return []

    const target = editor.getTargetAtClientPoint(clientX, clientY)
    const position = target?.position ?? editor.getPosition()
    if (!position) return []

    editor.setPosition(position)
    const offset = model.getOffsetAt(position)
    const root = parseTree(text)
    if (!root) return []
    let node = findNodeAtOffset(root, offset, true) ?? root
    while (node.parent && node.type !== 'object' && node.type !== 'array') node = node.parent
    return getNodePath(node) as JsonPath
  }

  return (
    <div
      className={`raw-editor ${draggedTool ? 'raw-editor-drag-ready' : ''} ${dropActive ? 'raw-editor-drop-active' : ''}`}
      onDragOverCapture={event => {
        if (!draggedTool || !onDropPayload || readOnly) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropActive(true)
        setDropPath(resolvePathAtPointer(event.clientX, event.clientY))
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDropCapture={event => {
        if (!draggedTool || !onDropPayload || readOnly) return
        const payload = readPayload(event) ?? draggedTool
        if (!payload) return
        event.preventDefault()
        event.stopPropagation()
        setDropActive(false)
        if (error) return
        const targetPath = resolvePathAtPointer(event.clientX, event.clientY)
        onDropPayload(payload, targetPath)
      }}
    >
      <Flex justify="space-between" align="center" className="raw-editor-heading">
        <Typography.Title level={5} style={{ margin: 0 }}>{title ?? t('raw.generatedJson')}</Typography.Title>
        <Tag color={status.color}>{status.label}</Tag>
      </Flex>
      {error && <Alert className="editor-alert" type="error" showIcon message={error} />}
      {draggedTool && onDropPayload && (
        <div className={`raw-drop-guidance ${dropActive ? 'active' : ''}`}>
          <DragOutlined />
          <div>
            <strong>{dropActive ? t('raw.dropNow', { name: draggedTool.name }) : t('raw.dragIntoEditor', { name: draggedTool.name })}</strong>
            <span>{error ? t('raw.dropRequiresValid') : t('raw.dropTarget', { path: pathLabel(dropPath) })}</span>
          </div>
        </div>
      )}
      <div className="monaco-shell">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={text}
          onChange={value => onChange(value ?? '')}
          onMount={editor => { editorRef.current = editor }}
          theme="vs-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            formatOnPaste: true,
            formatOnType: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            folding: true,
          }}
        />
      </div>
    </div>
  )
}
