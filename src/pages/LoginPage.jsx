import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPasswordReset, signInWithEmail } from '../auth/authService.js'

const resetSuccessMessage = 'Wenn ein Benutzerkonto für diese E-Mail-Adresse besteht, wurde eine E-Mail zum Zurücksetzen des Passworts versendet.'

function getLoginErrorMessage(error) {
  if (error?.code === 'auth/too-many-requests') return 'Zu viele Anmeldeversuche. Bitte versuchen Sie es später erneut.'
  if (error?.code === 'auth/network-request-failed') return 'Die Anmeldung konnte wegen eines Netzwerkfehlers nicht abgeschlossen werden.'
  return 'E-Mail oder Passwort sind nicht korrekt.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      await signInWithEmail(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (authError) {
      setError(getLoginErrorMessage(authError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setNotice(resetSuccessMessage)
    } catch {
      setNotice(resetSuccessMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isResetMode = mode === 'reset'

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-card__brand"><span>Drehpunkt</span><p>Interne Anwendung</p></div>
      <div className="login-card__heading"><h1 id="login-title">{isResetMode ? 'Passwort zurücksetzen' : 'Anmelden'}</h1><p>{isResetMode ? 'Geben Sie Ihre E-Mail-Adresse ein.' : 'Melden Sie sich mit Ihrem Benutzerkonto an.'}</p></div>
      <form className="login-form" onSubmit={isResetMode ? handlePasswordReset : handleLogin}>
        <label><span>E-Mail</span><input autoComplete="email" autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {!isResetMode && <label><span>Passwort</span><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
        {error && <p className="login-message login-message--error">{error}</p>}
        {notice && <p className="login-message login-message--notice">{notice}</p>}
        <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Bitte warten …' : isResetMode ? 'Reset-Mail senden' : 'Anmelden'}</button>
      </form>
      <button className="text-button login-card__switch" type="button" onClick={() => switchMode(isResetMode ? 'login' : 'reset')}>{isResetMode ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'}</button>
    </section>
  </main>
}
