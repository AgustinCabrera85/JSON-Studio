import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { Button, Card, Collapse, Empty, Progress, Space, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { formatJsonPath } from '../analyzer/analyzeJson'
import type { DiscoveredStructure, FieldAnalysis, JsonAnalysisResult, UuidReference } from '../analyzer/types'
import { useI18n } from '../i18n'

const frequencyColor: Record<FieldAnalysis['frequency'], string> = {
  required: 'success',
  common: 'processing',
  optional: 'default',
  rare: 'warning',
}

const StructureDetails = ({ structure }: { structure: DiscoveredStructure }) => {
  const { t } = useI18n()
  const frequencyLabel: Record<FieldAnalysis['frequency'], string> = {
    required: t('common.requiredTitle'),
    common: t('common.frequent'),
    optional: t('common.optionalTitle'),
    rare: t('common.rare'),
  }
  const columns: ColumnsType<FieldAnalysis> = [
    { title: t('common.field'), dataIndex: 'name', key: 'name', render: value => <Typography.Text strong>{value}</Typography.Text> },
    { title: t('common.type'), key: 'type', width: 105, render: (_, field) => <Tag>{field.dominantType}</Tag> },
    { title: t('common.presence'), key: 'presence', width: 140, render: (_, field) => <Progress percent={Math.round(field.presence * 100)} size="small" /> },
    { title: t('common.usage'), key: 'frequency', width: 120, render: (_, field) => <Tag color={frequencyColor[field.frequency]}>{frequencyLabel[field.frequency]}</Tag> },
    {
      title: t('common.detected'), key: 'inference', render: (_, field) => (
        <Space wrap>
          {field.uuidLike && <Tag color="purple">GUID / UUID</Tag>}
          {field.constantValue !== undefined && <Tag color="cyan">{t('analysis.fixedValue')}</Tag>}
          {field.enumValues && <Tag color="geekblue">{t('analysis.listValues', { count: field.enumValues.length })}</Tag>}
        </Space>
      ),
    },
  ]

  return (
    <div className="structure-details">
      <Table<FieldAnalysis>
        rowKey="name"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={structure.fields}
        scroll={{ x: 650 }}
      />
      <div className="structure-json-grid">
        <div>
          <Typography.Text type="secondary">{t('analysis.essentialVersion')}</Typography.Text>
          <pre>{JSON.stringify(structure.minimalValue, null, 2)}</pre>
        </div>
        <div>
          <Typography.Text type="secondary">{t('analysis.completeVersion')}</Typography.Text>
          <pre>{JSON.stringify(structure.recommendedValue, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

const StructureCard = ({ structure }: { structure: DiscoveredStructure }) => {
  const { t } = useI18n()
  const required = structure.fields.filter(field => field.frequency === 'required').length
  const common = structure.fields.filter(field => field.frequency === 'common').length

  return (
    <Card className="analysis-component-card" size="small">
      <div className="analysis-component-heading">
        <div className="analysis-component-icon"><ApartmentOutlined /></div>
        <div>
          <Typography.Title level={5}>{structure.name}</Typography.Title>
          <Typography.Text type="secondary">
            {structure.instances === 1
              ? t('analysis.objectFound', { count: structure.instances })
              : t('analysis.objectsFound', { count: structure.instances })}
          </Typography.Text>
        </div>
      </div>
      <div className="analysis-component-stats">
        <span><strong>{required}</strong> {t('common.required')}</span>
        <span><strong>{common}</strong> {t('common.frequent').toLowerCase()}</span>
        <span><strong>{Math.round(structure.confidence * 100)}%</strong> {t('analysis.confidence')}</span>
      </div>
      <div className="analysis-component-fields">
        {structure.fields.slice(0, 5).map(field => <Tag key={field.name}>{field.name}</Tag>)}
        {structure.fields.length > 5 && <Tag>+{structure.fields.length - 5}</Tag>}
      </div>
      <Collapse
        ghost
        size="small"
        items={[{ key: 'details', label: t('analysis.viewStructure'), children: <StructureDetails structure={structure} /> }]}
      />
    </Card>
  )
}

const Structures = ({ result }: { result: JsonAnalysisResult }) => {
  const { t } = useI18n()
  return result.structures.length === 0 ? <Empty description={t('analysis.noStructures')} /> : (
    <div className="analysis-component-grid">
      {result.structures.filter(structure => !structure.contexts.includes('Root')).map(structure => (
        <StructureCard key={structure.id} structure={structure} />
      ))}
    </div>
  )
}

const References = ({ references }: { references: UuidReference[] }) => {
  const { t } = useI18n()
  if (references.length === 0) return <Empty description={t('analysis.noUuids')} />
  return (
    <div className="reference-list">
      {references.map(reference => (
        <Card key={reference.uuid} size="small" className="reference-result-card">
          <div className="reference-result-heading">
            <div className="reference-result-name">
              <div className="reference-icon"><LinkOutlined /></div>
              <div>
                <strong>{reference.alias}</strong>
                <div><Typography.Text type="secondary">{reference.uuid}</Typography.Text></div>
              </div>
            </div>
            {reference.unresolved ? <Tag color="warning">{t('common.unresolved')}</Tag> : <Tag color="success">{t('common.resolved')}</Tag>}
          </div>
          {reference.target && (
            <div className="reference-path"><Typography.Text type="secondary">{t('common.definition')}</Typography.Text> {formatJsonPath(reference.target.path)}</div>
          )}
          <div className="reference-path"><Typography.Text type="secondary">{t('common.usedIn')}</Typography.Text> {t('common.locations', { count: reference.references.length })}</div>
          <div className="reference-tags">
            {reference.references.slice(0, 4).map((location, index) => (
              <Tag key={`${reference.uuid}-${index}`}>{formatJsonPath(location.path)}</Tag>
            ))}
            {reference.references.length > 4 && <Tag>+{reference.references.length - 4}</Tag>}
          </div>
        </Card>
      ))}
    </div>
  )
}

export const AnalysisResults = ({
  result,
  onBuild,
}: {
  result: JsonAnalysisResult
  onBuild?: () => void
}) => {
  const { t } = useI18n()
  const totalNodes = result.objectCount + result.arrayCount + result.primitiveCount
  const resolved = result.uuidReferences.filter(reference => !reference.unresolved).length
  const discovered = result.structures.filter(structure => !structure.contexts.includes('Root')).length

  return (
    <div className="analysis-results friendly-analysis-results">
      <div className="analysis-success-banner">
        <div className="analysis-success-icon"><CheckCircleOutlined /></div>
        <div className="analysis-success-copy">
          <Typography.Title level={4}>{t('analysis.complete')}</Typography.Title>
          <Typography.Text type="secondary">{t('analysis.completeDescription')}</Typography.Text>
        </div>
        {onBuild && (
          <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={onBuild}>
            {t('analysis.createDocument')}
          </Button>
        )}
      </div>

      <div className="analysis-stats friendly-stats">
        <Card size="small"><span>{t('analysis.nodesAnalyzed')}</span><strong>{totalNodes}</strong></Card>
        <Card size="small"><span>{t('analysis.components')}</span><strong>{discovered}</strong></Card>
        <Card size="small"><span>GUIDs / UUIDs</span><strong>{result.uuidReferences.length}</strong></Card>
        <Card size="small"><span>{t('analysis.referencesResolved')}</span><strong>{resolved}</strong></Card>
        <Card size="small"><span>{t('analysis.depth')}</span><strong>{result.maxDepth}</strong></Card>
      </div>

      <Tabs
        defaultActiveKey="structures"
        items={[
          { key: 'structures', label: t('analysis.detectedComponents', { count: discovered }), children: <Structures result={result} /> },
          { key: 'references', label: t('analysis.referencesTab', { count: result.uuidReferences.length }), children: <References references={result.uuidReferences} /> },
        ]}
      />
    </div>
  )
}
