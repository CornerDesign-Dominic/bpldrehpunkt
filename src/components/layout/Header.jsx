import { useLocation } from 'react-router-dom'
import { getPageTitle } from '../../lib/pageTitles.js'

export default function Header() {
  const { pathname } = useLocation()

  return (
    <header className="app-header">
      <h1>{getPageTitle(pathname)}</h1>
      <div className="user-placeholder" aria-label="Bereich für künftige Benutzerfunktionen">
        <span className="user-placeholder__dot" />
        <span>Benutzer</span>
      </div>
    </header>
  )
}
