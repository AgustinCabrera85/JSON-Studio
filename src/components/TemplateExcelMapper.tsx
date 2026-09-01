import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileExcelOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Collapse,
  Input,
  Segmented,
  Select,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import type { GuidedComponent } from '../types/toolbox'
import type { JsonType, JsonValue } from '../types/json'
import type { ExcelSheetData, ExcelWorkbookData } from '../utils/excel'
import {
  buildTemplateExcelJson,
  buildTemplateItem,
  defaultFieldMappingsForTemplate,
  findTemplateRepeatTargets,
  type TemplateFieldMapping,
  type TemplatePopulateMode,
} from '../utils/excelTemplate'

interface TemplateExcelMapperProps {
  workbook: ExcelWorkbookData
  template: JsonValue
  onGenerate: (value: JsonValue) => void
  onCreateComponent: (component: GuidedComponent) => void
  onLoadAnother: () => void
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
const printable = (value: JsonValue | undefined) => {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value || '""'
  return JSON.stringify(value)
}

const filterSuggestion = (sheet: ExcelSheetData) => sheet.profiles.find(profile => {
  const header = normalize(profile.header)
  return profile.inferredType === 'boolean'
    && (header.includes('addtomodulejson') || header.includes('includeinjson') || header.includes('exporttojson'))
})

const distinctColumnValues = (sheet: ExcelSheetData, columnIndex?: number) => {
  if (columnIndex === undefined) return []
  const values: JsonValue[] = []
  const seen = new Set<string>()
  sheet.rows.forEach(row => {
    const value = row[columnIndex] ?? null
    const key = JSON.stringify(value)
    if (!seen.has(key) && values.length < 30) {
      seen.add(key)
      values.push(value)
    }
  })
  return values
}

const valueEquals = (left: JsonValue, right: JsonValue) => JSON.stringify(left) === JSON.stringify(right)

export const TemplateExcelMapper = ({ workbook, template, onGenerate, onCreateComponent, onLoadAnother }: TemplateExcelMapperProps) => {
  const { t } = useI18n()
  const [sheetName, setSheetName] = useState(workbook.sheets[0]?.name ?? '')
  const sheet = workbook.sheets.find(item => item.name === sheetName) ?? workbook.sheets[0]!
  const targets = useMemo(() => findTemplateRepeatTargets(template), [template])
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const target = targets.find(item => item.id === targetId) ?? targets[0]
  const [mappings, setMappings] = useState<TemplateFieldMapping[]>(() => target ? defaultFieldMappingsForTemplate(sheet, target) : [])
  const [populateMode, setPopulateMode] = useState<TemplatePopulateMode>('replace')
  const [componentName, setComponentName] = useState(sheet?.name ? `${sheet.name} Row` : 'Excel Row')
  const [mappingQuery, setMappingQuery] = useState('')
  const [openPanels, setOpenPanels] = useState<string[]>(['target', 'mapping'])
  const [previewMode, setPreviewMode] = useState<'item' | 'full'>('item')
  const [previewRowIndex, setPreviewRowIndex] = useState(0)

  const suggestedFilter = useMemo(() => filterSuggestion(sheet), [sheet])
  const [filterEnabled, setFilterEnabled] = useState(!!suggestedFilter)
  const [filterColumnIndex, setFilterColumnIndex] = useState<number | undefined>(suggestedFilter?.index)
  const [filterValue, setFilterValue] = useState<JsonValue>(true)

  useEffect(() => { setSheetName(workbook.sheets[0]?.name ?? '') }, [workbook.fileName])

  useEffect(() => {
    if (targets.length === 0) return
    setTargetId(current => targets.some(item => item.id === current) ? current : targets[0].id)
  }, [targets])

  useEffect(() => {
    if (!target) return
    setMappings(defaultFieldMappingsForTemplate(sheet, target))
    setComponentName(`${sheet.name} Row`)
    setMappingQuery('')
    setPopulateMode('replace')
    setPreviewMode('item')
    const suggestion = filterSuggestion(sheet)
    setFilterEnabled(!!suggestion)
    setFilterColumnIndex(suggestion?.index)
    setFilterValue(true)
  }, [sheet.name, workbook.fileName, target?.id])

  const filteredSheet = useMemo<ExcelSheetData>(() => {
    if (!filterEnabled || filterColumnIndex === undefined) return sheet
    const keptIndexes = sheet.rows.map((row, index) => ({ row, index })).filter(item => valueEquals(item.row[filterColumnIndex] ?? null, filterValue))
    return {
      ...sheet,
      rows: keptIndexes.map(item => item.row),
      rowNumbers: keptIndexes.map(item => sheet.rowNumbers[item.index] ?? item.index + sheet.headerRowNumber + 1),
      rowCount: keptIndexes.length,
    }
  }, [sheet, filterEnabled, filterColumnIndex, filterValue])

  const mappedCount = mappings.filter(mapping => mapping.mode === 'map' && mapping.sourceColumnIndex !== undefined).length
  const preservedCount = mappings.length - mappedCount
  const variableMappings = mappings.filter(mapping => !mapping.constant)
  const constantMappings = mappings.filter(mapping => mapping.constant)
  const normalizedQuery = mappingQuery.trim().toLowerCase()
  const visibleMappings = variableMappings.filter(mapping => !normalizedQuery
    || mapping.targetPath.toLowerCase().includes(normalizedQuery)
    || mapping.label.toLowerCase().includes(normalizedQuery)
    || (mapping.sourceHeader ?? '').toLowerCase().includes(normalizedQuery))

  const sourceOptions = useMemo(() => sheet.profiles.map(profile => ({
    value: profile.index,
    label: profile.header,
    title: `${profile.header} · ${profile.sampleValues.map(value => printable(value)).join(', ')}`,
  })), [sheet])

  const filterValues = useMemo(() => distinctColumnValues(sheet, filterColumnIndex), [sheet, filterColumnIndex])
  const filterValueOptions = filterValues.map(value => ({ value: JSON.stringify(value), label: printable(value) }))

  useEffect(() => {
    if (filteredSheet.rows.length === 0) {
      setPreviewRowIndex(0)
      return
    }
    const identityMapping = mappings.find(mapping => mapping.mode === 'map' && mapping.sourceColumnIndex !== undefined && /(^|\.)pid$|(^|\.)id$/i.test(mapping.targetPath))
    if (identityMapping && target) {
      const guideIdentity = target.prototype.pid ?? target.prototype.id
      if (guideIdentity !== undefined) {
        const found = filteredSheet.rows.findIndex(row => valueEquals(row[identityMapping.sourceColumnIndex!] ?? null, guideIdentity))
        if (found >= 0) {
          setPreviewRowIndex(found)
          return
        }
      }
    }
    setPreviewRowIndex(current => Math.min(current, filteredSheet.rows.length - 1))
  }, [filteredSheet.rows, mappings, target])

  const previewRow = filteredSheet.rows[previewRowIndex] ?? filteredSheet.rows[0]
  const previewItem = useMemo(() => previewRow && target ? buildTemplateItem(target, previewRow, mappings) : target?.prototype ?? {}, [previewRow, target, mappings])
  const compactPreviewSheet = useMemo<ExcelSheetData>(() => ({
    ...filteredSheet,
    rows: filteredSheet.rows.slice(0, 8),
    rowNumbers: filteredSheet.rowNumbers.slice(0, 8),
    rowCount: Math.min(filteredSheet.rowCount, 8),
  }), [filteredSheet])
  const fullPreview = useMemo(() => target ? buildTemplateExcelJson(template, compactPreviewSheet, mappings, target, populateMode) : template, [template, compactPreviewSheet, mappings, target, populateMode])
  const previewJson = JSON.stringify(previewMode === 'item' ? previewItem : fullPreview, null, 2)

  const identitySourceColumn = mappings.find(mapping => mapping.mode === 'map' && mapping.sourceColumnIndex !== undefined && /(^|\.)pid$|(^|\.)id$/i.test(mapping.targetPath))?.sourceColumnIndex
  const previewRowOptions = filteredSheet.rows.slice(0, 400).map((row, index) => {
    const worksheetRow = filteredSheet.rowNumbers[index] ?? index + sheet.headerRowNumber + 1
    const identity = identitySourceColumn !== undefined ? row[identitySourceColumn] : undefined
    return { value: index, label: `${t('excel.rowLabel')} ${worksheetRow}${identity !== undefined && identity !== null && identity !== '' ? ` · ${String(identity)}` : ''}` }
  })

  const updateMapping = (targetPath: string, patch: Partial<TemplateFieldMapping>) => {
    setMappings(current => current.map(mapping => mapping.targetPath === targetPath ? { ...mapping, ...patch } : mapping))
  }

  const changeMappingSource = (mapping: TemplateFieldMapping, value: number | 'preserve') => {
    if (value === 'preserve') {
      updateMapping(mapping.targetPath, { mode: 'preserve', sourceColumnIndex: undefined, sourceHeader: undefined, semanticType: undefined, confidence: 0 })
      return
    }
    const profile = sheet.profiles[value]
    updateMapping(mapping.targetPath, {
      mode: 'map',
      sourceColumnIndex: value,
      sourceHeader: profile.header,
      semanticType: profile.inferredType,
      confidence: 0,
    })
  }

  const saveComponent = () => {
    if (!target) return
    onCreateComponent({
      id: `excel-template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: componentName.trim() || `${sheet.name} Row`,
      value: target.prototype,
      createdAt: Date.now(),
    })
  }

  if (!target) {
    return (
      <div className="excel-template-empty">
        <Typography.Title level={4}>{t('excel.templateNoTargetTitle')}</Typography.Title>
        <Typography.Paragraph type="secondary">{t('excel.templateNoTargetDescription')}</Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="excel-mapper excel-mapper-v13 excel-template-mapper">
      <div className="excel-context-sticky template-context-v13">
        <div className="excel-file-title">
          <div className="excel-file-icon"><FileExcelOutlined /></div>
          <div className="excel-file-copy">
            <Typography.Title level={4}>{workbook.fileName}</Typography.Title>
            <Typography.Text type="secondary">{sheet.name} · {t('excel.headerRowDetected', { row: sheet.headerRowNumber })}</Typography.Text>
          </div>
        </div>

        <div className="excel-context-metrics" aria-label={t('excel.contextSummary')}>
          <div className="excel-context-metric"><span>{t('excel.rowsLabel')}</span><strong>{filteredSheet.rowCount}/{sheet.rowCount}</strong></div>
          <div className="excel-context-metric"><span>{t('excel.templateFields')}</span><strong>{mappings.length}</strong></div>
          <div className="excel-context-metric"><span>{t('excel.mappingLabel')}</span><strong>{mappedCount}</strong></div>
          <div className="excel-context-metric excel-context-shape"><span>{t('excel.templateTarget')}</span><strong>{target.label}</strong><small>{t('excel.templateDriven')}</small></div>
        </div>

        <div className="excel-context-actions">
          <Select value={sheet.name} className="excel-sheet-select" options={workbook.sheets.map(item => ({ value: item.name, label: `${item.name} · ${item.rowCount}` }))} onChange={setSheetName} />
          <Button onClick={onLoadAnother}>{t('excel.loadAnother')}</Button>
          <Button type="primary" icon={<DatabaseOutlined />} disabled={filteredSheet.rowCount === 0} onClick={() => onGenerate(buildTemplateExcelJson(template, filteredSheet, mappings, target, populateMode))}>
            {t('excel.populateTemplate')}
          </Button>
        </div>
      </div>

      <div className="template-mapping-explainer">
        <div><span>1</span><strong>{t('excel.mappingStep1Title')}</strong><small>{t('excel.mappingStep1Description')}</small></div>
        <ArrowRightOutlined />
        <div><span>2</span><strong>{t('excel.mappingStep2Title')}</strong><small>{t('excel.mappingStep2Description')}</small></div>
        <ArrowRightOutlined />
        <div><span>3</span><strong>{t('excel.mappingStep3Title')}</strong><small>{t('excel.mappingStep3Description')}</small></div>
      </div>

      <div className="excel-split-workspace template-split-v13">
        <div className="excel-control-column">
          <div className="excel-control-column-heading">
            <div>
              <Typography.Title level={5}>{t('excel.templateWorkspaceTitle')}</Typography.Title>
              <Typography.Text type="secondary">{t('excel.templateMappingSimpleDescription')}</Typography.Text>
            </div>
            <div className="excel-panel-actions">
              <Button size="small" onClick={() => setOpenPanels([])}>{t('excel.collapseAll')}</Button>
              <Button size="small" onClick={() => setOpenPanels(['target', 'mapping'])}>{t('excel.expandEssentials')}</Button>
            </div>
          </div>

          <Collapse
            className="excel-work-panels template-work-panels-v13"
            activeKey={openPanels}
            onChange={keys => setOpenPanels(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
            expandIconPosition="end"
            items={[
              {
                key: 'target',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.templateTargetTitle')}</strong><span>{t('excel.templateTargetSimpleDescription')}</span></div>
                    <Tag color="processing">{target.label}</Tag>
                  </div>
                ),
                children: (
                  <div className="template-target-v13">
                    <div className="template-target-controls">
                      <label>
                        <span>{t('excel.repeatTarget')}</span>
                        <Select value={target.id} options={targets.map(item => ({ value: item.id, label: `${item.label} · ${item.leaves.length} ${t('excel.templateFields')}` }))} onChange={setTargetId} />
                      </label>
                      <label>
                        <span>{t('excel.existingItems')}</span>
                        <Segmented disabled={target.kind === 'root-object'} value={populateMode} options={[{ value: 'replace', label: t('excel.replaceItems') }, { value: 'append', label: t('excel.appendItems') }]} onChange={value => setPopulateMode(value as TemplatePopulateMode)} />
                      </label>
                    </div>

                    <div className="template-row-filter">
                      <div className="template-row-filter-title">
                        <div><strong>{t('excel.rowsToUse')}</strong><span>{t('excel.rowsToUseDescription')}</span></div>
                        <Switch checked={filterEnabled} onChange={setFilterEnabled} />
                      </div>
                      <div className="template-filter-controls">
                        <Select
                          disabled={!filterEnabled}
                          showSearch
                          optionFilterProp="label"
                          value={filterColumnIndex}
                          placeholder={t('excel.chooseFilterColumn')}
                          options={sheet.profiles.map(profile => ({ value: profile.index, label: profile.header }))}
                          onChange={index => {
                            setFilterColumnIndex(index)
                            const profile = sheet.profiles[index]
                            const values = distinctColumnValues(sheet, index)
                            setFilterValue(profile.inferredType === 'boolean' && values.some(value => value === true) ? true : values[0] ?? '')
                          }}
                        />
                        <Select
                          disabled={!filterEnabled || filterColumnIndex === undefined}
                          value={JSON.stringify(filterValue)}
                          options={filterValueOptions}
                          onChange={raw => {
                            try { setFilterValue(JSON.parse(raw) as JsonValue) } catch { setFilterValue(raw) }
                          }}
                        />
                        <Tag color={filteredSheet.rowCount ? 'green' : 'error'}>{t('excel.rowsSelected', { selected: filteredSheet.rowCount, total: sheet.rowCount })}</Tag>
                      </div>
                      {suggestedFilter && <Typography.Text type="secondary" className="template-filter-hint"><CheckCircleOutlined /> {t('excel.filterSuggested', { column: suggestedFilter.header })}</Typography.Text>}
                    </div>
                  </div>
                ),
              },
              {
                key: 'mapping',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.targetFirstMappingTitle')}</strong><span>{t('excel.targetFirstMappingDescription')}</span></div>
                    <Tag>{t('excel.mappedOfTargets', { mapped: mappedCount, total: variableMappings.length })}</Tag>
                  </div>
                ),
                children: (
                  <div className="template-target-first-mapping">
                    <div className="template-mapping-search">
                      <Input allowClear prefix={<SearchOutlined />} placeholder={t('excel.searchTargetFields')} value={mappingQuery} onChange={event => setMappingQuery(event.target.value)} />
                    </div>
                    <div className="template-mapping-head">
                      <span>{t('excel.jsonTargetField')}</span>
                      <span>{t('excel.guideValue')}</span>
                      <span>{t('excel.excelSource')}</span>
                      <span>{t('excel.status')}</span>
                    </div>
                    <div className="template-target-mapping-scroll">
                      {visibleMappings.map(mapping => (
                        <div className="template-target-mapping-row" key={mapping.targetPath}>
                          <div className="template-target-path-cell">
                            <strong>{mapping.label}</strong>
                            <code>{mapping.targetPath}</code>
                          </div>
                          <Tooltip title={printable(mapping.guideValue)}><span className="template-guide-value">{printable(mapping.guideValue)}</span></Tooltip>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            value={mapping.mode === 'preserve' || mapping.sourceColumnIndex === undefined ? 'preserve' : mapping.sourceColumnIndex}
                            options={[{ value: 'preserve', label: t('excel.preserveGuideValue') }, ...sourceOptions]}
                            onChange={value => changeMappingSource(mapping, value as number | 'preserve')}
                          />
                          <div className="template-mapping-status">
                            {mapping.mode === 'map' ? (
                              <Tag color={mapping.confidence >= .85 ? 'green' : 'blue'}>{mapping.confidence > 0 ? `${t('excel.autoMapped')} ${Math.round(mapping.confidence * 100)}%` : t('excel.mappedManual')}</Tag>
                            ) : <Tag>{t('excel.preserved')}</Tag>}
                          </div>
                        </div>
                      ))}
                      {visibleMappings.length === 0 && <div className="template-empty-filter">{t('excel.noTargetFields')}</div>}
                    </div>
                    <div className="template-mapping-footer-note">{t('excel.unusedColumnsIgnored')}</div>
                  </div>
                ),
              },
              {
                key: 'preserved',
                label: (
                  <div className="excel-collapse-label">
                    <div><strong>{t('excel.preservedFieldsTitle')}</strong><span>{t('excel.preservedFieldsDescription')}</span></div>
                    <Tag>{constantMappings.length}</Tag>
                  </div>
                ),
                children: (
                  <div className="template-preserved-fields">
                    {constantMappings.map(mapping => (
                      <div key={mapping.targetPath}><code>{mapping.targetPath}</code><span>{printable(mapping.guideValue)}</span><Tag>{t('excel.preserved')}</Tag></div>
                    ))}
                  </div>
                ),
              },
            ]}
          />

          <div className="template-component-save">
            <span>{t('excel.reusableComponent')}</span>
            <Input value={componentName} onChange={event => setComponentName(event.target.value)} />
            <Button icon={<SaveOutlined />} onClick={saveComponent}>{t('excel.saveComponent')}</Button>
          </div>
        </div>

        <aside className="excel-json-live-panel template-json-live-panel template-preview-v13">
          <div className="excel-json-live-header">
            <div>
              <span className="excel-json-live-kicker">{t('excel.templateResultKicker')}</span>
              <Typography.Title level={5}>{previewMode === 'item' ? t('excel.itemPreviewTitle') : t('excel.templateResultTitle')}</Typography.Title>
              <Typography.Text type="secondary">{previewMode === 'item'
                ? t('excel.itemPreviewDescription')
                : t('excel.fullPreviewDescription', { rows: filteredSheet.rowCount })}</Typography.Text>
            </div>
            <Button type="primary" size="small" icon={<DatabaseOutlined />} disabled={filteredSheet.rowCount === 0} onClick={() => onGenerate(buildTemplateExcelJson(template, filteredSheet, mappings, target, populateMode))}>{t('excel.populateTemplate')}</Button>
          </div>
          <div className="template-preview-toolbar">
            <Segmented value={previewMode} options={[{ value: 'item', label: t('excel.oneItem') }, { value: 'full', label: t('excel.fullJson') }]} onChange={value => setPreviewMode(value as 'item' | 'full')} />
            {previewMode === 'item' && <Select showSearch optionFilterProp="label" value={Math.min(previewRowIndex, Math.max(0, previewRowOptions.length - 1))} options={previewRowOptions} onChange={setPreviewRowIndex} className="template-row-preview-select" />}
          </div>
          <pre className="excel-json-live-code">{previewJson}</pre>
          <div className="excel-json-live-footer">
            <span>{t('excel.willGenerateItems', { count: filteredSheet.rowCount })}</span>
            <span>{t('excel.preservedCount', { count: preservedCount })}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
