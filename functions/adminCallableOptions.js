// Temporary production fallback for the Administration area.
//
// App Check remains enabled for all regular user, import, and tracking
// workflows. These callables continue to require a valid Firebase session,
// an active Firestore profile, and their respective admin role in the
// handler. Remove this fallback once the production web App Check attestation
// is issuing tokens reliably again.
export const adminCallableOptions = Object.freeze({
  region: 'europe-west3',
  enforceAppCheck: false,
})

export const adminPublicCallableOptions = Object.freeze({
  ...adminCallableOptions,
  invoker: 'public',
})
