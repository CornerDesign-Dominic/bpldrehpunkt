export const passwordResetSuccessMessage = 'Falls für diese E-Mail-Adresse ein Konto besteht, erhalten Sie eine E-Mail zum Zurücksetzen des Passworts. Bitte prüfen Sie auch den Spam-Ordner.'

export function passwordResetErrorMessage(error) {
  switch (error?.code) {
    // The reset form must never disclose whether an address maps to an
    // existing or disabled account. Older Firebase projects can still return
    // these codes when email-enumeration protection is not enabled.
    case 'auth/user-not-found':
    case 'auth/email-not-found':
    case 'auth/user-disabled': return ''
    case 'auth/invalid-email':
    case 'auth/missing-email': return 'Bitte geben Sie eine gültige E-Mail-Adresse ein.'
    case 'auth/network-request-failed': return 'Die Anfrage konnte wegen eines Netzwerkfehlers nicht gesendet werden. Bitte versuchen Sie es erneut.'
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded': return 'Derzeit sind zu viele Anfragen eingegangen. Bitte versuchen Sie es später erneut.'
    default: return 'Die Anfrage zum Zurücksetzen konnte nicht gesendet werden. Bitte versuchen Sie es später erneut oder wenden Sie sich an die Administration.'
  }
}
