import { useEffect, useRef, useState } from 'react'

export default function NewsMultiSelect({ label, options, selected, onToggle }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const closeTimer = useRef(null)
  const selectedCount = selected.length

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.clearTimeout(closeTimer.current)
    }
  }, [])

  function cancelClose() { window.clearTimeout(closeTimer.current) }
  function scheduleClose() {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 1400)
  }

  return <div className={open ? 'news-multiselect news-multiselect--open' : 'news-multiselect'} ref={rootRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button className="news-multiselect__trigger" type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}><span>{label}</span>{selectedCount > 0 && <strong>{selectedCount}</strong>}<span className="news-multiselect__chevron" aria-hidden="true">⌄</span></button>
    {open && <div className="news-multiselect__options" role="group" aria-label={`${label} filtern`}>
      {options.length ? options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => onToggle(option.value, event.target.checked)} /><span>{option.label}</span></label>) : <p>Keine Werte verfügbar.</p>}
    </div>}
  </div>
}
