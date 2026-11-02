import { useEffect } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

export default function PartnerReferenceWarning({ records }) {
  const failedId = records.find((record) => record.partnerReferenceFailed)?.id || ''
  useEffect(() => {
    if (failedId) void reportTechnicalFailure({ module: 'partner-links', stage: 'resolve-list', recordId: failedId, error: new Error('Ungültige Partner-Weiterleitung in der Liste.') })
  }, [failedId])
  return failedId ? <p className="form-error" role="alert"><StaticText source="Eine Partner-Weiterleitung konnte nicht aufgelöst werden. Betroffene Vorgänge zeigen ihren gespeicherten Namen. Bitte die Stammdaten prüfen." /></p> : null
}
