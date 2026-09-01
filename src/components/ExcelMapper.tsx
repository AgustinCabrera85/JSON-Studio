import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileExcelOutlined,
  KeyOutlined,
  SaveOutlined,
  SearchOutlined,
  TableOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Collapse,
  Input,
  Progress,
  Segmented,
  Select,
  Tag,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { TemplateExcelMapper } from './TemplateExcelMapper'
import type { GuidedComponent } from '../types/toolbox'
import type { JsonType, JsonValue } from '../types/json'
import {
  buildExcelJson,
  defaultMappingsForSheet,
  mappingTemplateValue,
  suggestedStructures,
  type ExcelColumnMapping,
  type ExcelStructureMode,
  type ExcelWorkbookData,
} from '../utils/excel'

interface ExcelMapperProps {
  workbook: ExcelWorkbookData
  template?: JsonValue | null
  onGenerate: (value: JsonValue) => void
  onCreateComponent: (component: GuidedComponent) => void
  onLoadAnother: () => void
}

const typeOptions = (t: (key: string) => string) => (['string', 'number', 'boolean', 'object', 'array', 'null'] as JsonType[]).map(type => ({
  value: type,
  label: t(`type.${type}`),
}))

const StandaloneExcelMapper = ({ workbook, onGenerate, onCreateComponent, onLoadAnother }: ExcelMapperProps) => {
  const { t } = useI18n()
  const [sheetName, setSheetName] = useState(workbook.sheets[0]?.name ?? '')
  const sheet = workbook.sheets.find(item => item.name === sheetName) ?? workbook.sheets[0]!
  const [mappings, setMappings] = useState<ExcelColumnMapping[]>(() => defaultMappingsForSheet(sheet))
  const [mode, setMode] = useState<ExcelStructureMode>('records')
  const [collectionKey, setCollectionKey] = useState(sheet?.name ?? 'data')
  const [keyColumnIndex, setKeyColumnIndex] = useState<number | undefined>(undefined)
  const [groupColumnIndex, setGroupColumnIndex] = useState<number | undefined>(undefined)
  const [groupKey, setGroupKey] = useState('group')
  const [itemsKey, setItemsKey] = useState('items')
  const [componentName, setComponentName] = useState(sheet?.name ? `${sheet.name} Row` : 'Excel Row')
  const [mappingQuery, setMappingQuery] = useState('')
  const [onlyIncluded, setOnlyIncluded] = useState(false)
  const [openPanels, setOpenPanels] = useState<string[]>(['shape', 'mapping'])

  useEffect(() => {
    setSheetName(workbook.sheets[0]?.name ?? '')
  }, [workbook.fileName])

  useEffect(() => {
    if (!sheet) return
    setMappings(defaultMappingsForSheet(sheet))
    setCollectionKey(sheet.name)
    setComponentName(`${sheet.name} Row`)
    setMappingQuery('')
    setOnlyIncluded(false)
    const suggestions = suggestedStructures(sheet)
    const preferred = suggestions[0]
    setMode(preferred?.mode ?? 'records')
    setKeyColumnIndex(suggestions.find(item => item.mode === 'keyed')?.keyColumnIndex)
    const grouped = suggestions.find(item => item.mode === 'grouped')
    setGroupColumnIndex(grouped?.groupColumnIndex)
    setGroupKey(grouped?.groupColumnIndex !== undefined ? sheet.headers[grouped.groupColumnIndex] : 'group')
    setItemsKey('items')
  }, [sheet.name, workbook.fileName])

  const suggestions = useMemo(() => suggestedStructures(sheet), [sheet])
  const buildOptions = useMemo(() => ({
    mode,
    collectionKey,
    keyColumnIndex,
    groupColumnIndex,
    groupKey,
    itemsKey,
  }), [mode, collectionKey, keyColumnIndex, groupColumnIndex, groupKey, itemsKey])

  const previewOutput = useMemo(() => buildExcelJson(
    { ...sheet, rows: sheet.rows.slice(0, 24), rowCount: Math.min(sheet.rowCount, 24) },
    mappings,
    buildOptions,
  ), [sheet, mappings, buildOptions])
  const previewJson = useMemo(() => JSON.stringify(previewOutput, null, 2), [previewOutput])

  const enabledCount = mappings.filter(mapping => mapping.enabled).length
  const normalizedQuery = mappingQuery.trim().toLowerCase()
  const visibleMappings = useMemo(() => mappings.filter(mapping => {
    if (onlyIncluded && !mapping.enabled) return false
    if (!normalizedQuery) return true
    return mapping.sourceHeader.toLowerCase().includes(normalizedQuery)
      || mapping.targetPath.toLowerCase().includes(normalizedQuery)
  }), [mappings, normalizedQuery, onlyIncluded])

  const previewRows = sheet.rows.slice(0, 8).map((row, rowIndex) => {
    const record: Record<string, JsonValue | number> = { __row: rowIndex + 1 }
    sheet.headers.forEach((header, index) => { record[header] = row[index] ?? null })
    return record
  })

  const applySuggestion = (suggestion: ReturnType<typeof suggestedStructures>[number]) => {
    setMode(suggestion.mode)
    if (suggestion.keyColumnIndex !== undefined) setKeyColumnIndex(suggestion.keyColumnIndex)
    if (suggestion.groupColumnIndex !== undefined) {
      setGroupColumnIndex(suggestion.groupColumnIndex)
      setGroupKey(sheet.headers[suggestion.groupColumnIndex] ?? 'group')
    }
  }

  const updateMapping = (columnIndex: number, patch: Partial<ExcelColumnMapping>) => {
    setMappings(current => current.map(mapping => mapping.columnIndex === columnIndex ? { ...mapping, ...patch } : mapping))
  }

  const saveComponent = () => {
    onCreateComponent({
      id: `excel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: componentName.trim() || `${sheet.name} Row`,
      value: mappingTemplateValue(mappings),
      createdAt: Date.now(),
    })
  }

  const modeLabel = t(`excel.mode.${mode}`)
  const modeDetail = mode === 'keyed' && keyColumnIndex !== undefined
    ? sheet.headers[keyColumnIndex]
    : mode === 'grouped' && groupColumnIndex !== undefined
      ? sheet.headers[groupColumnIndex]
      : mode === 'collection'
        ? collectionKey
        : undefined

  const renderDetectedType = (columnIndex: number) => {
    const profile = sheet.profiles[columnIndex]
    if (profile.inferredType === 'date') return t('excel.dateAsString')
    if (profile.inferredType === 'uuid') return t('excel.uuidAsString')
    return t(`type.${profile.inferredType}`)
  }

  return (
    <div className="excel-mapper excel-mapper-v10 excel-mapper-v11">
      <div className="excel-context-sticky">
        <div className="excel-file-title">
          <div className="excel-file-icon"><FileExcelOutlined /></div>
          <div className="excel-file-copy">
            <Typography.Title level={4}>{workbook.fileName}</Typography.Title>
            <Typography.Text type="secondary">{sheet.name}</Typography.Text>
          </div>
        </div>

        <div className="excel-context-metrics" aria-label={t('excel.contextSummary')}>
          <div className="excel-context-metric"><span>{t('excel.rowsLabel')}</span><strong>{sheet.rowCount}</strong></div>
          <div className="excel-context-metric"><span>{t('excel.columnsLabel')}</span><strong>{sheet.headers.length}</strong></div>
          <div className="excel-context-metric"><span>{t('excel.mappingLabel')}</span><strong>{enabledCount}/{mappings.length}</strong></div>
          <div className="excel-context-metric excel-context-shape"><span>{t('excel.shapeLabel')}</span><strong>{modeLabel}</strong>{modeDetail && <small>{modeDetail}</small>}</div>
        </div>

        <div className="excel-context-actions">
          <Select
            value={sheet.name}
            className="excel-sheet-select"
            options={workbook.sheets.map(item => ({ value: item.name, label: `${item.name} · ${item.rowCount}` }))}
            onChange={setSheetName}
          />
          <Button onClick={onLoadAnother}>{t('excel.loadAnother')}</Button>
          <Button type="primary" icon={<DatabaseOutlined />} onClick={() => onGenerate(buildExcelJson(sheet, mappings, buildOptions))}>
            {t('excel.generateJsonCompact')}
          </Button>
        </div>
      </div>

      <div className="excel-split-workspace">
        <div className="excel-control-column">
          <div className="excel-control-column-heading">
            <div>
              <Typography.Title level={5}>{t('excel.workspaceControlsTitle')}</Typography.Title>
              <Typography.Text type="secondary">{t('excel.workspaceControlsDescription')}</Typography.Text>
            </div>
            <div className="excel-panel-actions">
              <Button size="small" onClick={() => setOpenPanels([])}>{t('excel.collapseAll')}</Button>
              <Button size="small" onClick={() => setOpenPanels(['shape', 'mapping'])}>{t('excel.expandEssentials')}</Button>
            </div>
          </div>

          <Collapse
            className="excel-work-panels"
            activeKey={openPanels}
            onChange={keys => setOpenPanels(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
            expandIconPosition="end"
            items={[
              {
                key: 'shape',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.outputShapeTitle')}</strong><span>{t('excel.outputShapeCompactDescription')}</span></div>
                    <Tag color="processing">{modeLabel}</Tag>
                  </div>
                ),
                children: (
                  <div className="excel-shape-controls excel-shape-controls-split">
                    <Segmented
                      value={mode}
                      block
                      options={[
                        { value: 'records', label: t('excel.mode.records') },
                        { value: 'collection', label: t('excel.mode.collection') },
                        { value: 'keyed', label: t('excel.mode.keyed') },
                        { value: 'grouped', label: t('excel.mode.grouped') },
                      ]}
                      onChange={value => {
                        const nextMode = value as ExcelStructureMode
                        setMode(nextMode)
                        if (nextMode === 'keyed' && keyColumnIndex === undefined) setKeyColumnIndex(0)
                        if (nextMode === 'grouped' && groupColumnIndex === undefined) {
                          setGroupColumnIndex(0)
                          setGroupKey(sheet.headers[0] ?? 'group')
                        }
                      }}
                    />

                    <div className="excel-shape-options-inline excel-shape-options-split">
                      {mode === 'collection' && (
                        <label><span>{t('excel.collectionKey')}</span><Input value={collectionKey} onChange={event => setCollectionKey(event.target.value)} /></label>
                      )}
                      {mode === 'keyed' && (
                        <label><span>{t('excel.keyColumn')}</span><Select value={keyColumnIndex} options={sheet.headers.map((header, index) => ({ value: index, label: header }))} onChange={setKeyColumnIndex} /></label>
                      )}
                      {mode === 'grouped' && (
                        <>
                          <label><span>{t('excel.groupColumn')}</span><Select value={groupColumnIndex} options={sheet.headers.map((header, index) => ({ value: index, label: header }))} onChange={setGroupColumnIndex} /></label>
                          <label><span>{t('excel.groupKey')}</span><Input value={groupKey} onChange={event => setGroupKey(event.target.value)} /></label>
                          <label><span>{t('excel.itemsKey')}</span><Input value={itemsKey} onChange={event => setItemsKey(event.target.value)} /></label>
                        </>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'mapping',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.mappingTitle')}</strong><span>{t('excel.mappingCompactDescription')}</span></div>
                    <Tag>{t('excel.mappingLabel')}: {enabledCount}/{mappings.length}</Tag>
                  </div>
                ),
                children: (
                  <div className="excel-mapping-panel-content">
                    <div className="excel-mapping-toolbar excel-mapping-toolbar-split">
                      <div className="excel-mapping-filters">
                        <Input
                          allowClear
                          prefix={<SearchOutlined />}
                          value={mappingQuery}
                          onChange={event => setMappingQuery(event.target.value)}
                          placeholder={t('excel.searchColumns')}
                        />
                        <Checkbox checked={onlyIncluded} onChange={event => setOnlyIncluded(event.target.checked)}>{t('excel.onlyIncluded')}</Checkbox>
                        <Tag>{t('excel.mappingShown', { visible: visibleMappings.length, total: mappings.length })}</Tag>
                      </div>
                    </div>

                    <div className="mapping-grid mapping-grid-header mapping-grid-v11">
                      <span>{t('excel.include')}</span>
                      <span>{t('excel.sourceColumn')}</span>
                      <span>{t('excel.targetPath')}</span>
                      <span>{t('excel.jsonType')}</span>
                    </div>
                    <div className="mapping-list mapping-list-v11">
                      {visibleMappings.map(mapping => {
                        const profile = sheet.profiles[mapping.columnIndex]
                        const sampleText = profile.sampleValues.map(value => String(value)).slice(0, 4).join(' · ') || t('common.empty')
                        return (
                          <div className={`mapping-grid mapping-row mapping-row-v11 ${mapping.enabled ? '' : 'disabled'}`} key={mapping.columnIndex}>
                            <Checkbox checked={mapping.enabled} onChange={event => updateMapping(mapping.columnIndex, { enabled: event.target.checked })} />
                            <Tooltip title={t('excel.samples', { values: sampleText })} placement="topLeft">
                              <div className="mapping-source mapping-source-compact">
                                <strong>{mapping.sourceHeader}</strong>
                                <span>{renderDetectedType(mapping.columnIndex)}</span>
                              </div>
                            </Tooltip>
                            <Input value={mapping.targetPath} onChange={event => updateMapping(mapping.columnIndex, { targetPath: event.target.value })} placeholder="customer.name" />
                            <Select value={mapping.jsonType} options={typeOptions(t)} onChange={jsonType => updateMapping(mapping.columnIndex, { jsonType })} />
                          </div>
                        )
                      })}
                      {visibleMappings.length === 0 && <div className="excel-empty-filter">{t('excel.noColumnsMatch')}</div>}
                    </div>
                    <div className="excel-mapping-footer excel-mapping-footer-split">
                      <Typography.Text type="secondary" className="mapping-path-help">{t('excel.pathHelp')}</Typography.Text>
                      <div className="excel-component-save-inline">
                        <span>{t('excel.componentTools')}</span>
                        <Input value={componentName} onChange={event => setComponentName(event.target.value)} aria-label={t('excel.componentName')} />
                        <Button icon={<SaveOutlined />} onClick={saveComponent}>{t('excel.saveAsComponentCompact')}</Button>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'suggestions',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.suggestionsTitle')}</strong><span>{t('excel.optionalSectionHint')}</span></div>
                    <Tag icon={<CheckCircleOutlined />} color="success">{t('excel.columnsDetected', { count: sheet.headers.length })}</Tag>
                  </div>
                ),
                children: (
                  <div className="excel-suggestion-grid excel-suggestion-grid-split">
                    {suggestions.map(suggestion => {
                      const detail = suggestion.mode === 'keyed' && suggestion.keyColumnIndex !== undefined
                        ? sheet.headers[suggestion.keyColumnIndex]
                        : suggestion.mode === 'grouped' && suggestion.groupColumnIndex !== undefined
                          ? sheet.headers[suggestion.groupColumnIndex]
                          : undefined
                      return (
                        <button
                          type="button"
                          key={suggestion.mode}
                          className={`excel-suggestion-card-compact ${mode === suggestion.mode ? 'selected' : ''}`}
                          onClick={() => applySuggestion(suggestion)}
                        >
                          <span className="suggestion-icon">
                            {suggestion.mode === 'keyed' ? <KeyOutlined /> : suggestion.mode === 'grouped' ? <AppstoreOutlined /> : suggestion.mode === 'collection' ? <DatabaseOutlined /> : <TableOutlined />}
                          </span>
                          <span className="suggestion-copy-compact">
                            <strong>{t(suggestion.titleKey)}</strong>
                            <small>{detail ?? t(suggestion.descriptionKey)}</small>
                          </span>
                          <Progress type="circle" size={30} percent={Math.round(suggestion.confidence * 100)} format={percent => `${percent}%`} />
                        </button>
                      )
                    })}
                  </div>
                ),
              },
              {
                key: 'data',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.dataPreview')}</strong><span>{t('excel.dataPreviewCompact')}</span></div>
                    <Tag>{t('excel.previewRows', { count: previewRows.length })}</Tag>
                  </div>
                ),
                children: (
                  <div className="excel-table-scroll excel-table-scroll-split">
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="__row"
                      dataSource={previewRows}
                      columns={[
                        { title: '#', dataIndex: '__row', key: '__row', width: 48, fixed: 'left' },
                        ...sheet.headers.map(header => ({ title: header, dataIndex: header, key: header, ellipsis: true, width: 135 })),
                      ]}
                      scroll={{ x: Math.max(620, sheet.headers.length * 135), y: 230 }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>

        <aside className="excel-json-live-panel">
          <div className="excel-json-live-header">
            <div>
              <span className="excel-json-live-kicker">{t('excel.livePreview')}</span>
              <Typography.Title level={5}>{t('excel.resultTitle')}</Typography.Title>
              <Typography.Text type="secondary">{t('excel.resultDescription', { rows: sheet.rowCount })}</Typography.Text>
            </div>
            <div className="excel-json-live-meta">
              <Tag color="processing">{modeLabel}</Tag>
              <Button type="primary" size="small" icon={<DatabaseOutlined />} onClick={() => onGenerate(buildExcelJson(sheet, mappings, buildOptions))}>
                {t('excel.generateJsonCompact')}
              </Button>
            </div>
          </div>
          <pre className="excel-json-preview excel-json-live-code">{previewJson.slice(0, 16000)}{previewJson.length > 16000 ? '\n…' : ''}</pre>
          <div className="excel-json-live-footer">
            <span>{t('excel.previewRowsProcessed', { count: Math.min(sheet.rowCount, 24) })}</span>
            <span>{modeLabel}{modeDetail ? ` · ${modeDetail}` : ''}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}


export const ExcelMapper = (props: ExcelMapperProps) => {
  if (props.template) {
    return (
      <TemplateExcelMapper
        workbook={props.workbook}
        template={props.template}
        onGenerate={props.onGenerate}
        onCreateComponent={props.onCreateComponent}
        onLoadAnother={props.onLoadAnother}
      />
    )
  }
  return <StandaloneExcelMapper {...props} />
}
