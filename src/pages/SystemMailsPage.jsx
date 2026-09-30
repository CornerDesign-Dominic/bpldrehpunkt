import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import SystemMailPanel from '../components/admin/SystemMailPanel.jsx'
import Toast from '../components/ui/Toast.jsx'
import { functions } from '../lib/firebase.js'
import '../styles/admin.css'

export default function SystemMailsPage() {
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  async function sendTestMail() {
    setSending(true)
    try {
      await httpsCallable(functions, 'sendSystemTestMail')()
      setToast('Testmail wurde an dein Benutzerprofil gesendet.')
    } catch {
      setToast('Die Testmail konnte nicht gesendet werden.')
    } finally {
      setSending(false)
    }
  }

  return <div className="admin-page system-mails-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="system-mails-page__test-card" aria-labelledby="system-mail-test-heading"><div><h2 id="system-mail-test-heading">Testmail</h2><p>Sendet die aktuelle Testvorlage an die E-Mail-Adresse deines Benutzerprofils.</p></div><div className="system-mails-page__test-actions"><button className="button button--secondary" type="button" onClick={sendTestMail} disabled={sending}>{sending ? 'Wird gesendet …' : 'Testmail senden'}</button></div></section>
    <SystemMailPanel />
  </div>
}
