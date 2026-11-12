import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const config = window.__TODO_BROWSER_QA__
if (!['127.0.0.1', 'localhost'].includes(location.hostname) || !config?.projectId?.startsWith('demo-')) throw new Error('Local synthetic QA only')
const app = initializeApp({ projectId: config.projectId, apiKey: 'emulator-only' }, config.actor)
export const db = getFirestore(app)
const [host, port] = config.emulator.split(':')
connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: config.actor } })
export const auth = { currentUser: { uid: config.actor }, onAuthStateChanged(callback) { callback(this.currentUser); return () => {} } }
export const functions = {}
export const waitForAppCheckToken = async () => { throw new Error('No external callables in local browser QA') }
