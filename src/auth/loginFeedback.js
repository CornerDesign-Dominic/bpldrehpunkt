/**
 * Keeps credential failures intentionally indistinguishable, while surfacing
 * operational authentication failures that support can act on.
 */
export function loginErrorMessage(error) {
  if (error?.code === 'auth/permission-denied') return 'Dieses Benutzerkonto ist nicht für den Zugriff freigegeben.'
  if (error?.code === 'auth/too-many-requests') return 'Zu viele Anmeldeversuche. Bitte versuchen Sie es später erneut.'
  if (error?.code === 'auth/network-request-failed') return 'Die Anmeldung konnte wegen eines Netzwerkfehlers nicht abgeschlossen werden.'
  if (error?.code === 'auth/operation-not-allowed') return 'Die E-Mail/Passwort-Anmeldung ist derzeit nicht aktiviert.'
  if (['auth/invalid-app-credential', 'auth/missing-app-credential', 'auth/captcha-check-failed'].includes(error?.code)) return 'Die Sicherheitsprüfung der Anwendung konnte nicht bestätigt werden. Bitte laden Sie die Seite neu.'
  if (error?.code === 'auth/app-not-authorized') return 'Diese Domain ist nicht für die Anmeldung freigegeben.'
  if (error?.code === 'auth/invalid-api-key' || error?.code === 'auth/project-not-found') return 'Die Anmeldekonfiguration ist ungültig. Bitte wenden Sie sich an die Administration.'
  return 'E-Mail oder Passwort sind nicht korrekt.'
}
