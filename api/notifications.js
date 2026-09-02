/* global process */

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sendJson(response, status, payload) {
  return response.status(status).json(payload)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Methode nicht erlaubt.' })
  }

  let body = request.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return sendJson(response, 400, { error: 'Ungültige JSON-Daten.' })
    }
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : ''
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!emailPattern.test(to) || !subject || !message || (body?.type !== undefined && typeof body.type !== 'string')) {
    return sendJson(response, 400, { error: 'Empfänger, Betreff und Nachricht müssen gültig angegeben werden.' })
  }

  const notificationUrl = process.env.POWER_AUTOMATE_NOTIFICATION_URL
  if (!notificationUrl) {
    console.error('Power-Automate-Benachrichtigung ist nicht konfiguriert.')
    return sendJson(response, 500, { error: 'Benachrichtigungsdienst ist nicht konfiguriert.' })
  }

  try {
    const notificationResponse = await fetch(notificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, message, ...(typeof body.type === 'string' && body.type.trim() ? { type: body.type.trim() } : {}) }),
    })

    if (!notificationResponse.ok) {
      console.error(`Power-Automate-Benachrichtigung fehlgeschlagen (${notificationResponse.status}).`)
      return sendJson(response, 502, { error: 'Benachrichtigungsdienst konnte nicht erreicht werden.' })
    }
  } catch {
    console.error('Power-Automate-Benachrichtigung konnte nicht gesendet werden.')
    return sendJson(response, 502, { error: 'Benachrichtigungsdienst konnte nicht erreicht werden.' })
  }

  return sendJson(response, 200, { success: true })
}
