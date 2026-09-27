import { useEffect, useRef, useState } from 'react'
import { blobToDataUrl, companyStampErrorMessage, loadCompanyStamp } from '../lib/companyMasterData.js'
import { documentAssetDiagnosticCode } from '../lib/diagnosticClassification.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'

function reportStampLoadFailure(cause) {
  const code = documentAssetDiagnosticCode(cause)
  if (code) void reportTechnicalFailure({ module: 'document-templates', stage: 'company-stamp-load', code })
}

export function useCompanyStamp(setDocumentData) {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    let current = true
    loadCompanyStamp().then(() => { if (current) setAvailable(true) }).catch((cause) => {
      if (current) {
        reportStampLoadFailure(cause)
        setError(companyStampErrorMessage(cause))
      }
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false; requestId.current += 1 }
  }, [])

  async function toggle(checked) {
    const id = ++requestId.current
    setEnabled(checked)
    setError('')
    if (!checked) {
      setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, stamp: null } }))
      return
    }
    setLoading(true)
    try {
      const imageData = await blobToDataUrl(await loadCompanyStamp())
      if (id !== requestId.current) return
      setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, stamp: { imageData, imageUrl: imageData } } }))
    } catch (cause) {
      if (id !== requestId.current) return
      reportStampLoadFailure(cause)
      setEnabled(false)
      setAvailable(false)
      setError(companyStampErrorMessage(cause))
    } finally { if (id === requestId.current) setLoading(false) }
  }

  function reset() { requestId.current += 1; setEnabled(false); setLoading(false) }

  return { available, enabled, loading, error, toggle, reset }
}
