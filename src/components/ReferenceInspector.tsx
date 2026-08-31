import { AimOutlined, LinkOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Divider, Space, Tag, Typography } from 'antd'
import { formatJsonPath } from '../analyzer/analyzeJson'
import type { UuidReference } from '../analyzer/types'
import { useI18n } from '../i18n'
import type { JsonPath } from '../types/json'

interface ReferenceInspectorProps {
  uuid?: string
  reference?: UuidReference
  onNavigateSample?: (path: JsonPath) => void
}

export const ReferenceInspector = ({ uuid, reference, onNavigateSample }: ReferenceInspectorProps) => {
  const { t } = useI18n()
  if (!uuid) return null

  return (
    <>
      <Divider />
      <Typography.Title level={5}><LinkOutlined /> {t('references.guidTitle')}</Typography.Title>
      {!reference ? (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={t('references.uuidDetected')}
          description={t('references.uuidNotIndexed')}
        />
      ) : (
        <Card size="small" className="reference-card">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">{t('references.inferredAlias')}</Typography.Text>
              <div><strong>{reference.alias}</strong></div>
            </div>
            <Typography.Text code copyable>{reference.uuid}</Typography.Text>
            {reference.target ? (
              <div>
                <Tag color="success">{t('common.resolved')}</Tag>
                <Typography.Text>{formatJsonPath(reference.target.path)}</Typography.Text>
                {onNavigateSample && (
                  <Button type="link" size="small" icon={<AimOutlined />} onClick={() => onNavigateSample(reference.target!.path)}>
                    {t('references.viewInSample')}
                  </Button>
                )}
              </div>
            ) : <Tag color="warning">{t('references.noDefinitionIdentified')}</Tag>}
            <div><Typography.Text type="secondary">{t('references.found', { count: reference.references.length })}</Typography.Text></div>
          </Space>
        </Card>
      )}
    </>
  )
}
