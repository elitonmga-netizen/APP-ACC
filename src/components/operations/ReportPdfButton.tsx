import { useState } from 'react'
import { apiEnabled, downloadReportPdf } from '../../services/http'
import { useSessionUser } from '../session-context'
import type { ServiceOrder } from '../../models/operational'

export function ReportPdfButton({ order }: { order: ServiceOrder }) {
  const user = useSessionUser()
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  if (!apiEnabled || !order.technicalReport || !user || !['Administrador', 'Gestor'].includes(user.role)) return null
  const download = async () => {
    setError(''); setDownloading(true)
    try { await downloadReportPdf(order.id, order.code) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível baixar o PDF.') }
    finally { setDownloading(false) }
  }
  return <div className="report-pdf-action"><button type="button" className="primary-button" disabled={downloading} onClick={() => void download()} aria-label={`Baixar PDF da ordem ${order.code}`}>{downloading ? 'Gerando PDF…' : 'Baixar PDF'}</button>{error && <p role="alert">{error}</p>}</div>
}
