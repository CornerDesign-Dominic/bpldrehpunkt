import { useState } from 'react'
import { updateBusinessPartnerPalletNote } from '../../lib/businessPartners.js'
import { formatPalletNumber } from './palletFormatters.js'

export default function PalletAccountOverviewCard({ account, accountError, partner, partnerId, onSaved }) {
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

  return <section className="pallet-account-overview-card">
    <div className="pallet-account-overview-card__balances"><div><span>Aktueller Saldo</span><strong>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong></div><div><span>Letzter Saldo</span><strong>{accountError || !account.latestClosing ? '—' : formatPalletNumber(account.latestClosing.balance, true)}</strong></div></div>
    <div className="pallet-account-overview-card__note">{hasChanges && <div className="pallet-account-overview-card__actions"><button className="button button--secondary" type="button" onClick={discardNoteChanges} disabled={isSaving}>Verwerfen</button><button className="button" type="button" onClick={saveNote} disabled={isSaving}>{isSaving ? 'Wird gespeichert …' : 'Speichern'}</button></div>}<textarea id="pallet-account-note" aria-label="Bemerkungen zum Palettenkonto" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Allgemeine Bemerkungen zum Geschäftspartner und Palettenkonto" />{error && <p className="field-error">{error}</p>}</div>
  </section>
}
