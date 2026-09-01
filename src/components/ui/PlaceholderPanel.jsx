export default function PlaceholderPanel({ label }) {
  return (
    <section className="placeholder-panel" aria-label={`${label} – künftig verfügbar`}>
      <span>{label}</span>
    </section>
  )
}
