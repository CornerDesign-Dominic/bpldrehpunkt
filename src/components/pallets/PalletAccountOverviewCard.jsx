import { useState } from 'react'
import { updateBusinessPartnerPalletNote } from '../../lib/businessPartners.js'
import { formatPalletNumber } from './palletFormatters.js'

export default function PalletAccountOverviewCard({ account, accountError, partner, partnerId, onSaved }) {
  const [note, setNote] = useState(partner.palletNote ?? '')
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveNote() {
    setSaving(true)
    setError('')
    try {
      await updateBusinessPartnerPalletNote(partnerId, note)
      onSaved(note)
    } catch {
      setError('Die Palettenbemerkung konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="pallet-account-overview-card">
    <div className="pallet-account-overview-card__balances"><div><span>Aktueller Saldo</span><strong>{accountError ? '—' : formatPalletNumber(account.balance, true)}</strong></div><div><span>Letzter Saldo</span><strong>{accountError || !account.latestClosing ? '—' : formatPalletNumber(account.latestClosing.balance, true)}</strong></div></div>
    <div className="pallet-account-overview-card__note"><div className="pallet-account-overview-card__note-header"><label htmlFor="pallet-account-note">Bemerkungen zum Palettenkonto</label><div className="pallet-account-overview-card__actions"><button className="button button--secondary" type="button" onClick={saveNote} disabled={isSaving}>{isSaving ? 'Wird gespeichert …' : 'Speichern'}</button></div></div><textarea id="pallet-account-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Allgemeine Bemerkungen zum Geschäftspartner und Palettenkonto" />{error && <p className="field-error">{error}</p>}</div>
  </section>
}
