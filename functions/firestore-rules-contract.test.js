import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const authProvider = await readFile(new URL('../src/auth/AuthProvider.jsx', import.meta.url), 'utf8')
const profilePage = await readFile(new URL('../src/pages/ProfilePage.jsx', import.meta.url), 'utf8')
const personnelPage = await readFile(new URL('../src/pages/PersonnelPage.jsx', import.meta.url), 'utf8')
const functionsIndex = await readFile(new URL('./index.js', import.meta.url), 'utf8')
const knowledgeProcessAi = await readFile(new URL('./knowledgeProcessAi.js', import.meta.url), 'utf8')
const aiPrompts = await readFile(new URL('./aiPrompts.js', import.meta.url), 'utf8')

test('active superadmins retain elevated rights while disabled superadmins do not', () => {
  assert.match(rules, /function superadmin\(\) \{ return active\(\) && role\(\) == 'superadmin'; \}/)
  assert.match(rules, /function admin\(\) \{ return active\(\) && \(role\(\) == 'admin' \|\| superadmin\(\)\); \}/)
})

test('an active user may read only their own profile; administration uses a callable projection', () => {
  assert.match(rules, /allow get: if active\(\) && userId == request\.auth\.uid;/)
  assert.match(rules, /allow list: if false;/)
  assert.match(rules, /allow create, delete: if false;/)
  assert.match(rules, /allow update: if false;/)
  assert.match(functionsIndex, /export const listManagedUsers = onCall/)
})

test('the admin employee list remains an active-admin callable and is independent of personnel rights', () => {
  const adminList = functionsIndex.match(/export const listManagedUsers = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  const managerAssertion = functionsIndex.match(/async function assertManager\(request\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(adminList, /await assertManager\(request\)/)
  assert.doesNotMatch(adminList, /assertPersonnelAccess|permissions\.personnel/)
  assert.match(managerAssertion, /requireActiveProfile\(request\)/)
  assert.match(managerAssertion, /\['admin', 'superadmin'\]/)
})

test('the separate legacy-account review remains a superadmin callable', () => {
  const legacyReview = functionsIndex.match(/export const listLegacyAccountProfiles = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(legacyReview, /await assertSuperadmin\(request\)/)
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

test('personnel data is callable-only and requires its own module permission', () => {
  assert.match(rules, /match \/employeeHrProfiles\/\{userId\} \{\s*allow read, write: if false;/)
  assert.match(functionsIndex, /function hasPersonnelPermission\(profile, minimum = 'view'\)/)
  assert.match(functionsIndex, /profile\?\.permissions\?\.personnel/)
  const personnelAccess = functionsIndex.match(/function hasPersonnelPermission\(profile, minimum = 'view'\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(personnelAccess, /role === 'admin'/)
  assert.match(functionsIndex, /export const listPersonnelEmployees = onCall[\s\S]*?assertPersonnelAccess\(request\)/)
  assert.match(functionsIndex, /export const getPersonnelEmployee = onCall[\s\S]*?assertPersonnelAccess\(request\)/)
  assert.match(functionsIndex, /export const updatePersonnelEmployee = onCall[\s\S]*?assertPersonnelAccess\(request, 'edit'\)/)
})

test('personnel writes keep shared fields central and HR-only fields separate', () => {
  assert.match(functionsIndex, /const hrProfileFields = \['birthDate', 'streetAddress', 'postalCode', 'city', 'country', 'taxClass', 'childrenCount'\]/)
  assert.match(functionsIndex, /const sharedHrProfileFields = \['firstName', 'lastName', 'jobTitle', 'phone', 'personnelNumber', 'employmentStart'\]/)
  assert.match(functionsIndex, /transaction\.update\(userRef, centralUpdate\)/)
  assert.match(functionsIndex, /transaction\.set\(hrRef, \{/)
  assert.doesNotMatch(functionsIndex.match(/const normalFields = \[[^\]]*\]/)?.[0] || '', /birthDate/)
})

test('personnel edit updates only the explicitly whitelisted existing employee fields', () => {
  const employeeUpdate = functionsIndex.match(/export const updatePersonnelEmployee = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(employeeUpdate, /await assertPersonnelAccess\(request, 'edit'\)/)
  assert.match(employeeUpdate, /sharedProfileFields\(data\)/)
  assert.match(employeeUpdate, /departmentFields\(data, user\.data\(\)\)/)
  assert.match(employeeUpdate, /validatedHrFields\(data\)/)
  assert.doesNotMatch(employeeUpdate, /data\.(role|active|permissions|uid|email)/)
  assert.doesNotMatch(functionsIndex.match(/const sharedHrProfileFields = \[[^\]]*\]/)?.[0] || '', /role|active|permissions|uid|email/)
  assert.match(functionsIndex, /const sharedHrProfileFields = \['firstName', 'lastName', 'jobTitle', 'phone', 'personnelNumber', 'employmentStart'\]/)
})

test('personnel edit never grants user creation and the personnel UI has no creation path', () => {
  const userCreation = functionsIndex.match(/export const createManagedUser = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(userCreation, /await assertManager\(request\)/)
  assert.doesNotMatch(userCreation, /assertPersonnelAccess|permissions\.personnel/)
  assert.doesNotMatch(app, /path="\/personal[^\n]*createManagedUser/)
  assert.doesNotMatch(personnelPage, /createManagedUser|Mitarbeiter anlegen/)
})

test('vacation HR metadata is inaccessible to direct Firestore clients', () => {
  assert.match(rules, /match \/hrVacationMeta\/\{vacationId\} \{\s*allow read, write: if false;/)
})

test('AI prompt configurations are callable-only and have dedicated server-side administration', () => {
  assert.match(rules, /match \/aiPromptConfigs\/\{featureId\} \{\s*allow read, write: if false;/)
  assert.match(functionsIndex, /listAiPromptConfigs, publishAiPromptDraft, resetAiPromptDraft, saveAiPromptDraft/)
})

test('knowledge processes expose drafts and archives only to editors', () => {
  const processRules = rules.match(/match \/knowledgeProcesses\/\{processId\} \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.match(processRules, /allow read: if edit\('knowledgeProcesses'\) \|\| \(view\('knowledgeProcesses'\) && resource\.data\.status == 'active'\);/)
  assert.match(processRules, /allow create, update, delete: if false;/)
  assert.match(functionsIndex, /export const saveKnowledgeProcess = onCall/)
  assert.match(functionsIndex, /validateActiveKnowledgeProcess\(process\)/)
})

test('functional roles are readable for process responsibilities and callable-only for maintenance', () => {
  const functionalRoleRules = rules.match(/match \/functionalRoles\/\{functionalRoleId\} \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.match(functionalRoleRules, /allow read: if superadmin\(\) \|\| view\('knowledgeProcesses'\);/)
  assert.match(functionalRoleRules, /allow write: if false;/)
  assert.match(functionsIndex, /export const createFunctionalRole = onCall/)
  assert.match(functionsIndex, /export const updateFunctionalRole = onCall/)
})

test('insolvency partner selection is an App Check protected, editor-only minimal projection', () => {
  const selector = functionsIndex.match(/export const listInsolvencyPartners = onCall[\s\S]*?return \{ partners:/)?.[0] || ''
  assert.match(selector, /enforceAppCheck: true/)
  assert.match(selector, /assertInsolvencyAccess\(request, 'edit'\)/)
  assert.match(functionsIndex, /return \{ partners: partners\.docs\.map\(insolvencyPartnerEntry\) \}/)
  const entry = functionsIndex.match(/function insolvencyPartnerEntry\(snapshot\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(entry, /companyName/)
  assert.match(entry, /debtorNumber/)
  assert.match(entry, /creditorNumber/)
  assert.doesNotMatch(entry, /contacts|portals|email|phone/)
})

test('insolvency creation binds the selected partner and permits only the atomic status transition', () => {
  const insolvencyRules = rules.match(/function insolvencyText[\s\S]*?match \/insolvencies\/\{partnerId\} \{([\s\S]*?)\n {4}\}/)?.[0] || ''
  assert.match(insolvencyRules, /data\.partnerId == partnerId/)
  assert.match(insolvencyRules, /getAfter\(\/databases\/\$\(database\)\/documents\/businessPartners\/\$\(partnerId\)\)\.data\.status == 'insolvency'/)
  assert.match(insolvencyRules, /affectedKeys\(\)\.hasOnly\(\['status', 'updatedAt'\]\)/)
  assert.match(insolvencyRules, /existsAfter\(\/databases\/\$\(database\)\/documents\/insolvencies\/\$\(partnerId\)\)/)
  assert.match(insolvencyRules, /allow delete: if false;/)
})

test('insolvency detail content is scoped to insolvency view and edit rights', () => {
  const insolvencyRules = rules.match(/match \/insolvencies\/\{partnerId\} \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.match(insolvencyRules, /description/)
  assert.match(insolvencyRules, /match \/movements\/\{movementId\}/)
  assert.match(insolvencyRules, /allow read: if view\('insolvencies'\);/)
  assert.match(insolvencyRules, /allow create: if edit\('insolvencies'\).*validInsolvencyMovement/)
  assert.match(insolvencyRules, /match \/documents\/\{documentId\}/)
  assert.match(insolvencyRules, /storagePath == 'insolvencies\/' \+ partnerId \+ '\/documents\/' \+ documentId \+ '\.pdf'/)
})

test('active process questions validate variable answer paths', () => {
  const processValidation = functionsIndex.match(/function validateActiveKnowledgeProcess\(process\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(processValidation, /node\.outputs\.length < 2/)
  assert.match(processValidation, /Antwortwege einer Frage benötigen eindeutige Bezeichnungen/)
  assert.match(processValidation, /edge\.sourceOutputId === output\.id/)
})

test('active process validation permits shared targets but rejects cycles and duplicate answer connections', () => {
  const processValidation = functionsIndex.match(/function validateActiveKnowledgeProcess\(process\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(processValidation, /nodeEdges\.filter\(\(edge\) => edge\.sourceOutputId === output\.id\)\.length !== 1/)
  assert.match(processValidation, /if \(visiting\.has\(nodeId\)\) throw new HttpsError\('failed-precondition', 'Zirkuläre Prozesswege/)
  assert.doesNotMatch(processValidation, /incoming/)
})

test('AI process drafts require process-edit access, validate input, and are returned before draft storage', () => {
  assert.match(functionsIndex, /export \{ generateKnowledgeProcessDraft \} from '\.\/knowledgeProcessAi\.js'/)
  assert.match(knowledgeProcessAi, /await assertProcessEditor\(request\)/)
  assert.match(knowledgeProcessAi, /description\.length < 10/)
  assert.match(knowledgeProcessAi, /status: 'draft'/)
  assert.match(knowledgeProcessAi, /defineSecret\('DREHPUNKT_PROZESS_VORSCHLAG_KEY'\)/)
  assert.match(knowledgeProcessAi, /secrets: \[processDraftOpenAiApiKey\]/)
  assert.match(knowledgeProcessAi, /DREHPUNKT_PROZESS_VORSCHLAG_KEY fehlt/)
  assert.doesNotMatch(knowledgeProcessAi, /defineSecret\('OPENAI_API_KEY'\)/)
  assert.doesNotMatch(knowledgeProcessAi, /knowledgeProcesses'\)\.doc|collection\('knowledgeProcesses'\)/)
})

test('knowledge-process AI uses the published central prompt without weakening its protected core', () => {
  assert.match(aiPrompts, /knowledgeProcesses: \{\s*displayName: 'Wissen & Prozesse'/)
  assert.match(knowledgeProcessAi, /getPublishedAiPromptInstructions\('knowledgeProcesses'\)/)
  assert.match(knowledgeProcessAi, /kann weder Berechtigungen, Datenvalidierung, zulässige Blocktypen, das strukturierte Ausgabeformat noch die Regel zur ausschließlichen Erstellung als Entwurf außer Kraft setzen/)
  assert.match(knowledgeProcessAi, /Schritttitel im Aktivstil mit höchstens fünf Wörtern/)
  assert.match(knowledgeProcessAi, /Beschreibung enthält höchstens einen kurzen Satz/)
  assert.match(knowledgeProcessAi, /keinen doppelten Schritt und kein doppeltes Ende/)
})

test('knowledge-process AI retries an invalid model structure once and keeps structure errors distinct from provider failures', () => {
  assert.match(knowledgeProcessAi, /const retryResponse = await requestOpenAi\(input, true\)/)
  assert.match(knowledgeProcessAi, /validationReason = `retry_after_\$\{firstError\.validationReason \|\| 'invalid'\}:\$\{retryError\.validationReason \|\| 'invalid'\}`/)
  assert.match(knowledgeProcessAi, /new HttpsError\('internal', 'Der KI-Entwurf konnte nicht verarbeitet werden\. Bitte versuchen Sie es erneut\.'/)
  assert.match(knowledgeProcessAi, /new HttpsError\('unavailable', 'Der KI-Prozessentwurf konnte aktuell nicht erstellt werden\. Bitte versuchen Sie es später erneut\.'/)
  assert.match(knowledgeProcessAi, /logger\.warn\('KI-Prozessentwurf fehlgeschlagen\.', \{ errorCode: error\?\.errorType \|\| 'internal_error', validationReason: error\?\.validationReason \|\| '', requestId: error\?\.requestId \|\| '' \}\)/)
  assert.doesNotMatch(knowledgeProcessAi, /logger\.warn\('KI-Prozessentwurf fehlgeschlagen\.', \{[^}]*userId/)
})

test('personnel vacation access follows view/edit and active-superadmin boundaries', () => {
  const vacationList = functionsIndex.match(/export const listPersonnelVacations = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  const vacationMetaUpdate = functionsIndex.match(/export const updatePersonnelVacationMeta = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(vacationList, /assertPersonnelAccess\(request\)/)
  assert.match(vacationMetaUpdate, /assertPersonnelAccess\(request, 'edit'\)/)
  assert.match(functionsIndex, /if \(profile\?\.role === 'superadmin'\) return true/)
  assert.match(rules, /function superadmin\(\) \{ return active\(\) && role\(\) == 'superadmin'; \}/)
  assert.doesNotMatch(functionsIndex.match(/function hasPersonnelPermission\(profile, minimum = 'view'\) \{([\s\S]*?)\n\}/)?.[1] || '', /role === 'admin'/)
})

test('payroll status and HR notes remain fully editable for personnel edit', () => {
  const vacationMetaUpdate = functionsIndex.match(/export const updatePersonnelVacationMeta = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(vacationMetaUpdate, /typeof payrollProcessed !== 'boolean'/)
  assert.match(vacationMetaUpdate, /transaction\.set\(metaRef, \{[\s\S]*?payrollProcessed,/)
  assert.match(vacationMetaUpdate, /const note = optionalText\(hrNote, 'HR-Bemerkung', 3000\)/)
  assert.doesNotMatch(vacationMetaUpdate, /payrollProcessed === true|payrollProcessed == true/)
  assert.match(functionsIndex, /if \(value === undefined \|\| value === null\) return ''/)
  assert.match(functionsIndex, /hrNote: note,/)
})

test('HR vacation metadata cannot alter the underlying vacation workflow', () => {
  const vacationMetaUpdate = functionsIndex.match(/export const updatePersonnelVacationMeta = onCall([\s\S]*?\n\}\))/)?.[1] || ''
  assert.match(vacationMetaUpdate, /transaction\.set\(metaRef/)
  assert.doesNotMatch(vacationMetaUpdate, /transaction\.(update|set)\(vacationRef/)
  const vacationRules = rules.match(/match \/vacationRequests\/\{id\} \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.match(vacationRules, /allow update, delete: if false;/)
})
