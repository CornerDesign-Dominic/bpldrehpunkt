import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { getContract } from '../lib/contracts.js'
import BackLink from '../components/ui/BackLink.jsx'
import '../styles/contracts.css'

export default function ContractDetailPage() {
  const { id } = useParams()
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    getContract(id).then((entry) => { if (active) { setContract(entry); setError(false) } })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, retry])
  return <div className="contracts-page">
    <BackLink to="/vertragsmanagement/vertraege" />
    {loading ? <p role="status">{text('Vertrag wird geladen …', 'Loading contract …')}</p> : error ? <div className="form-error" role="alert"><p>{text('Der Vertrag konnte nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'The contract could not be loaded. Check your connection and permissions.')}</p><button className="button button--secondary" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button></div> : !contract ? <p>{text('Dieser Vertrag wurde nicht gefunden.', 'This contract was not found.')}</p> : <>
      <header className="detail-header"><div><p>{text('Vertragsakte', 'Contract file')}</p><h2>{contract.partnerName}</h2></div></header>
      <section className="contract-panel"><h3>{text('Vertragsdaten', 'Contract details')}</h3><dl className="contract-details"><div><dt>{text('Vertragspartner', 'Contract partner')}</dt><dd>{contract.partnerName}</dd></div><div><dt>{text('Angelegt am', 'Created on')}</dt><dd>{contract.createdAt?.toDate().toLocaleString(language === 'en' ? 'en-GB' : 'de-DE') || '—'}</dd></div></dl></section>
    </>}
  </div>
}
