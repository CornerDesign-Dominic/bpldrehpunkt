import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const authProvider = await readFile(new URL('../src/auth/AuthProvider.jsx', import.meta.url), 'utf8')
const profilePage = await readFile(new URL('../src/pages/ProfilePage.jsx', import.meta.url), 'utf8')
const functionsIndex = await readFile(new URL('./index.js', import.meta.url), 'utf8')

test('active superadmins retain elevated rights while disabled superadmins do not', () => {
  assert.match(rules, /function superadmin\(\) \{ return active\(\) && role\(\) == 'superadmin'; \}/)
  assert.match(rules, /function admin\(\) \{ return active\(\) && \(role\(\) == 'admin' \|\| superadmin\(\)\); \}/)
})

test('an active normal user may read only their own complete profile', () => {
  assert.match(rules, /allow get: if active\(\) && \(userId == request\.auth\.uid \|\| admin\(\)\);/)
  assert.match(rules, /allow list: if admin\(\);/)
  assert.match(rules, /allow create, delete: if false;/)
  assert.match(rules, /allow update: if superadmin\(\) \|\| \(admin\(\) && resource\.data\.role == 'user'/)
})

test('team, vacation, and to-do permissions do not grant direct profile reads', () => {
  const usersRule = rules.match(/match \/users\/\{userId\} \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.doesNotMatch(usersRule, /view\('team'\)|view\('vacation'\)|edit\('todos'\)/)
})

test('the profile route has no UID parameter and subscribes to the authenticated UID only', () => {
  assert.match(app, /path="\/profil" element=\{<ProfilePage \/>\}/)
  assert.doesNotMatch(app, /path="\/profil\//)
  assert.match(authProvider, /onSnapshot\(doc\(db, 'users', user\.uid\),/)
  assert.match(authProvider, /profile\.active === true/)
  assert.doesNotMatch(profilePage, /useParams|getUserProfile|collection\(db, 'users'\)/)
})

test('the reduced employee directory requires an active profile and excludes security fields', () => {
  const directoryCallable = functionsIndex.match(/export const listVisibleUserDirectory[\s\S]*?\n\}\)/)?.[0] || ''
  assert.match(directoryCallable, /requireActiveProfile\(request\)/)
  assert.match(directoryCallable, /userDirectoryAccess\(actor\)/)
  const directoryEntry = functionsIndex.match(/function userDirectoryEntry\(snapshot, includeContactDetails\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(directoryEntry, /\b(role|permissions|active|birthDate|personnelNumber|employmentStart)\b/)
})
