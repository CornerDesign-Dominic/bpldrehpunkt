import { Component, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { websiteDiagnosticStage } from '../../lib/diagnosticClassification.js'

class PageBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch() {
    void reportTechnicalFailure({ module: 'website', stage: websiteDiagnosticStage(this.props.pathname), code: 'runtime-error' })
  }

  render() {
    if (this.state.failed) return <section role="alert" className="form-error">
      <p><StaticText source="Die Seite konnte nicht geladen werden. Bitte lade sie erneut." /></p>
      <button type="button" className="button button--secondary" onClick={() => window.location.reload()}><StaticText source="Seite neu laden" /></button>
    </section>
    return <Suspense fallback={<p role="status" aria-live="polite"><StaticText source="Seite wird geladen …" /></p>}>{this.props.children}</Suspense>
  }
}

export default function RouteContent({ children }) {
  const { pathname } = useLocation()
  // Navigation and providers stay mounted while a page is downloaded. A
  // different path recovers from an error; query changes retain form state.
  return <PageBoundary key={pathname} pathname={pathname}>{children}</PageBoundary>
}
