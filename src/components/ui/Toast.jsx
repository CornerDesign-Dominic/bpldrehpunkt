import { useEffect } from 'react'

export default function Toast({ message, onDismiss }) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 3500)
    return () => window.clearTimeout(timeout)
  }, [onDismiss])

  return <div className="toast" role="status">{message}</div>
}
