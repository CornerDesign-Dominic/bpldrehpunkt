import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPasswordReset, signInWithEmail } from '../auth/authService.js'
import { loginErrorMessage } from '../auth/loginFeedback.js'
import { passwordResetErrorMessage, passwordResetSuccessMessage } from '../auth/passwordResetFeedback.js'
import { useAuth } from '../auth/useAuth.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const { accessDenied } = useAuth()
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
      setError(loginErrorMessage(authError))
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
      setNotice(passwordResetSuccessMessage)
    } catch (resetError) {
      const message = passwordResetErrorMessage(resetError)
      if (message) setError(message)
      else setNotice(passwordResetSuccessMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isResetMode = mode === 'reset'

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-card__brand"><span><StaticText source={"Drehpunkt"} /></span><p><StaticText source={"Eine Anwendung der Brennpunkt Logistik GmbH"} /></p></div>
      <div className="login-card__heading"><h1 id="login-title">{<StaticText source={isResetMode ? 'Passwort zurücksetzen' : 'Anmelden'} />}</h1>{isResetMode && <p><StaticText source={"Geben Sie Ihre E-Mail-Adresse ein."} /></p>}</div>
      {accessDenied && <p className="login-message login-message--error"><StaticText source={"Dieses Benutzerkonto ist nicht für den Zugriff freigegeben."} /></p>}
      <form className="login-form" onSubmit={isResetMode ? handlePasswordReset : handleLogin}>
        <label><span><StaticText source={"E-Mail"} /></span><input autoComplete="email" autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {!isResetMode && <label><span><StaticText source={"Passwort"} /></span><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
        {error && <p className="login-message login-message--error" role="alert">{<StaticText source={error} />}</p>}
        {notice && <p className="login-message login-message--notice" role="status">{<StaticText source={notice} />}</p>}
        <button className="button" type="submit" disabled={isSubmitting}>{<StaticText source={isSubmitting ? 'Bitte warten …' : isResetMode ? 'Reset-Mail senden' : 'Anmelden'} />}</button>
      </form>
      <button className="text-button login-card__switch" type="button" disabled={isSubmitting} onClick={() => switchMode(isResetMode ? 'login' : 'reset')}>{<StaticText source={isResetMode ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'} />}</button>
    </section>
  </main>
}
