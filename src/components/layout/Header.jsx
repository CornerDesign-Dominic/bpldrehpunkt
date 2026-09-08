import { useLocation } from 'react-router-dom'
import { getPageTitle } from '../../lib/pageTitles.js'
import { usePageHeader } from '../../lib/pageHeader.js'

export default function Header() {
  const { pathname } = useLocation()
  const { pageTitle } = usePageHeader()

  return (
    <header className="app-header">
      <h1>{pageTitle || getPageTitle(pathname)}</h1>
    </header>
  )
}
