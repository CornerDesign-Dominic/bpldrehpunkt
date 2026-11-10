export function validTimePwaUrl(value, development = false) {
  try {
    if (typeof value !== 'string' || !value.trim()) return ''
    const url = new URL(value.trim())
    const loopback = development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return !url.username && !url.password && (url.protocol === 'https:' || loopback) ? url.href : ''
  } catch { return '' }
}
