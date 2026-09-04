import { useState } from 'react'
import { updateBusinessPartnerPalletNote } from '../../lib/businessPartners.js'
import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'
import { getPartnerEvaluationStatus, PARTNER_EVALUATION_STATUS_LABELS } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'

export default function PalletAccountOverviewCard({ account, accountError, partner, partnerId, onSaved, canEdit }) {
  const { settings } = usePartnerEvaluationSettings()
  const initialNote = partner.palletNote ?? ''
  const [note, setNote] = useState(initialNote)
  const [savedNote, setSavedNote] = useState(initialNote)
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const hasChanges = note !== savedNote

  async function saveNote() {
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerPalletNote(partnerId, note)
      setSavedNote(note)
      onSaved(note)
    } catch {
      setError('Die Palettenbemerkung konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  function discardNoteChanges() {
    setNote(savedNote)
    setError('')
  }

  const status = getPartnerEvaluationStatus('pallets', accountError ? null : account.balance, settings)
  return <section className="pallet-account-overview-card">
    <div className="pallet-account-overview-card__balances"><div><span>Aktueller Saldo</span><strong data-status={status}>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong><span className="partner-evaluation-label" data-status={status}>{PARTNER_EVALUATION_STATUS_LABELS[status]}</span></div><div><span>Letzter Saldo</span><strong>{accountError || !account.latestClosing?.date ? '—' : formatPalletDate(account.latestClosing.date)}</strong></div></div>
    <div className="pallet-account-overview-card__note">{canEdit && hasChanges && <div className="pallet-account-overview-card__actions"><button className="button button--secondary" type="button" onClick={discardNoteChanges} disabled={isSaving}>Verwerfen</button><button className="button" type="button" onClick={saveNote} disabled={isSaving}>{isSaving ? 'Wird gespeichert …' : 'Speichern'}</button></div>}<textarea id="pallet-account-note" aria-label="Bemerkungen zum Palettenkonto" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Allgemeine Bemerkungen zum Geschäftspartner und Palettenkonto" readOnly={!canEdit} />{error && <p className="field-error">{error}</p>}</div>
  </section>
}
