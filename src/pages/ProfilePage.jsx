import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { localeForLanguage } from '../i18n/translations.js'
import Toast from '../components/ui/Toast.jsx'
import {
  deleteCurrentUserSignature,
  loadCurrentUserSignature,
  signatureErrorMessage,
  uploadCurrentUserSignature,
  validateSignatureFile,
} from '../lib/userSignature.js'
import '../styles/profile.css'

function formatDate(value, language) {
  if (!value) return '—'
  const date = value.toDate?.() ?? new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(localeForLanguage(language)).format(date)
}

function roleLabel(role, t) {
  if (role === 'admin') return 'Administrator'
  if (role === 'user') return t('profile.user')
  return role || '—'
}

function ProfileInfoSection({ title, fields }) {
  return <section className="profile-section"><h2>{title}</h2><dl className="profile-readonly-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
}

function SignatureSection({ user }) {
  const { t } = useLanguage()
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
        const message = signatureErrorMessage(loadError, 'load', t)
        if (active && message) setError(message)
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [clearPreview, setPreviewFromBlob, t, user?.uid])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const chooseFile = () => inputRef.current?.click()
  const upload = async (file) => {
    const validationError = validateSignatureFile(file, t)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setUploading(true)
    try {
      await uploadCurrentUserSignature(file)
      setPreviewFromBlob(file)
      setToast(t(previewUrl ? 'profile.signatureReplaced' : 'profile.signatureSaved'))
    } catch (uploadError) {
      setError(signatureErrorMessage(uploadError, 'upload', t))
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
      setToast(t('profile.signatureDeleted'))
    } catch (deleteError) {
      setError(signatureErrorMessage(deleteError, 'delete', t))
    } finally {
      setRemoving(false)
    }
  }

  const busy = loading || uploading || removing
  return <section className="profile-section signature-section"><div className="signature-section__heading"><div><h2>{t('profile.signature')}</h2><p>{t('profile.signatureHint')}</p></div></div>{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{previewUrl ? <div className="signature-preview"><div><span>{t('profile.currentSignature')}</span><img src={previewUrl} alt={t('profile.currentSignature')} /></div><div className="signature-preview__actions"><button className="button button--secondary" type="button" onClick={chooseFile} disabled={busy}>{t('profile.replaceSignature')}</button><button className="signature-delete-button" type="button" onClick={remove} disabled={busy}>{t(removing ? 'profile.deletingSignature' : 'profile.deleteSignature')}</button></div></div> : <div className={`signature-dropzone${dragActive ? ' signature-dropzone--active' : ''}${busy ? ' signature-dropzone--busy' : ''}`} role="button" tabIndex="0" onClick={chooseFile} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseFile() } }} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }} onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!busy) upload(event.dataTransfer.files?.[0]) }}><strong>{t(loading ? 'profile.loadingSignature' : 'profile.dropSignature')}</strong><span>{t('profile.chooseFileHint')}</span></div>}<input ref={inputRef} className="signature-file-input" type="file" accept="image/jpeg,.jpg,.jpeg" onChange={(event) => upload(event.target.files?.[0])} disabled={busy} />{!previewUrl && !loading && <button className="button button--secondary signature-select-button" type="button" onClick={chooseFile} disabled={busy}>{t('profile.chooseFile')}</button>}{error && <p className="form-error signature-section__error">{<StaticText source={error} />}</p>}</section>
}

function LanguageSettingsSection() {
  const { language, setLanguage, t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function changeLanguage(event) {
    setSaving(true)
    setError('')
    try {
      await setLanguage(event.target.value)
    } catch {
      setError(t('profile.languageSaveError'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="profile-section profile-settings"><h2>{t('profile.settings')}</h2><label htmlFor="profile-language">{t('profile.language')}</label><select id="profile-language" value={language} onChange={changeLanguage} disabled={saving}><option value="de">{t('language.de')}</option><option value="en">{t('language.en')}</option></select><p>{saving ? t('profile.languageSaving') : t('profile.languageHint')}</p>{error && <p className="form-error" role="alert">{<StaticText source={error} />}</p>}</section>
}

export default function ProfilePage() {
  const { user, profile } = useAuth()
  const { language, t } = useLanguage()
  const personalFields = [
    [t('profile.firstName'), profile?.firstName || '—'],
    [t('profile.lastName'), profile?.lastName || '—'],
    [t('profile.phone'), profile?.phone || '—'],
    [t('profile.email'), user.email || profile?.email || '—'],
  ]
  const employmentFields = [
    [t('profile.jobTitle'), profile?.jobTitle || profile?.function || '—'],
    [t('profile.department'), profile?.department || t('profile.unassigned')],
    [t('profile.role'), roleLabel(profile?.role, t)],
    [t('profile.employmentStart'), formatDate(profile?.employmentStart, language)],
    [t('profile.personnelNumber'), profile?.personnelNumber || '—'],
  ]

  return <div className="profile-page"><p className="profile-page__notice">{t('profile.adminNotice')}</p><ProfileInfoSection title={t('profile.personal')} fields={personalFields} /><ProfileInfoSection title={t('profile.work')} fields={employmentFields} /><LanguageSettingsSection /><SignatureSection user={user} /></div>
}
