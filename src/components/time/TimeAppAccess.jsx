import { useEffect, useRef, useState } from 'react'
import { validTimePwaUrl } from '../../lib/timePwaAccess.js'
import '../../styles/timeDashboard.css'

const mobileUrl = validTimePwaUrl(import.meta.env.VITE_TIME_PWA_URL, import.meta.env.DEV)

function PhoneDialog({ onClose }) {
  const dialog = useRef(null)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    let current = true
    import('qrcode').then(module => module.default.toDataURL(mobileUrl, { width: 256, margin: 4, errorCorrectionLevel: 'M' }))
      .then(value => { if (current) setImage(value) })
      .catch(() => { if (current) setError('Der QR-Code konnte nicht geladen werden. Du kannst die App über den Link öffnen.') })
    return () => { current = false; node.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={dialog} className="time-phone-dialog" aria-labelledby="time-phone-title" onCancel={onClose}>
    <header><h2 id="time-phone-title">Meine Zeit am Handy</h2><button type="button" className="button button--secondary" aria-label="Schließen" onClick={onClose}>×</button></header>
    <p>Scanne den QR-Code mit der Handykamera und öffne den angezeigten Link.</p>
    <div className="time-phone-qr">{image ? <img src={image} width="256" height="256" alt="QR-Code zum Öffnen der Drehpunkt-Zeiterfassungs-App" /> : <p role="status">{error || 'QR-Code wird geladen …'}</p>}</div>
    <div className="time-phone-instructions"><h3>Einmal öffnen, danach wie eine App starten</h3><p><strong>Android / Chrome:</strong> Browsermenü ⋮ → „App installieren“ oder „Zum Startbildschirm hinzufügen“.</p><p><strong>iPhone / Safari:</strong> Teilen → „Zum Home-Bildschirm“.</p><p>Mit deiner bestehenden Drehpunkt-Anmeldung anmelden. Für den ersten Start brauchst du Internet; danach funktionieren Zeitstempel auch offline.</p></div>
    <a className="button" href={mobileUrl} target="_blank" rel="noopener noreferrer">App auf diesem Gerät öffnen</a>
  </dialog>
}

export default function TimeAppAccess() {
  const [open, setOpen] = useState(false)
  if (!mobileUrl) return null
  return <><button type="button" className="button button--secondary" onClick={() => setOpen(true)}>Am Handy öffnen</button>{open && <PhoneDialog onClose={() => setOpen(false)} />}</>
}
