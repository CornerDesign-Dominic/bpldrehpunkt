import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

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

export const auth = getAuth(firebaseApp)
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const functions = getFunctions(firebaseApp, 'europe-west3')
