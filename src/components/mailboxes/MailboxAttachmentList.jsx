import { useEffect, useId, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import { attachmentBlob, safeAttachmentName } from '../../lib/mailboxHelpers.js'
import { attachmentViewType, retainAttachmentTab } from '../../lib/mailboxAttachmentPresentation.js'

export default function MailboxAttachmentList({ attachments, identity, inline = false, truncated = false, outlookUrl }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const headingId = useId()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const request = useRef(0)
  const pendingTabs = useRef(new Set())
  useEffect(() => {
    const tabs = pendingTabs.current
    const generation = request
    return () => { ++generation.current; for (const tab of tabs) tab.close(); tabs.clear() }
  }, [])

  async function load(item, download) {
    let tab = null
    setError('')
    if (!download) {
      // Open synchronously within the click so normal popup blocking does not
      // reject a window created after the asynchronous Graph request.
      try {
        tab = window.open('about:blank', '_blank')
        if (!tab) { setError(w('Der neue Tab wurde vom Browser blockiert. Bitte erlaube ihn oder verwende „Herunterladen“.', 'The browser blocked the new tab. Allow it or use Download.')); return }
        tab.opener = null
        tab.document.title = safeAttachmentName(item.name)
        tab.document.body.textContent = w('Anhang wird geladen …', 'Loading attachment …')
        pendingTabs.current.add(tab)
      } catch {
        tab?.close()
        setError(w('Der neue Tab konnte nicht geöffnet werden. Bitte verwende „Herunterladen“.', 'Could not open a new tab. Please use Download.'))
        return
      }
    }
    const version = ++request.current
    setBusy({ id: item.id, download })
    try {
      const data = await mailboxCall('getMailboxAttachment', { ...identity, attachmentId: item.id })
      if (version !== request.current || tab?.closed) return
      const viewType = attachmentViewType(data.contentType)
      const inTab = !download && viewType
      const blob = attachmentBlob({ ...data, contentType: inTab ? viewType : 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      if (inTab) {
        try { tab.location.replace(url) } catch (caught) { URL.revokeObjectURL(url); throw caught }
        retainAttachmentTab(url, tab)
        pendingTabs.current.delete(tab)
      } else {
        tab?.close()
        const link = document.createElement('a')
        link.href = url; link.download = safeAttachmentName(data.name || item.name)
        document.body.append(link); link.click(); link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      }
    } catch {
      tab?.close()
      if (version === request.current) setError(w('Anhang konnte nicht geöffnet werden. Bitte erneut versuchen.', 'Could not open attachment. Please try again.'))
    } finally {
      if (tab) pendingTabs.current.delete(tab)
      if (version === request.current) setBusy(null)
    }
  }

  if (!attachments.length && !truncated) return null
  function row(item) {
    return <li key={item.id} className="mailbox-attachment-row"><span className="mailbox-attachment-name">{item.name || w('(Unbenannter Anhang)', '(Unnamed attachment)')}</span>
      {item.supported === false ? <div className="mailbox-attachment-unavailable"><small>{w('Über 5 MB oder nicht unterstützter Anhang.', 'Over 5 MB or unsupported attachment.')}</small>{outlookUrl && <a href={outlookUrl} target="_blank" rel="noopener noreferrer">{w('In Outlook öffnen', 'Open in Outlook')}</a>}</div> : <div className="mailbox-attachment-buttons">
        <button type="button" disabled={Boolean(busy)} title={w('In neuem Tab öffnen', 'Open in new tab')} aria-label={`${w('In neuem Tab öffnen', 'Open in new tab')}: ${item.name}`} onClick={() => void load(item, false)}>{busy?.id === item.id && !busy.download ? w('Lädt …', 'Loading …') : w('Öffnen', 'Open')}</button>
        <button type="button" disabled={Boolean(busy)} aria-label={`${w('Herunterladen', 'Download')}: ${item.name}`} onClick={() => void load(item, true)}>{busy?.id === item.id && busy.download ? w('Lädt …', 'Loading …') : w('Herunterladen', 'Download')}</button>
      </div>}
    </li>
  }
  return <section className={`mailbox-attachments${inline ? ' mailbox-attachments--inline' : ''}`} aria-labelledby={headingId} aria-busy={Boolean(busy)}>
    <h3 id={headingId}>{inline ? w('Eingebettete Bilder', 'Embedded images') : w('Anhänge', 'Attachments')}{attachments.length > 0 && ` (${attachments.length})`}</h3>
    <ul>{attachments.slice(0, 2).map(row)}</ul>
    {attachments.length > 2 && <details><summary><span className="mailbox-attachments-show-more">{w(`Weitere Anhänge anzeigen (${attachments.length - 2})`, `Show more attachments (${attachments.length - 2})`)}</span><span className="mailbox-attachments-show-less">{w('Weniger Anhänge anzeigen', 'Show fewer attachments')}</span></summary><ul>{attachments.slice(2).map(row)}</ul></details>}
    {!inline && attachments.some(item => item.supported !== false) && <p className="mailbox-hint">{w('Öffnen nutzt einen neuen Browser-Tab. Je nach Dateityp wird die Datei heruntergeladen.', 'Open uses a new browser tab. Some file types will be downloaded.')}</p>}
    {truncated && <p className="mailbox-hint">{w('Es gibt weitere Anhänge. Die vollständige Liste findest du im Original in Outlook.', 'More attachments exist. Open the original in Outlook for the complete list.')}{outlookUrl && <> <a href={outlookUrl} target="_blank" rel="noopener noreferrer">{w('In Outlook öffnen', 'Open in Outlook')}</a></>}</p>}
    {error && <p className="mailbox-error" role="alert">{error}</p>}
  </section>
}
