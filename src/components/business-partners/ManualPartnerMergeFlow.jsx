import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { matchingManualMergePartners } from '../../lib/manualPartnerMergeSearch.js'
import { mergeManualPartners, prepareManualPartnerMerge } from '../../lib/manualPartnerMerges.js'
import { mergeComparison, mergeDecisionSummary } from '../../lib/partnerMergeDecisions.js'
import { partnerReferenceNumbers } from '../../lib/partnerReferencePresentation.js'
import PartnerMergeReview from './PartnerMergeReview.jsx'

const messageOf = (error, fallback) => error instanceof Error ? error.message : fallback

export default function ManualPartnerMergeFlow({ currentPartnerId, direction, onClose, onMerged }) {
  const [partners, setPartners] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState(null)
  const searchRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    let active = true
    void listBusinessPartners().then((items) => { if (active) setPartners(items) }).catch((caught) => { if (active) setError(messageOf(caught, 'Die Partner konnten nicht geladen werden.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { if (review) closeRef.current?.focus(); else searchRef.current?.focus() }, [review])

  async function choosePartner(partner) {
    setBusy(true); setError('')
    try {
      const prepared = await prepareManualPartnerMerge({ currentPartnerId, otherPartnerId: partner.id, direction })
      setReview({ ...prepared, otherPartnerId: partner.id, comparison: mergeComparison(prepared.merge, prepared.targetPartnerId) })
    } catch (caught) { setError(messageOf(caught, 'Der Partner konnte nicht geprüft werden.')) } finally { setBusy(false) }
  }

  async function confirmMerge() {
    if (!review) return
    setBusy(true); setError('')
    try {
      const result = await mergeManualPartners({ currentPartnerId, otherPartnerId: review.otherPartnerId, direction, partnerVersions: Object.fromEntries(review.merge.partners.map((partner) => [partner.id, partner.version])), decisions: review.comparison.decisions })
      await onMerged(result)
    } catch (caught) {
      const message = messageOf(caught, 'Die Partner konnten nicht zusammengeführt werden.')
      if (message.includes('inzwischen geändert')) {
        try {
          const prepared = await prepareManualPartnerMerge({ currentPartnerId, otherPartnerId: review.otherPartnerId, direction })
          setReview({ ...prepared, otherPartnerId: review.otherPartnerId, comparison: mergeComparison(prepared.merge, prepared.targetPartnerId) })
          setError('Die Stammdaten wurden zwischenzeitlich geändert. Bitte den Vergleich erneut prüfen.')
        } catch { setReview(null); setError(message) }
      } else if (message.includes('archiviert') || message.includes('nicht mehr aktiv')) {
        setReview(null); setError(message)
        try { setPartners(await listBusinessPartners()) } catch { /* Die serverseitige Prüfung bleibt maßgeblich. */ }
      } else setError(message)
    } finally { setBusy(false) }
  }

  const matches = matchingManualMergePartners(partners, currentPartnerId, query)
  return createPortal(<div className="masterdata-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}><section className={`customer-import-modal manual-partner-merge-modal${review ? ' customer-import-modal--merge' : ''}`} role="dialog" aria-modal="true" aria-labelledby="manual-merge-modal-title"><div className="customer-import-modal__heading"><div><h2 id="manual-merge-modal-title">{review ? 'Partner zusammenführen' : 'Partner auswählen'}</h2><p>{review ? 'Vergleiche die Stammdaten und entscheide über abweichende Werte.' : direction === 'current-source' ? 'Dieser Partner wird archiviert. Wähle das Stammdatenblatt, das erhalten bleibt.' : 'Dieser Partner bleibt erhalten. Wähle das Stammdatenblatt, das archiviert wird.'}</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Dialog schließen" disabled={busy}><CloseIcon /></button></div>
    {error && <p className="form-error">{error}</p>}
    {review ? <><PartnerMergeReview merge={review.merge} selectedId={review.targetPartnerId} onSelect={() => {}} comparison={review.comparison} onDecision={(key, decision) => setReview((current) => ({ ...current, comparison: { ...current.comparison, decisions: { ...current.comparison.decisions, [key]: decision } } }))} locked /><div className="customer-import-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Abbrechen</button><button className="button" type="button" onClick={() => void confirmMerge()} disabled={busy || mergeDecisionSummary(review.comparison.rows, review.comparison.decisions).open > 0}>{busy ? 'Zusammenführung läuft …' : 'Partner zusammenführen'}</button></div></> : <><label className="manual-partner-merge-modal__search"><span>Firmenname, Debitoren- oder Kreditorennummer</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Partner suchen …" /></label><div className="manual-partner-merge-modal__results">{loading ? <p>Partner werden geladen …</p> : matches.length === 0 ? <p>Kein aktiver Partner gefunden.</p> : <ul>{matches.slice(0, 30).map((partner) => <li key={partner.id}><button type="button" onClick={() => void choosePartner(partner)} disabled={busy}><strong>{partner.companyName || 'Ohne Firmennamen'}</strong><span>Debitor: {partnerReferenceNumbers(partner, 'debtor').numbers.join(', ') || '—'} · Kreditor: {partnerReferenceNumbers(partner, 'creditor').numbers.join(', ') || '—'}</span><span>Ort: {partner.address?.city || '—'}</span></button></li>)}</ul>}{matches.length > 30 && <p>Bitte die Suche eingrenzen. Es werden die ersten 30 Treffer angezeigt.</p>}</div><div className="customer-import-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Abbrechen</button></div></>}
  </section></div>, document.body)
}
