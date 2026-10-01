import { useEffect } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'

export default function Toast({ message, onDismiss }) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 3500)
    return () => window.clearTimeout(timeout)
  }, [onDismiss])

  return <div className="toast" role="status"><StaticText source={message} /></div>
}
