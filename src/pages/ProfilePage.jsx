import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { useTheme } from '../theme/useTheme.js'
import Toast from '../components/ui/Toast.jsx'
import {
  deleteCurrentUserSignature,
  loadCurrentUserSignature,
  signatureErrorMessage,
  uploadCurrentUserSignature,
  validateSignatureFile,
} from '../lib/userSignature.js'
import '../styles/profile.css'

function formatDate(value) {
  if (!value) return '—'
  const date = value.toDate?.() ?? new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrator'
  if (role === 'user') return 'Benutzer'
  return role || '—'
}

function ProfileInfoSection({ title, fields }) {
  return <section className="profile-section"><h2>{title}</h2><dl className="profile-readonly-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
}

function SignatureSection({ user }) {
  const inputRef = useRef(null)
  const previewUrlRef = useRef('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const setPreviewFromBlob = useCallback((blob) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const nextUrl = URL.createObjectURL(blob)
    previewUrlRef.current = nextUrl
    setPreviewUrl(nextUrl)
  }, [])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewUrl('')
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      clearPreview()
      setError('')
      setLoading(true)
      try {
        const blob = await loadCurrentUserSignature()
        if (active) setPreviewFromBlob(blob)
      } catch (loadError) {
        const message = signatureErrorMessage(loadError, 'load')
        if (active && message) setError(message)
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [clearPreview, setPreviewFromBlob, user?.uid])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const chooseFile = () => inputRef.current?.click()
  const upload = async (file) => {
    const validationError = validateSignatureFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setUploading(true)
    try {
      await uploadCurrentUserSignature(file)
      setPreviewFromBlob(file)
      setToast(previewUrl ? 'Unterschrift wurde ersetzt.' : 'Unterschrift wurde gespeichert.')
    } catch (uploadError) {
      setError(signatureErrorMessage(uploadError, 'upload'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    setError('')
    setRemoving(true)
    try {
      await deleteCurrentUserSignature()
      clearPreview()
      setToast('Unterschrift wurde gelöscht.')
    } catch (deleteError) {
      setError(signatureErrorMessage(deleteError, 'delete'))
    } finally {
      setRemoving(false)
    }
  }

  const busy = loading || uploading || removing
  return <section className="profile-section signature-section"><div className="signature-section__heading"><div><h2>Meine Unterschrift</h2><p>Deine Unterschrift kann künftig automatisch in Dokumenten, zum Beispiel Haftbarhaltungen, verwendet werden.</p></div></div>{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{previewUrl ? <div className="signature-preview"><div><span>Aktuelle Unterschrift</span><img src={previewUrl} alt="Aktuelle Unterschrift" /></div><div className="signature-preview__actions"><button className="button button--secondary" type="button" onClick={chooseFile} disabled={busy}>Unterschrift ersetzen</button><button className="signature-delete-button" type="button" onClick={remove} disabled={busy}>{removing ? 'Wird gelöscht …' : 'Unterschrift löschen'}</button></div></div> : <div className={`signature-dropzone${dragActive ? ' signature-dropzone--active' : ''}${busy ? ' signature-dropzone--busy' : ''}`} role="button" tabIndex="0" onClick={chooseFile} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseFile() } }} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }} onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!busy) upload(event.dataTransfer.files?.[0]) }}><strong>{loading ? 'Unterschrift wird geladen …' : 'JPG/JPEG hier ablegen'}</strong><span>oder Datei auswählen · maximal 2 MB</span></div>}<input ref={inputRef} className="signature-file-input" type="file" accept="image/jpeg,.jpg,.jpeg" onChange={(event) => upload(event.target.files?.[0])} disabled={busy} />{!previewUrl && !loading && <button className="button button--secondary signature-select-button" type="button" onClick={chooseFile} disabled={busy}>Datei auswählen</button>}{error && <p className="form-error signature-section__error">{error}</p>}</section>
}

export default function ProfilePage() {
  const { user, profile } = useAuth()
  const { theme, setTheme } = useTheme()
  const personalFields = [
    ['Vorname', profile?.firstName || '—'],
    ['Nachname', profile?.lastName || '—'],
    ['Telefon / Durchwahl', profile?.phone || '—'],
    ['E-Mail / Login', user.email || profile?.email || '—'],
  ]
  const employmentFields = [
    ['Funktion', profile?.jobTitle || profile?.function || '—'],
    ['Abteilung', profile?.department || 'Nicht zugeordnet'],
    ['Rolle', roleLabel(profile?.role)],
    ['Eintrittsdatum', formatDate(profile?.employmentStart)],
    ['Personalnummer', profile?.personnelNumber || '—'],
  ]

  return <div className="profile-page"><p className="profile-page__notice">Diese Angaben werden durch die Administration gepflegt.</p><ProfileInfoSection title="Persönliche Daten" fields={personalFields} /><ProfileInfoSection title="Arbeitsprofil" fields={employmentFields} /><SignatureSection user={user} /><section className="profile-section profile-theme-section"><div><h2>Light &amp; Dark Mode</h2><p>Wähle die Darstellung, die für dich am angenehmsten ist.</p></div><label className="profile-theme-switch"><span><strong>Dunkles Design</strong><small>{theme === 'dark' ? 'Dunkel ist aktiv' : 'Hell ist aktiv'}</small></span><input type="checkbox" checked={theme === 'dark'} onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')} /><i aria-hidden="true" /></label></section></div>
}
