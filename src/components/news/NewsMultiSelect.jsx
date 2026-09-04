export default function NewsMultiSelect({ label, options, selected, onToggle }) {
  const selectedCount = selected.length

  return <details className="news-multiselect">
    <summary><span>{label}</span>{selectedCount > 0 && <strong>{selectedCount}</strong>}</summary>
    <div className="news-multiselect__options" role="group" aria-label={`${label} filtern`}>
      {options.length ? options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => onToggle(option.value, event.target.checked)} /><span>{option.label}</span></label>) : <p>Keine Werte verfügbar.</p>}
    </div>
  </details>
}
