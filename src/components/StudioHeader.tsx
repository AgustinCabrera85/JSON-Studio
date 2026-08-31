import {
  CopyOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Button, Segmented, Space, Tooltip, Typography, message } from 'antd'
import { useI18n } from '../i18n'
import type { JsonValue } from '../types/json'

type WorkflowPhase = 'start' | 'sample' | 'analysis' | 'excel' | 'build'

interface StudioHeaderProps {
  phase: WorkflowPhase
  analysisReady: boolean
  excelReady: boolean
  prepareSource: 'sample' | 'excel' | null
  value: JsonValue
  canUndo: boolean
  canRedo: boolean
  onPhaseChange: (phase: WorkflowPhase) => void
  onUndo: () => void
  onRedo: () => void
  onImportBuilder: (file: File) => void
  onImportSample: (file: File) => void
  onImportExcel: (file: File) => void
}

export const StudioHeader = ({
  phase,
  analysisReady,
  excelReady,
  prepareSource,
  value,
  canUndo,
  canRedo,
  onPhaseChange,
  onUndo,
  onRedo,
  onImportBuilder,
  onImportSample,
  onImportExcel,
}: StudioHeaderProps) => {
  const [messageApi, contextHolder] = message.useMessage()
  const { language, setLanguage, t } = useI18n()

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'document.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
    messageApi.success(t('header.jsonCopied'))
  }

  const activeStep = phase === 'start' ? 0 : phase === 'sample' || phase === 'analysis' || phase === 'excel' ? 1 : 2
  const steps = [
    {
      index: 0,
      label: t('header.start'),
      caption: t('header.startCaption'),
      disabled: false,
      done: phase !== 'start',
      action: () => onPhaseChange('start'),
    },
    {
      index: 1,
      label: t('header.prepare'),
      caption: t('header.prepareCaption'),
      disabled: false,
      done: analysisReady || (prepareSource === 'excel' && excelReady),
      action: () => onPhaseChange(prepareSource === 'excel' && excelReady ? 'excel' : analysisReady ? 'analysis' : 'sample'),
    },
    {
      index: 2,
      label: t('header.build'),
      caption: t('header.buildCaption'),
      disabled: false,
      done: phase === 'build',
      action: () => onPhaseChange('build'),
    },
    {
      index: 3,
      label: t('header.export'),
      caption: t('header.exportCaption'),
      disabled: phase !== 'build',
      done: false,
      action: exportJson,
    },
  ]

  const openTargetsBuilder = phase === 'start' || phase === 'build'
  const openLabel = phase === 'excel'
    ? t('excel.loadAnother')
    : phase === 'start' || phase === 'build'
      ? t('header.openJson')
      : phase === 'analysis'
        ? t('header.loadAnotherSample')
        : t('header.loadSample')

  return (
    <header className="studio-header friendly-header">
      {contextHolder}
      <div className="header-top-row">
        <div className="brand-block">
          <Typography.Title level={3}>Gerardo&apos;s awesome JSON Studio</Typography.Title>
          <Typography.Text type="secondary">{t('header.taglineV9')}</Typography.Text>
        </div>

        <div className="workflow-steps" aria-label={t('header.workflowAria')}>
          {steps.map(step => (
            <button
              type="button"
              key={step.index}
              disabled={step.disabled}
              className={`workflow-step ${step.index === activeStep ? 'active' : ''} ${step.done ? 'done' : ''}`}
              onClick={step.action}
            >
              <span className="workflow-step-number">{step.index + 1}</span>
              <span className="workflow-step-copy">
                <strong>{step.label}</strong>
                <small>{step.caption}</small>
              </span>
            </button>
          ))}
        </div>

        <Space wrap className="header-actions">
          <Tooltip title={t('language.label')}>
            <Segmented
              className="language-switcher"
              size="small"
              value={language}
              options={[
                { label: <span><GlobalOutlined /> EN</span>, value: 'en' },
                { label: 'ES', value: 'es' },
              ]}
              onChange={value => setLanguage(value as 'en' | 'es')}
              aria-label={t('language.label')}
            />
          </Tooltip>
          {phase === 'build' && <Button icon={<UndoOutlined />} disabled={!canUndo} onClick={onUndo} />}
          {phase === 'build' && <Button icon={<RedoOutlined />} disabled={!canRedo} onClick={onRedo} />}
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => document.getElementById(phase === 'excel' ? 'excel-import' : openTargetsBuilder ? 'builder-import' : 'sample-import')?.click()}
          >
            {openLabel}
          </Button>
          <input
            id="builder-import"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) onImportBuilder(file)
              event.currentTarget.value = ''
            }}
          />
          <input
            id="sample-import"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) onImportSample(file)
              event.currentTarget.value = ''
            }}
          />
          <input
            id="excel-import"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) onImportExcel(file)
              event.currentTarget.value = ''
            }}
          />
          {phase === 'build' && <Button icon={<CopyOutlined />} onClick={copy}>{t('common.copy')}</Button>}
          {phase === 'build' && <Button type="primary" icon={<DownloadOutlined />} onClick={exportJson}>{t('common.export')}</Button>}
        </Space>
      </div>
    </header>
  )
}
