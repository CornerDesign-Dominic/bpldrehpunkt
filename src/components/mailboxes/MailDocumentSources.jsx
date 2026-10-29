import { useEffect, useRef, useState } from 'react'
import { attachmentBlob } from '../../lib/mailboxHelpers.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import '../../styles/mailboxOrder.css'

export default function MailDocumentSources({ identity, mailContent, attachments, w }) {
  const [source, setSource] = useState('mail')
  const [pdf, setPdf] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const url = useRef(null)
  useEffect(() => { const version = generation; return () => { ++version.current; if (url.current) URL.revokeObjectURL(url.current) } }, [])
  async function select(id) {
    const version = ++generation.current
    setSource(id); setError(''); setBusy(id !== 'mail')
    if (id === 'mail') return
    try {
      const file = await mailboxCall('getMailboxAttachment', { ...identity, attachmentId: id })
      if (version !== generation.current) return
      if (file.contentType?.split(';')[0].toLowerCase() !== 'application/pdf') throw new Error('not-pdf')
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(attachmentBlob(file))
      setPdf({ id, url: url.current })
    } catch { if (version === generation.current) setError(w('PDF konnte nicht geladen werden.', 'Could not load PDF.')) }
    finally { if (version === generation.current) setBusy(false) }
  }
  return <div className="mail-order-source"><label className="form-field"><span>{w('Quelle ansehen', 'View source')}</span><select value={source} onChange={event => void select(event.target.value)}><option value="mail">{w('Mail und Schriftverkehr', 'Email and correspondence')}</option>{attachments.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>{source === 'mail' ? mailContent : <>{busy && <p role="status">{w('PDF wird geladen …', 'Loading PDF …')}</p>}{error && <div role="alert"><p>{error}</p><button type="button" onClick={() => void select(source)}>{w('Erneut versuchen', 'Try again')}</button></div>}{!busy && !error && pdf?.id === source && <><a href={pdf.url} target="_blank" rel="noopener noreferrer">{w('PDF in neuem Tab öffnen', 'Open PDF in new tab')}</a><object className="mail-order-pdf" data={pdf.url} type="application/pdf" aria-label={attachments.find(file => file.id === source)?.name}><a href={pdf.url} target="_blank" rel="noopener noreferrer">{w('PDF öffnen', 'Open PDF')}</a></object></>}</>}</div>
}

