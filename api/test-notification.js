/* global process */

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

  if (!body || typeof body.name !== 'string' || typeof body.message !== 'string') {
    return sendJson(response, 400, { error: 'Name und Nachricht müssen Zeichenketten sein.' })
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
      body: JSON.stringify({ name: body.name, message: body.message }),
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
