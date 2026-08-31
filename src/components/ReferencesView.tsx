import { AimOutlined, LinkOutlined } from '@ant-design/icons'
import { Empty, Tag, Typography } from 'antd'
import { formatJsonPath } from '../analyzer/analyzeJson'
import type { JsonAnalysisResult } from '../analyzer/types'
import { useI18n } from '../i18n'

export const ReferencesView = ({ analysis }: { analysis: JsonAnalysisResult }) => {
  const { t } = useI18n()
  if (analysis.uuidReferences.length === 0) {
    return <Empty description={t('references.empty')} />
  }

  return (
    <div className="references-view">
      <div className="secondary-view-heading">
        <Typography.Title level={4}>{t('references.title')}</Typography.Title>
        <Typography.Text type="secondary">{t('references.description')}</Typography.Text>
      </div>
      <div className="reference-browser-list">
        {analysis.uuidReferences.map(reference => (
          <article key={reference.uuid} className="reference-browser-card">
            <div className="reference-browser-icon"><LinkOutlined /></div>
            <div className="reference-browser-content">
              <div className="reference-browser-title-row">
                <strong>{reference.alias}</strong>
                <Tag color={reference.unresolved ? 'warning' : 'success'}>{reference.unresolved ? t('common.noDefinition') : t('common.resolved')}</Tag>
              </div>
              <Typography.Text code copyable>{reference.uuid}</Typography.Text>
              {reference.target && (
                <div className="reference-browser-target"><AimOutlined /> {t('references.definedAt', { path: formatJsonPath(reference.target.path) })}</div>
              )}
              <div className="reference-browser-uses">
                <Typography.Text type="secondary">{t('references.found', { count: reference.references.length })}</Typography.Text>
                <div>
                  {reference.references.slice(0, 6).map((location, index) => <Tag key={index}>{formatJsonPath(location.path)}</Tag>)}
                  {reference.references.length > 6 && <Tag>+{reference.references.length - 6}</Tag>}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
