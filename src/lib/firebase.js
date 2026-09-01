import { getApp, getApps, initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

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

// The application data layer uses this instance when Firestore-backed features are added.
export const db = getFirestore(firebaseApp)
