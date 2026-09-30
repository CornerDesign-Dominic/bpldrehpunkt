import { useEffect, useRef, useState } from 'react'
import { useCompanyData } from '../company/companyDataContext.js'
import { blobToDataUrl, companyStampErrorMessage, deleteCompanyStamp, loadCompanyStamp, saveCompanyData, uploadCompanyStamp } from '../lib/companyMasterData.js'
import { COMPANY_FIELD_LIMITS, COMPANY_FOOTER_EDIT_GROUPS, normalizeCompanyData } from '../lib/companyDataModel.js'
import '../styles/companyMasterData.css'

export default function CompanyMasterDataPage() {
  const { company, loading, error: loadError } = useCompanyData()
  if (loading) return <div className="company-master-data"><p>Stammdaten werden geladen …</p></div>
  return <CompanyMasterDataEditor company={company} loadError={loadError} />
}

function CompanyMasterDataEditor({ company, loadError }) {
  const [draft, setDraft] = useState(() => normalizeCompanyData(company))
  const [savedDraft, setSavedDraft] = useState(() => normalizeCompanyData(company))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [stampError, setStampError] = useState('')
  const [stampUrl, setStampUrl] = useState('')
  const [stampLoading, setStampLoading] = useState(true)
  const [stampBusy, setStampBusy] = useState(false)
  const stampLoadId = useRef(0)
  const hasUnsavedChanges = Object.keys(draft).some((field) => draft[field] !== savedDraft[field])

  useEffect(() => {
    let current = true
    refreshStamp(() => current)
    return () => { current = false; stampLoadId.current += 1 }
  }, [])

  async function refreshStamp(isActive = () => true) {
    const id = ++stampLoadId.current
    setStampLoading(true)
    setStampError('')
    try {
      const url = await blobToDataUrl(await loadCompanyStamp())
      if (isActive() && id === stampLoadId.current) setStampUrl(url)
    } catch (cause) {
      if (isActive() && id === stampLoadId.current) {
        setStampUrl('')
        setStampError(companyStampErrorMessage(cause))
      }
    } finally {
      if (isActive() && id === stampLoadId.current) setStampLoading(false)
    }
  }

  function openStampPicker() {
    stampLoadId.current += 1
    setStampLoading(false)
    setStampError('')
  }

  async function save(event) {
    event.preventDefault()
    if (!hasUnsavedChanges) return
    setSaving(true); setError(''); setNotice('')
    try { await saveCompanyData(draft); setSavedDraft(draft); setNotice('Firmenstammdaten gespeichert.') }
    catch (cause) { setError(cause?.message || 'Die Firmenstammdaten konnten nicht gespeichert werden.') }
    finally { setSaving(false) }
  }

  function discardChanges() {
    setDraft(savedDraft)
    setError('')
    setNotice('')
  }

  async function uploadStamp(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    stampLoadId.current += 1
    setStampBusy(true); setStampError(''); setNotice('')
    try {
      await uploadCompanyStamp(file)
      setNotice('Gemeinsamer Stempel gespeichert.')
      await refreshStamp()
    } catch (cause) { setStampError(cause?.code ? companyStampErrorMessage(cause, 'upload') : cause?.message || 'Der Stempel konnte nicht gespeichert werden.') }
    finally { setStampBusy(false) }
  }

  async function removeStamp() {
    setStampBusy(true); setStampError(''); setNotice('')
    try { await deleteCompanyStamp(); setStampUrl(''); setNotice('Gemeinsamer Stempel entfernt.') }
    catch (cause) { setStampError(companyStampErrorMessage(cause, 'delete')) }
    finally { setStampBusy(false) }
  }

  return <div className="company-master-data">
    <header className="company-master-data__intro"><h2>Stammdaten</h2><p>Firmendaten und gemeinsamer Stempel für alle Bereiche und Dokumentvorlagen.</p></header>
    {(error || loadError) && <p className="form-error" role="alert">{error || loadError}</p>}
    {notice && <p className="company-master-data__notice" role="status">{notice}</p>}
    <form onSubmit={save}>
      <div className="company-master-data__cards">
        {COMPANY_FOOTER_EDIT_GROUPS.map(({ title, fields }) => <section className="company-master-data__section" key={title}>
          <h3>{title}</h3>
          <div className="company-master-data__fields">{fields.map(([field, label]) => <label className="form-field" key={field}><span>{label}</span><input type={field === 'email' ? 'email' : 'text'} value={draft[field]} required={field === 'legalName'} maxLength={COMPANY_FIELD_LIMITS[field]} onChange={(event) => setDraft((value) => ({ ...value, [field]: event.target.value }))} /></label>)}</div>
        </section>)}
      </div>
      {hasUnsavedChanges && <div className="company-master-data__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={discardChanges}>Änderungen verwerfen</button><button className="button" type="submit" disabled={saving || Boolean(loadError)}>{saving ? 'Speichert …' : 'Firmendaten speichern'}</button></div>}
    </form>
    <section className="company-master-data__stamp"><h3>Gemeinsamer Stempel</h3><p>JPG, JPEG oder PNG mit maximal 2 MB. Alle angemeldeten Mitarbeitenden können diesen Stempel in Dokumentvorlagen verwenden.</p>
      {stampError && <p className="form-error" role="alert">{stampError}</p>}
      {stampLoading ? <p>Stempel wird geladen …</p> : stampUrl ? <img src={stampUrl} alt="Gemeinsamer Firmenstempel" /> : !stampError && <p>Es ist noch kein Stempel hinterlegt.</p>}
      <div className="company-master-data__stamp-actions"><label className="button button--secondary">{stampBusy ? 'Bitte warten …' : stampUrl ? 'Stempel ersetzen' : 'Stempel hochladen'}<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" disabled={stampBusy} onClick={openStampPicker} onCancel={() => refreshStamp()} onChange={uploadStamp} /></label>{stampUrl && <button className="button button--secondary" type="button" disabled={stampBusy} onClick={removeStamp}>Stempel entfernen</button>}</div>
    </section>
  </div>
}
