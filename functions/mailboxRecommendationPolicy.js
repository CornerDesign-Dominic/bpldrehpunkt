// Business use is independent of Exchange's technical UserMailbox/SharedMailbox type.
export const FUNCTIONAL_MAILBOXES = Object.freeze(['buchhaltung', 'express', 'transport', 'info', 'rechnung'].map(name => `${name}@brennpunkt-logistik.de`))
export const isFunctionalMailbox = email => typeof email === 'string' && FUNCTIONAL_MAILBOXES.includes(email.trim().toLowerCase())
export const isManagedRecommendationMailbox = connection => connection?.kind === 'shared' || isFunctionalMailbox(connection?.email)
