import { useState } from 'react'
import { Link } from 'react-router-dom'
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
    <div className="system-mails-page__toolbar"><Link className="button button--secondary" to="/admin">Zum Adminbereich</Link><button className="button button--secondary" type="button" onClick={sendTestMail} disabled={sending}>{sending ? 'Wird gesendet …' : 'Testmail senden'}</button></div>
    <SystemMailPanel />
  </div>
}
