import { useLocation } from 'react-router-dom'
import { getPageTitle } from '../../lib/pageTitles.js'

export default function Header() {
  const { pathname } = useLocation()

  return (
    <header className="app-header">
      <h1>{getPageTitle(pathname)}</h1>
    </header>
  )
}
