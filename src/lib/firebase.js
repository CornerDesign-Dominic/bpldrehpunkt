import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: 'AIzaSyBYklJVALDla-I1xfJODOUkuw_oHpIOfDY',
  authDomain: 'db-bpl-drehpunkt.firebaseapp.com',
  projectId: 'db-bpl-drehpunkt',
  storageBucket: 'db-bpl-drehpunkt.firebasestorage.app',
  messagingSenderId: '878536841109',
  appId: '1:878536841109:web:6c198e6df38fbc8b7ac89c',
  measurementId: 'G-41Q2BFPRY1',
}

// Reuses the initialized app during hot module reloads in local development.
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// App Check is intentionally optional until the Web app has been registered
// in Firebase Console. Its site key is public; it is not a Firebase secret.
// A missing key keeps the existing rollout in monitoring-safe mode.
const appCheckSiteKey = import.meta.env.VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY

// localhost and Vite development builds cannot receive a production reCAPTCHA
// Enterprise attestation. Firebase will log a per-browser debug token, which
// must be allowlisted manually in App Check before enforcement is enabled.
// This branch is removed from production builds, so no debug token can be
// emitted or used there.
if (import.meta.env.DEV) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true

export const appCheck = appCheckSiteKey
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null

export const auth = getAuth(firebaseApp)
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const functions = getFunctions(firebaseApp, 'europe-west3')
