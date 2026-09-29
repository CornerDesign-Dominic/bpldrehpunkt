import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import CaseTransportOrdersCard from '../components/case-links/CaseTransportOrdersCard.jsx'
import PalletCaseForm from '../components/pallets/PalletCaseForm.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { getPalletCase, palletCaseStatusLabel, updatePalletCase } from '../lib/palletCases.js'
import '../styles/pallets.css'

export default function PalletCaseDetailPage() {
  const { palletCaseId } = useParams(); const { user, profile } = useAuth(); const { canEdit, canView } = usePermissions()
  const [palletCase, setPalletCase] = useState(null); const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { getPalletCase(palletCaseId).then(setPalletCase).catch(() => setError('Der Palettenfall konnte nicht geladen werden.')) }, [palletCaseId])
  async function save(values) { if (!palletCase) return; setSaving(true); setError(''); try { await updatePalletCase(palletCase, values, { user, profile }); setPalletCase((current) => ({ ...current, ...values })); setEditing(false) } catch (caught) { setError(caught.message || 'Der Palettenfall konnte nicht gespeichert werden.') } finally { setSaving(false) } }
  if (!palletCase && !error) return <p className="page-state">Palettenfall wird geladen …</p>
  if (!palletCase) return <section className="pallets-empty-state pallets-empty-state--error"><h3>{error}</h3><BackLink to="/paletten/faelle" /></section>
  return <div className="pallet-case-detail"><BackLink to="/paletten/faelle" />{error && <p className="form-error">{error}</p>}<header className="pallet-case-detail__header"><div><span>{palletCase.caseNumber}</span><h2>{palletCase.title}</h2><p>{palletCaseStatusLabel(palletCase.status)}</p></div>{canEdit('pallets') && <button className="button" type="button" onClick={() => setEditing(true)}>Bearbeiten</button>}</header><div className="pallet-case-detail__grid"><section className="detail-section"><h3>Beschreibung</h3><p>{palletCase.description || 'Keine Beschreibung hinterlegt.'}</p></section><CaseTransportOrdersCard caseType="pallet" caseId={palletCase.id} actor={{ user, profile }} canManage={canEdit('pallets') && canView('transportOrders')} canViewTransportOrders={canView('transportOrders')} /></div>{editing && <div className="pallet-movement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false) }}><section className="pallet-movement-modal pallet-case-modal" role="dialog" aria-modal="true"><PalletCaseForm initialValues={palletCase} submitting={saving} onCancel={() => setEditing(false)} onSubmit={save} /></section></div>}</div>
}
