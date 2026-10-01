import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { db, functions } from '../../lib/firebase.js'

const settingsRef = doc(db, 'systemSettings', 'automaticMailDelivery')

export default function AutomaticMailDeliveryPanel() {
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  useEffect(() => onSnapshot(settingsRef, (snapshot) => {
    setPaused(snapshot.data()?.paused === true)
    setLoading(false)
    setError('')
  }, () => {
    setLoading(false)
    setError('Der Status für automatische E-Mails konnte nicht geladen werden.')
  }), [])

  async function save(nextPaused) {
    setSaving(true)
    setError('')
    try {
      await httpsCallable(functions, 'updateAutomaticMailDelivery')({ paused: nextPaused })
      setConfirmationOpen(false)
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Der Versandstatus konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const stateLabel = paused ? 'Pausiert' : 'Aktiv'
  return <>
    <TranslatedProps sources={{"title":"Automatische E-Mails pausieren?"}}><ConfirmDialog
      open={confirmationOpen}
      title="Automatische E-Mails pausieren?"
      message="Sendungsverfolgung, Frist-Erinnerungen und automatische Urlaubsbenachrichtigungen werden sofort angehalten. Manuell ausgelöste Mails bleiben möglich."
      confirmLabel="Automatische E-Mails pausieren"
      submittingLabel="Wird pausiert …"
      isSubmitting={saving}
      onCancel={() => setConfirmationOpen(false)}
      onConfirm={() => void save(true)}
    /></TranslatedProps>
    <section className="admin-panel automatic-mail-delivery" aria-labelledby="automatic-mail-delivery-title">
      <div className="admin-panel__heading">
        <div><h2 id="automatic-mail-delivery-title"><StaticText source={"Automatische E-Mails"} /></h2><p><StaticText source={"Globaler Versandstatus:"} /> <strong>{<StaticText source={loading ? 'Wird geladen …' : stateLabel} />}</strong></p></div>
        <div className="admin-panel__actions">
          <button className={paused ? 'button' : 'button button--danger'} type="button" disabled={loading || saving} onClick={() => paused ? void save(false) : setConfirmationOpen(true)}>{<StaticText source={saving ? 'Wird gespeichert …' : paused ? 'Automatische E-Mails aktivieren' : 'Automatische E-Mails pausieren'} />}</button>
        </div>
      </div>
      <p className="automatic-mail-delivery__hint"><StaticText source={"Betrifft nur automatisch ausgelöste Mails. Manuelle Tracking- und Testmails bleiben verfügbar."} /></p>
      {error && <p className="form-error">{<StaticText source={error} />}</p>}
    </section>
  </>
}
