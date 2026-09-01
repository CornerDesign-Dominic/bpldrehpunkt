export default function Header({ title }) {
  return (
    <header className="app-header">
      <h1>{title}</h1>
      <div className="user-placeholder" aria-label="Bereich für künftige Benutzerfunktionen">
        <span className="user-placeholder__dot" />
        <span>Benutzer</span>
      </div>
    </header>
  )
}
