import { useState } from 'react'
import { CopyIcon } from '../icons.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const temporaryInput = document.createElement('textarea')
  temporaryInput.value = value
  temporaryInput.setAttribute('readonly', '')
  temporaryInput.style.position = 'fixed'
  temporaryInput.style.opacity = '0'
  document.body.appendChild(temporaryInput)
  temporaryInput.select()
  document.execCommand('copy')
  temporaryInput.remove()
}
export default function TransportOrderCopyDetail({ label, value, multiline = false }) {
  const [copied, setCopied] = useState(false)
  const { language } = useLanguage()
  const displayValue = value || '—'
  const copyLabel = language === 'en' ? copied ? `${label} copied` : `Copy ${label}` : copied ? `${label} kopiert` : `${label} kopieren`
  async function copyValue() {
    try {
      await copyToClipboard(displayValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div><dt>{label}</dt><dd className="transport-order-copy-detail__value"><span>{multiline ? String(displayValue).split(/\r?\n/).map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>) : displayValue}</span>{displayValue !== '—' && <button type="button" className="transport-order-copy-detail__button" onClick={copyValue} title={copyLabel} aria-label={copyLabel}><CopyIcon size={14} /></button>}</dd></div>
}
