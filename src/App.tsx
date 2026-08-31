import {
  App as AntApp,
  Breadcrumb,
  Button,
  ConfigProvider,
  Drawer,
  Layout,
  Card,
  Segmented,
  Space,
  Typography,
  message,
  theme,
} from 'antd'
import {
  ApartmentOutlined,
  CodeOutlined,
  ExperimentOutlined,
  FileAddOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  LinkOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import enUS from 'antd/locale/en_US'
import esES from 'antd/locale/es_ES'
import { analyzeJson } from './analyzer/analyzeJson'
import { createCompositionShell } from './analyzer/composition'
import type { JsonAnalysisResult } from './analyzer/types'
import { AnalysisResults } from './components/AnalysisResults'
import type { GuidedComponent, ToolboxDropPayload } from './types/toolbox'
import { findSmartTargetPath, targetSemanticallyMatchesPayload } from './utils/placement'
import { PropertyEditor } from './components/PropertyEditor'
import { RawEditor } from './components/RawEditor'
import { ReferencesView } from './components/ReferencesView'
import { StudioHeader } from './components/StudioHeader'
import { Toolbox } from './components/Toolbox'
import { VisualBuilder } from './components/VisualBuilder'
import { ExcelMapper } from './components/ExcelMapper'
import { useJsonHistory } from './hooks/useJsonHistory'
import type { JsonObject, JsonPath, JsonType, JsonValue } from './types/json'
import {
  addObjectProperty,
  appendArrayItem,
  defaultValueForType,
  deleteAtPath,
  detectType,
  duplicateAtPath,
  getAtPath,
  moveArrayItem,
  renameObjectKey,
  setAtPath,
} from './utils/json'
import { I18nProvider, useI18n } from './i18n'
import { parseExcelFile, type ExcelWorkbookData } from './utils/excel'
import './styles.css'

const emptyDocument: JsonValue = {}

const emptyAnalysis: JsonAnalysisResult = {
  structures: [],
  uuidReferences: [],
  objectCount: 0,
  arrayCount: 0,
  primitiveCount: 0,
  maxDepth: 0,
}

type WorkflowPhase = 'start' | 'sample' | 'analysis' | 'excel' | 'build'

const propertyNameFromTool = (name: string) => {
  const words = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'item'
  const [first, ...rest] = words
  return `${first.charAt(0).toLowerCase()}${first.slice(1)}${rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`
}

const humanize = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, char => char.toUpperCase())

const breadcrumbItems = (root: JsonValue, path: JsonPath, t: (key: string, params?: Record<string, string | number>) => string) => {
  const items: Array<{ title: string }> = [{ title: t('common.document') }]
  let current: JsonValue = root

  for (const segment of path) {
    if (typeof segment === 'string') {
      items.push({ title: humanize(segment) })
      if (current !== null && typeof current === 'object' && !Array.isArray(current)) current = current[segment]
    } else {
      let label = t('common.item', { number: segment + 1 })
      if (Array.isArray(current)) {
        const candidate = current[segment]
        if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
          for (const key of ['name', 'title', 'label']) {
            const value = candidate[key]
            if (typeof value === 'string' && value.trim()) {
              label = value
              break
            }
          }
        }
        current = candidate
      }
      items.push({ title: label })
    }
  }

  return items
}

type WorkspaceView = 'visual' | 'json' | 'references' | 'analysis'

function Studio() {
  const { t } = useI18n()
  const history = useJsonHistory(emptyDocument)
  const [phase, setPhase] = useState<WorkflowPhase>('start')
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('visual')
  const [selectedPath, setSelectedPath] = useState<JsonPath>([])
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [draggedTool, setDraggedTool] = useState<ToolboxDropPayload | null>(null)
  const [builderNeedsSampleShell, setBuilderNeedsSampleShell] = useState(false)
  const [builderText, setBuilderText] = useState(() => JSON.stringify(emptyDocument, null, 2))
  const [builderError, setBuilderError] = useState<string | null>(null)
  const [sampleText, setSampleText] = useState('')
  const [sampleValue, setSampleValue] = useState<JsonValue>(emptyDocument)
  const [sampleError, setSampleError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<JsonAnalysisResult>(emptyAnalysis)
  const [analysisReady, setAnalysisReady] = useState(false)
  const [excelWorkbook, setExcelWorkbook] = useState<ExcelWorkbookData | null>(null)
  const [prepareSource, setPrepareSource] = useState<'sample' | 'excel' | null>(null)
  const [guidedComponents, setGuidedComponents] = useState<GuidedComponent[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.localStorage.getItem('json-studio-guided-components')
      return stored ? JSON.parse(stored) as GuidedComponent[] : []
    } catch {
      return []
    }
  })
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem('json-studio-guided-components', JSON.stringify(guidedComponents)) } catch { /* keep session state */ }
  }, [guidedComponents])

  useEffect(() => {
    if (!builderError) setBuilderText(JSON.stringify(history.value, null, 2))
  }, [history.value, builderError])

  useEffect(() => {
    try { getAtPath(history.value, selectedPath) }
    catch {
      setSelectedPath([])
      setInspectorOpen(false)
    }
  }, [history.value, selectedPath])

  const commit = (next: JsonValue, nextPath = selectedPath) => {
    history.commit(next)
    setSelectedPath(nextPath)
    setBuilderError(null)
  }

  const builderRawChange = (text: string) => {
    setBuilderText(text)
    try {
      const parsed = JSON.parse(text) as JsonValue
      history.commit(parsed)
      setBuilderError(null)
      setSelectedPath([])
      setInspectorOpen(false)
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : t('builder.invalidJson'))
    }
  }

  const sampleRawChange = (text: string) => {
    setSampleText(text)
    setAnalysisReady(false)
    setAnalysis(emptyAnalysis)
    setBuilderNeedsSampleShell(true)
    setPrepareSource('sample')

    if (!text.trim()) {
      setSampleValue(emptyDocument)
      setSampleError(null)
      return
    }

    try {
      const parsed = JSON.parse(text) as JsonValue
      setSampleValue(parsed)
      setSampleError(null)
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : t('builder.invalidJson'))
    }
  }

  const runAnalysis = (value = sampleValue) => {
    if (!sampleText.trim()) {
      messageApi.warning(t('sample.requiredWarning'))
      return
    }
    if (sampleError) {
      messageApi.error(t('sample.fixError'))
      return
    }
    const result = analyzeJson(value)
    setAnalysis(result)
    setAnalysisReady(true)
    setBuilderNeedsSampleShell(true)
    setPrepareSource('sample')
    setPhase('analysis')
    messageApi.success(t('analysis.detectedComponents', { count: result.structures.filter(item => !item.contexts.includes('Root')).length }))
  }

  const importBuilder = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as JsonValue
      history.replace(parsed)
      setSelectedPath([])
      setBuilderText(JSON.stringify(parsed, null, 2))
      setBuilderError(null)
      setWorkspaceView('visual')
      setInspectorOpen(false)
      setBuilderNeedsSampleShell(false)
      setPhase('build')
      messageApi.success(t('builder.fileLoaded', { file: file.name }))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('builder.importFailed'))
    }
  }

  const importSample = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as JsonValue
      setSampleValue(parsed)
      setSampleText(JSON.stringify(parsed, null, 2))
      setSampleError(null)
      setAnalysis(emptyAnalysis)
      setAnalysisReady(false)
      setBuilderNeedsSampleShell(true)
      setPrepareSource('sample')
      setPhase('sample')
      messageApi.success(t('sample.loaded', { file: file.name }))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('builder.importFailed'))
    }
  }

  const importExcel = async (file: File) => {
    try {
      const workbook = await parseExcelFile(file)
      setExcelWorkbook(workbook)
      setPrepareSource('excel')
      setPhase('excel')
      messageApi.success(t('excel.loaded', { file: file.name, sheets: workbook.sheets.length }))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('excel.importFailed'))
    }
  }

  const insertIntoPath = (targetPath: JsonPath, payload: ToolboxDropPayload) => {
    try {
      let path = targetPath
      let target = getAtPath(history.value, path)

      if (detectType(target) !== 'object' && detectType(target) !== 'array' && path.length > 0) {
        path = path.slice(0, -1)
        target = getAtPath(history.value, path)
      }

      if (Array.isArray(target)) {
        const index = target.length
        const nextPath = [...path, index]
        commit(appendArrayItem(history.value, path, payload.value), nextPath)
        setInspectorOpen(true)
        setDraggedTool(null)
        return
      }

      if (target !== null && typeof target === 'object') {
        const object = target as JsonObject

        // When the destination itself represents the component (e.g. Rule -> rules,
        // Use -> use), populate that object instead of creating an awkward nested key.
        if (
          path.length > 0
          && payload.kind === 'structure'
          && payload.value !== null
          && typeof payload.value === 'object'
          && !Array.isArray(payload.value)
          && targetSemanticallyMatchesPayload(path, payload)
        ) {
          const nextValue = { ...object, ...(payload.value as JsonObject) }
          commit(setAtPath(history.value, path, nextValue), path)
          setInspectorOpen(true)
          setDraggedTool(null)
          return
        }

        const base = propertyNameFromTool(payload.name) || 'item'
        let key = base
        let suffix = 2
        while (Object.prototype.hasOwnProperty.call(object, key)) key = `${base}${suffix++}`
        const nextPath = [...path, key]
        commit(addObjectProperty(history.value, path, key, payload.value), nextPath)
        setInspectorOpen(true)
        setDraggedTool(null)
        return
      }

      messageApi.warning(t('builder.chooseDestination'))
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t('builder.addFailed'))
    }
  }

  const startBuilderFromSample = () => {
    const shell = createCompositionShell(sampleValue)
    history.replace(shell)
    setBuilderText(JSON.stringify(shell, null, 2))
    setBuilderError(null)
    setSelectedPath([])
    setInspectorOpen(false)
    setWorkspaceView('visual')
    setBuilderNeedsSampleShell(false)
  }

  const enterBuildMode = () => {
    setPhase('build')
    setWorkspaceView('visual')
  }

  const buildFromAnalysis = () => {
    if (builderNeedsSampleShell) startBuilderFromSample()
    setPhase('build')
    setWorkspaceView('visual')
  }

  const startNewDocument = (rootType: 'object' | 'array') => {
    const next: JsonValue = rootType === 'array' ? [] : {}
    history.replace(next)
    setBuilderText(JSON.stringify(next, null, 2))
    setBuilderError(null)
    setSelectedPath([])
    setInspectorOpen(false)
    setWorkspaceView('visual')
    setBuilderNeedsSampleShell(false)
    setPhase('build')
  }

  const navigateWorkflow = (nextPhase: WorkflowPhase) => {
    if (nextPhase === 'start') {
      setPhase('start')
      return
    }
    if (nextPhase === 'sample') {
      setPhase('sample')
      return
    }
    if (nextPhase === 'analysis') {
      if (!analysisReady) {
        setPhase('sample')
        return
      }
      setPhase('analysis')
      return
    }
    if (nextPhase === 'excel') {
      setPhase(excelWorkbook ? 'excel' : 'start')
      return
    }
    enterBuildMode()
  }

  const smartInsert = (payload: ToolboxDropPayload) => {
    const targetPath = findSmartTargetPath(history.value, selectedPath, payload)
    insertIntoPath(targetPath, payload)
  }

  const breadcrumbs = useMemo(() => breadcrumbItems(history.value, selectedPath, t), [history.value, selectedPath, t])
  const smartTargetPath = useMemo(
    () => draggedTool ? findSmartTargetPath(history.value, selectedPath, draggedTool) : null,
    [history.value, selectedPath, draggedTool],
  )
  const discoveredCount = analysis.structures.filter(structure => !structure.contexts.includes('Root')).length
  const availableComponentCount = discoveredCount + guidedComponents.length

  const openInspector = (path: JsonPath) => {
    setSelectedPath(path)
    setInspectorOpen(true)
  }

  const renderWorkspace = () => {
    if (workspaceView === 'json') {
      return (
        <RawEditor
          text={builderText}
          error={builderError}
          onChange={builderRawChange}
          title={t('builder.jsonPreview')}
          draggedTool={draggedTool}
          onDropPayload={(payload, targetPath) => insertIntoPath(targetPath, payload)}
        />
      )
    }
    if (workspaceView === 'references') {
      return <div className="secondary-view-scroll"><ReferencesView analysis={analysis} /></div>
    }
    if (workspaceView === 'analysis') {
      return <div className="secondary-view-scroll"><AnalysisResults result={analysis} /></div>
    }
    return (
      <div className="visual-workspace-scroll">
        <VisualBuilder
          value={history.value}
          analysis={analysis}
          selectedPath={selectedPath}
          draggedTool={draggedTool}
          preferredTargetPath={smartTargetPath}
          onSelect={setSelectedPath}
          onOpenInspector={openInspector}
          onDropValue={insertIntoPath}
          onSmartDrop={smartInsert}
        />
      </div>
    )
  }

  return (
    <Layout className="studio-layout">
      {contextHolder}
      <StudioHeader
        phase={phase}
        analysisReady={analysisReady}
        excelReady={!!excelWorkbook}
        prepareSource={prepareSource}
        value={history.value}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onPhaseChange={navigateWorkflow}
        onUndo={history.undo}
        onRedo={history.redo}
        onImportBuilder={importBuilder}
        onImportSample={importSample}
        onImportExcel={importExcel}
      />

      {phase === 'start' && (
        <main className="single-step-workspace start-workspace">
          <section className="panel flow-step-panel start-flow-panel">
            <div className="start-hero">
              <span className="step-badge">1</span>
              <div>
                <Typography.Title level={3}>{t('start.title')}</Typography.Title>
                <Typography.Text type="secondary">{t('start.description')}</Typography.Text>
              </div>
            </div>

            <div className="start-option-grid">
              <Card className="start-option-card primary-start-card">
                <div className="start-option-icon"><FileAddOutlined /></div>
                <Typography.Title level={4}>{t('start.fromScratch')}</Typography.Title>
                <Typography.Paragraph type="secondary">{t('start.fromScratchDescription')}</Typography.Paragraph>
                <Space wrap>
                  <Button type="primary" onClick={() => startNewDocument('object')}>{t('start.objectDocument')}</Button>
                  <Button onClick={() => startNewDocument('array')}>{t('start.arrayDocument')}</Button>
                </Space>
              </Card>

              <Card className="start-option-card">
                <div className="start-option-icon"><ExperimentOutlined /></div>
                <Typography.Title level={4}>{t('start.analyzeSample')}</Typography.Title>
                <Typography.Paragraph type="secondary">{t('start.analyzeSampleDescription')}</Typography.Paragraph>
                <Button onClick={() => { setPrepareSource('sample'); setPhase('sample') }}>{t('start.goToSample')}</Button>
              </Card>

              <Card className="start-option-card excel-start-card">
                <div className="start-option-icon excel-start-icon"><FileExcelOutlined /></div>
                <Typography.Title level={4}>{t('start.excel')}</Typography.Title>
                <Typography.Paragraph type="secondary">{t('start.excelDescription')}</Typography.Paragraph>
                <Button onClick={() => document.getElementById('excel-import')?.click()}>{t('start.excelButton')}</Button>
              </Card>

              <Card className="start-option-card">
                <div className="start-option-icon"><FolderOpenOutlined /></div>
                <Typography.Title level={4}>{t('start.openExisting')}</Typography.Title>
                <Typography.Paragraph type="secondary">{t('start.openExistingDescription')}</Typography.Paragraph>
                <Button onClick={() => document.getElementById('builder-import')?.click()}>{t('header.openJson')}</Button>
              </Card>
            </div>

            <div className="start-guided-note">
              <ApartmentOutlined />
              <div>
                <strong>{t('start.guidedTitle')}</strong>
                <span>{t('start.guidedDescription')}</span>
              </div>
            </div>
          </section>
        </main>
      )}

      {phase === 'sample' && (
        <main className="single-step-workspace">
          <section className="panel flow-step-panel sample-flow-panel">
            <div className="analysis-actionbar friendly-actionbar">
              <div className="step-heading">
                <span className="step-badge">2</span>
                <div>
                  <Typography.Title level={5}>{t('sample.title')}</Typography.Title>
                  <Typography.Text type="secondary">
                    {t('sample.description')}
                  </Typography.Text>
                </div>
              </div>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                disabled={!sampleText.trim() || !!sampleError}
                onClick={() => runAnalysis()}
              >
                {t('sample.analyzeButton')}
              </Button>
            </div>
            <div className="sample-editor-shell">
              <RawEditor
                text={sampleText}
                error={sampleError}
                onChange={sampleRawChange}
                title={t('sample.editorTitle')}
                emptyStateLabel={t('sample.waiting')}
              />
            </div>
          </section>
        </main>
      )}

      {phase === 'analysis' && (
        <main className="single-step-workspace">
          <section className="panel flow-step-panel analysis-flow-panel">
            <div className="analysis-actionbar friendly-actionbar">
              <div className="step-heading">
                <span className="step-badge">2</span>
                <div>
                  <Typography.Title level={5}><ExperimentOutlined /> {t('analysis.title')}</Typography.Title>
                  <Typography.Text type="secondary">
                    {t('analysis.description')}
                  </Typography.Text>
                </div>
              </div>
              <Space>
                <Button onClick={() => setPhase('sample')}>{t('analysis.editSample')}</Button>
                <Button
                  icon={<ImportOutlined />}
                  onClick={() => {
                    history.replace(sampleValue)
                    setBuilderText(JSON.stringify(sampleValue, null, 2))
                    setBuilderError(null)
                    setSelectedPath([])
                    setWorkspaceView('visual')
                    setBuilderNeedsSampleShell(false)
                    setPhase('build')
                    messageApi.success(t('analysis.sampleIsBase'))
                  }}
                >
                  {t('analysis.useAsBase')}
                </Button>
              </Space>
            </div>
            <div className="analysis-results-shell">
              <AnalysisResults result={analysis} onBuild={buildFromAnalysis} />
            </div>
          </section>
        </main>
      )}

      {phase === 'excel' && excelWorkbook && (
        <main className="single-step-workspace excel-workspace">
          <section className="panel flow-step-panel excel-flow-panel">
            <ExcelMapper
              workbook={excelWorkbook}
              onLoadAnother={() => document.getElementById('excel-import')?.click()}
              onCreateComponent={component => {
                setGuidedComponents(current => [...current, component])
                messageApi.success(t('guided.created', { name: component.name }))
              }}
              onGenerate={value => {
                history.replace(value)
                setBuilderText(JSON.stringify(value, null, 2))
                setBuilderError(null)
                setSelectedPath([])
                setInspectorOpen(false)
                setWorkspaceView('visual')
                setBuilderNeedsSampleShell(false)
                setPhase('build')
                messageApi.success(t('excel.generated'))
              }}
            />
          </section>
        </main>
      )}

      {phase === 'build' && (
        <main className="builder-workspace-friendly">
          <aside className="panel components-panel">
            <Toolbox
              structures={analysis.structures}
              guidedComponents={guidedComponents}
              onCreateGuided={component => {
                setGuidedComponents(current => [...current, component])
                messageApi.success(t('guided.created', { name: component.name }))
              }}
              onDeleteGuided={id => setGuidedComponents(current => current.filter(component => component.id !== id))}
              onInsert={smartInsert}
              onDragStateChange={setDraggedTool}
            />
          </aside>

          <section className="panel main-workspace-panel">
            <div className="workspace-toolbar">
              <div className="workspace-location">
                <Typography.Text type="secondary" className="workspace-eyebrow">{t('builder.location')}</Typography.Text>
                <Breadcrumb items={breadcrumbs} />
              </div>
              <Segmented
                value={workspaceView}
                options={[
                  { value: 'visual', label: t('builder.visual'), icon: <ApartmentOutlined /> },
                  { value: 'json', label: 'JSON', icon: <CodeOutlined /> },
                  { value: 'references', label: t('builder.references'), icon: <LinkOutlined />, disabled: !analysisReady },
                  { value: 'analysis', label: t('builder.analysis'), icon: <ExperimentOutlined />, disabled: !analysisReady },
                ]}
                onChange={value => setWorkspaceView(value as WorkspaceView)}
              />
            </div>

            <div className={`workspace-content workspace-${workspaceView}`}>
              {renderWorkspace()}
            </div>
          </section>

          <Drawer
            title={t('builder.inspector')}
            placement="right"
            width={420}
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            destroyOnClose={false}
            className="inspector-drawer"
          >
            <PropertyEditor
              root={history.value}
              analysis={analysis}
              selectedPath={selectedPath}
              onRename={name => {
                const result = renameObjectKey(history.value, selectedPath, name)
                commit(result.value, result.path)
              }}
              onChangeType={(type: JsonType) => commit(setAtPath(history.value, selectedPath, defaultValueForType(type)))}
              onChangeValue={value => commit(setAtPath(history.value, selectedPath, value))}
              onDelete={() => {
                const parentPath = selectedPath.slice(0, -1)
                commit(deleteAtPath(history.value, selectedPath), parentPath)
                setInspectorOpen(false)
              }}
              onDuplicate={() => {
                const result = duplicateAtPath(history.value, selectedPath)
                commit(result.value, result.path)
              }}
              onMove={direction => {
                const result = moveArrayItem(history.value, selectedPath, direction)
                commit(result.value, result.path)
              }}
              onAddProperty={(key, type) => {
                const next = addObjectProperty(history.value, selectedPath, key, defaultValueForType(type))
                commit(next, [...selectedPath, key])
              }}
              onAddArrayItem={type => {
                const target = getAtPath(history.value, selectedPath)
                const nextIndex = Array.isArray(target) ? target.length : 0
                const next = appendArrayItem(history.value, selectedPath, defaultValueForType(type))
                commit(next, [...selectedPath, nextIndex])
              }}
              onNavigateSample={() => {
                setInspectorOpen(false)
                setPhase('sample')
              }}
            />
          </Drawer>
        </main>
      )}

      <footer className="status-bar friendly-status-bar">
        {phase === 'start' && <span className="status-neutral">● {t('start.ready')}</span>}
        {phase === 'sample' && (
          <span className={sampleError ? 'status-error' : sampleText.trim() ? 'status-ok' : 'status-neutral'}>
            ● {sampleError ? t('sample.invalid') : sampleText.trim() ? t('sample.ready') : t('sample.waiting')}
          </span>
        )}
        {phase === 'analysis' && <span className="status-ok">● {t('analysis.ready')}</span>}
        {phase === 'excel' && <span className="status-ok">● {t('excel.mappingReady')}</span>}
        {phase === 'build' && (
          <span className={builderError ? 'status-error' : 'status-ok'}>
            ● {builderError ? t('builder.invalidJson') : t('builder.validJson')}
          </span>
        )}
        <span>{t('common.componentsCount', { count: availableComponentCount })} · {t('common.uuidReferenceCount', { count: analysis.uuidReferences.length })}</span>
        {phase === 'build' && <span>{t('common.selected', { path: breadcrumbs.map(item => item.title).join(' › ') })}</span>}
      </footer>
    </Layout>
  )
}

function LocalizedStudio() {
  const { language } = useI18n()
  return (
    <ConfigProvider
      locale={language === 'es' ? esES : enUS}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          borderRadius: 12,
          fontSize: 14,
          colorPrimary: '#7c8cff',
          colorBgContainer: '#101827',
        },
      }}
    >
      <AntApp><Studio /></AntApp>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <LocalizedStudio />
    </I18nProvider>
  )
}
