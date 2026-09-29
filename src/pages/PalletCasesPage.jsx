import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import PalletCaseForm from '../components/pallets/PalletCaseForm.jsx'
import { createEmptyPalletCase, createPalletCase, listPalletCases, palletCaseStatusLabel } from '../lib/palletCases.js'
import { caseCreationDefaults } from '../lib/caseTransportLinks.js'
import '../styles/pallets.css'

export default function PalletCasesPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const navigate = useNavigate(); const location = useLocation()
  const [pendingCaseCreation] = useState(() => location.state?.caseCreation?.caseType === 'pallet' ? location.state.caseCreation : null)
  const [cases, setCases] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [creating, setCreating] = useState(Boolean(pendingCaseCreation)); const [saving, setSaving] = useState(false)
  useEffect(() => { listPalletCases().then(setCases).catch(() => setError('Die Palettenfälle konnten nicht geladen werden.')).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (pendingCaseCreation) navigate(location.pathname, { replace: true, state: null }) }, [location.pathname, navigate, pendingCaseCreation])
  const initialValues = useMemo(() => createEmptyPalletCase(caseCreationDefaults('pallet', pendingCaseCreation?.prefill)), [pendingCaseCreation])
  async function save(values) { setSaving(true); setError(''); try { const id = await createPalletCase(values, { user, profile }, { transportOrderId: pendingCaseCreation?.prefill?.transportOrderId }); navigate(`/paletten/faelle/${id}`) } catch (caught) { setError(caught.message || 'Der Palettenfall konnte nicht gespeichert werden.') } finally { setSaving(false) } }
  return <div className="pallet-case-page"><div className="pallet-case-page__header"><div><Link className="button button--secondary" to="/paletten">Zur Kontoliste</Link><h2>Palettenfälle</h2></div>{canEdit('pallets') && <button className="button" type="button" onClick={() => setCreating(true)}>Palettenfall anlegen</button>}</div>{error && <p className="form-error">{error}</p>}{loading ? <p className="page-state">Palettenfälle werden geladen …</p> : <div className="table-frame"><table className="data-table"><thead><tr><th>Fallnummer</th><th>Kurzbezeichnung</th><th>Status</th></tr></thead><tbody>{cases.length ? cases.map((palletCase) => <tr className="pallet-account-row" key={palletCase.id} tabIndex="0" onClick={() => navigate(`/paletten/faelle/${palletCase.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/paletten/faelle/${palletCase.id}`) } }}><td><strong>{palletCase.caseNumber}</strong></td><td>{palletCase.title}</td><td>{palletCaseStatusLabel(palletCase.status)}</td></tr>) : <tr><td className="table-state" colSpan="3">Noch keine Palettenfälle vorhanden.</td></tr>}</tbody></table></div>}{creating && <div className="pallet-movement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreating(false) }}><section className="pallet-movement-modal pallet-case-modal" role="dialog" aria-modal="true"><PalletCaseForm initialValues={initialValues} submitting={saving} onCancel={() => setCreating(false)} onSubmit={save} /></section></div>}</div>
}
