import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import test from 'node:test'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { correctTimeDay, getOwnMobileVacation, listOwnTimeBookings, listTimeWorkspace, saveTimeAccount, saveTimeWorkModel, stampTime } from './timeTracking.js'
import { archiveTimeWorkModelTemplate, listTimeWorkModelTemplates, saveTimeWorkModelTemplate } from './timeWorkModelTemplates.js'
import { addTimeDays, berlinTimeDate } from './shared/timeTracking.js'

const emulator = /^((?:127\.0\.0\.1)|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-time'
const denied = { code: 'permission-denied' }
const deniedAuth = { code: 'unauthenticated' }
const call = (fn, uid, data = {}) => fn.run({ auth: uid ? { uid } : undefined, data })

// firebase emulators:exec --only firestore --project demo-drehpunkt-time
// "node --test functions/timeTracking.rights.integration.test.js"
test('Zeit- und Urlaubsrechte gegen Firestore Emulator', { skip: !emulator }, async (t) => {
  assert.match(projectId, /^demo-/, 'Die Integrationstests verwenden ausschließlich ein lokales Demo-Projekt.')
  const adminApp = initializeAdminApp({ projectId })
  const admin = getAdminFirestore(adminApp)
  const apps = []
  const key = `rights-${randomUUID()}`
  const department = `${key}-office`
  const outsideDepartment = `${key}-warehouse`
  const today = berlinTimeDate()
  const sevenDaysAgo = addTimeDays(today, -7)
  const older = addTimeDays(today, -8)
  const range = { from: older, to: today }
  const profile = (fields = {}) => ({ active: true, role: 'user', departmentId: department, permissions: {}, ...fields })
  const scope = { timeManager: true, timeManagerDepartments: [department] }
  const profiles = {
    editor: profile({ permissions: { timeTracking: 'edit', vacation: 'edit' } }),
    viewer: profile({ permissions: { timeTracking: 'view', vacation: 'view' } }),
    outside: profile({ departmentId: outsideDepartment, permissions: { timeTracking: 'edit' } }),
    unassigned: profile({ departmentId: '' }),
    admin: profile({ role: 'admin' }),
    manager: profile(scope),
    managerEditor: profile({ ...scope, permissions: { timeTracking: 'edit' } }),
    allManager: profile({ timeManager: true, timeManagerAllDepartments: true }),
    emptyManager: profile({ timeManager: true, timeManagerDepartments: [] }),
    vacationManager: profile({ vacationManager: true, vacationManagerDepartments: [department], permissions: { vacation: 'edit' } }),
    personnel: profile({ permissions: { personnel: 'view' } }),
    superadmin: profile({ role: 'superadmin' }),
    inactive: profile({ active: false, role: 'superadmin', timeManager: true, timeManagerAllDepartments: true }),
    legacy: { role: 'superadmin' },
  }
  const uid = (name) => `${key}-${name}`
  const editor = uid('editor')
  const viewer = uid('viewer')
  const outside = uid('outside')
  const manager = uid('manager')
  const managerEditor = uid('managerEditor')
  const superadmin = uid('superadmin')
  const modelId = `${key}-model`
  const ownVacationId = `${key}-own-vacation`
  const foreignVacationId = `${key}-foreign-vacation`
  const ownHistoryId = `${key}-own-vacation-history`
  const model = { id: modelId, userId: editor, validFrom: older, weekdays: { 1: { targetMinutes: 480, breaks: [{ afterMinutes: 360, requiredMinutes: 30 }] } }, holidayCountryCode: 'DE', holidaySubdivisionCode: 'NW' }
  const account = { userId: editor, startDate: older, openingBalanceMinutes: 125 }
  const correction = (actorId, userId, date = older) => ({ expectedUserId: actorId, userId, date, expectedRevision: 0, reason: 'forgot_stamp', events: [{ id: `${key}-${date}-come`, type: 'come', at: `${date}T08:00:00Z` }, { id: `${key}-${date}-go`, type: 'go', at: `${date}T12:00:00Z` }] })
  const stamp = (actorId) => ({ expectedUserId: actorId, eventId: `${key}-live`, type: 'come', at: new Date().toISOString() })
  const client = (name) => {
    const app = initializeApp({ projectId, apiKey: 'test' }, `${key}-${name}-${apps.length}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, emulator[1], Number(emulator[2]), name === 'anonymous' ? {} : { mockUserToken: { sub: uid(name) } })
    return db
  }
  let template
  try {
    await Promise.all([
      ...Object.entries(profiles).map(([name, value]) => admin.doc(`users/${uid(name)}`).set({ ...value, firstName: name, email: `${name}@example.test`, securityMarker: 'private' })),
      admin.doc(`vacationRequests/${ownVacationId}`).set({ userId: editor, status: 'approved', type: 'vacation', startDate: older, endDate: older, days: 1, vacationType: 'overtime' }),
      admin.doc(`vacationRequests/${foreignVacationId}`).set({ userId: outside, status: 'approved', type: 'vacation', startDate: older, endDate: older, days: 1, managerComment: 'private foreign note' }),
      admin.doc(`vacationHistory/${ownHistoryId}`).set({ userId: editor, vacationId: ownVacationId }),
      admin.doc(`employeeHrProfiles/${editor}`).set({ annualVacationEntitlement: 28, vacationTrackingStartYear: 2026, vacationTrackingOpeningBalance: 3, taxClass: 'private' }),
    ])

    await t.test('alle Zeit- und Vorlagenfunktionen verlangen Anmeldung und ein ausdrücklich aktives Profil', async () => {
      const endpoints = [listOwnTimeBookings, listTimeWorkspace, stampTime, correctTimeDay, saveTimeWorkModel, saveTimeAccount, listTimeWorkModelTemplates, saveTimeWorkModelTemplate, archiveTimeWorkModelTemplate, getOwnMobileVacation]
      for (const fn of endpoints) {
        await assert.rejects(call(fn, null), deniedAuth)
        for (const name of ['missing', 'inactive', 'legacy']) {
          await assert.rejects(call(fn, uid(name), { expectedUserId: uid(name) }), denied)
        }
      }
    })

    await t.test('aktive Superadmins pflegen Modelle, Anfangssalden und Vorlagen', async () => {
      for (const actorId of [editor, viewer, uid('admin'), manager, uid('allManager'), uid('vacationManager'), uid('personnel')]) {
        await assert.rejects(call(saveTimeWorkModel, actorId, { model }), denied)
        await assert.rejects(call(saveTimeAccount, actorId, account), denied)
        await assert.rejects(call(listTimeWorkModelTemplates, actorId), denied)
        await assert.rejects(call(saveTimeWorkModelTemplate, actorId, { name: key }), denied)
        await assert.rejects(call(archiveTimeWorkModelTemplate, actorId, { id: modelId, expectedRevision: 1 }), denied)
      }
      assert.equal((await call(saveTimeWorkModel, superadmin, { model })).model.id, modelId)
      assert.equal((await call(saveTimeAccount, superadmin, account)).account.openingBalanceMinutes, 125)
      await assert.rejects(call(saveTimeWorkModel, superadmin, { model: { ...model, userId: outside } }), denied)
      const adminView = await call(listTimeWorkspace, superadmin, { ...range, managed: true, userId: editor })
      assert.deepEqual(adminView.models.map((entry) => entry.id), [modelId])
      assert.equal(adminView.account.openingBalanceMinutes, 125)
      template = (await call(saveTimeWorkModelTemplate, superadmin, { name: key, weekdays: model.weekdays })).template
      assert.equal(template.revision, 1)
      assert.ok((await call(listTimeWorkModelTemplates, superadmin)).templates.some((entry) => entry.id === template.id))
    })

    await t.test('eigene Zeitdaten unterscheiden Lesen und Bearbeiten, Konto-Wechsel bleiben gesperrt', async () => {
      for (const actorId of [editor, viewer]) {
        const own = await call(listTimeWorkspace, actorId, { ...range, ownOnly: true })
        assert.equal(own.user.id, actorId)
        assert.deepEqual(own.employees.map((entry) => entry.id), [actorId])
        assert.deepEqual(own.models, [])
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, userId: outside }), denied)
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, managed: true }), denied)
      }
      for (const actorId of [uid('admin'), manager, uid('vacationManager'), uid('personnel')]) {
        await assert.rejects(call(listTimeWorkspace, actorId, range), denied)
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, ownOnly: true }), denied)
        await assert.rejects(call(stampTime, actorId, stamp(actorId)), denied)
        await assert.rejects(call(correctTimeDay, actorId, correction(actorId, actorId, sevenDaysAgo)), denied)
      }
      await assert.rejects(call(stampTime, viewer, stamp(viewer)), denied)
      await assert.rejects(call(correctTimeDay, viewer, correction(viewer, viewer, sevenDaysAgo)), denied)
      await assert.rejects(call(stampTime, editor, stamp(outside)), denied)
      await assert.rejects(call(correctTimeDay, editor, correction(outside, editor, sevenDaysAgo)), denied)
      await assert.rejects(call(correctTimeDay, editor, correction(editor, outside, sevenDaysAgo)), denied)
      const event = await call(stampTime, editor, { ...stamp(editor), userId: outside })
      assert.equal(event.accepted, true)
      assert.equal((await admin.doc(`timeDays/${outside}_${event.date}`).get()).exists, false)
      assert.equal((await admin.doc(`timeDays/${editor}_${event.date}`).get()).data().events[0].id, `${key}-live`)
      await assert.rejects(call(correctTimeDay, editor, correction(editor, editor)), denied)
      assert.equal((await call(correctTimeDay, editor, correction(editor, editor, sevenDaysAgo))).revision, 1)
      const own = await call(listTimeWorkspace, editor, { ...range, ownOnly: true })
      assert.ok(own.history.some((entry) => entry.date === sevenDaysAgo && entry.createdBy === editor && entry.reason === 'forgot_stamp'))
    })

    await t.test('Zeitmanager sehen und korrigieren nur den zugewiesenen Bereich; eigene Frist gilt weiter', async () => {
      const scoped = await call(listTimeWorkspace, manager, { ...range, managed: true, userId: editor })
      assert.equal(scoped.user.id, editor)
      assert.deepEqual(scoped.models, [])
      assert.ok(scoped.employees.some((entry) => entry.id === editor))
      assert.ok(scoped.employees.every((entry) => entry.departmentId === department && entry.id !== manager && !('email' in entry)))
      const initial = await call(listTimeWorkspace, manager, { ...range, managed: true })
      assert.notEqual(initial.user.id, manager)
      await assert.rejects(call(listTimeWorkspace, manager, { ...range, managed: true, userId: manager }), denied)
      for (const userId of [outside, uid('unassigned')]) {
        await assert.rejects(call(listTimeWorkspace, manager, { ...range, managed: true, userId }), denied)
        await assert.rejects(call(listTimeWorkspace, manager, { ...range, userId }), denied)
        await assert.rejects(call(correctTimeDay, manager, correction(manager, userId)), denied)
      }
      await assert.rejects(call(listTimeWorkspace, uid('emptyManager'), { ...range, managed: true }), { code: 'failed-precondition' })
      const companyWide = await call(listTimeWorkspace, uid('allManager'), { ...range, managed: true, userId: outside })
      assert.ok(companyWide.employees.some((entry) => entry.id === outside))
      assert.ok(companyWide.employees.some((entry) => entry.id === uid('unassigned')))
      assert.ok(!companyWide.employees.some((entry) => entry.id === uid('inactive')))
      for (const actorId of [manager, managerEditor, superadmin]) {
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, ownOnly: true, userId: editor }), denied)
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, ownOnly: true, managed: true }), denied)
      }
      assert.equal((await call(listTimeWorkspace, managerEditor, { ...range, ownOnly: true })).user.id, managerEditor)
      await assert.rejects(call(correctTimeDay, managerEditor, correction(managerEditor, managerEditor)), denied)
      assert.equal((await call(correctTimeDay, managerEditor, correction(managerEditor, managerEditor, sevenDaysAgo))).revision, 1)
      assert.equal((await call(correctTimeDay, manager, correction(manager, editor))).revision, 1)
      const adjusted = await call(listTimeWorkspace, editor, { ...range, ownOnly: true })
      assert.ok(adjusted.history.some((entry) => entry.date === older && entry.createdBy === manager && entry.after.length === 2))
    })

    await t.test('Personalrecht sieht fremde Salden und Abbaubelege ohne Stempel, Modelle oder Historie', async () => {
      const hr = uid('personnel')
      for (const actorId of [editor, uid('admin'), manager, uid('vacationManager')]) {
        await assert.rejects(call(listTimeWorkspace, actorId, { ...range, userId: editor, personnelOnly: true }), denied)
      }
      await assert.rejects(call(listTimeWorkspace, hr, { ...range, userId: editor }), denied)
      await assert.rejects(call(listTimeWorkspace, hr, { ...range, userId: editor, personnelOnly: true, managed: true }), denied)
      await assert.rejects(call(listTimeWorkspace, hr, { ...range, personnelOnly: true, ownOnly: true }), denied)
      await assert.rejects(call(correctTimeDay, hr, correction(hr, editor)), denied)
      const view = await call(listTimeWorkspace, hr, { ...range, userId: editor, personnelOnly: true })
      assert.equal(view.user.id, editor)
      assert.equal(view.account.openingBalanceMinutes, 125)
      assert.deepEqual(Object.keys(view).sort(), ['account', 'balanceMinutes', 'balanceProvisional', 'days', 'user'])
      for (const day of view.days) assert.deepEqual(Object.keys(day).sort(), ['calculationIncomplete', 'date', 'overtimeDebitMinutes', 'overtimeRequestIds'])
      assert.deepEqual(view.days.find((day) => day.date === older).overtimeRequestIds, [ownVacationId])
    })

    await t.test('mobiler Urlaub verwendet das eigene Konto und liefert keine privaten Personalstammdaten', async () => {
      for (const actorId of [manager, uid('allManager'), uid('admin'), uid('personnel')]) {
        await assert.rejects(call(getOwnMobileVacation, actorId), denied)
      }
      const data = await call(getOwnMobileVacation, editor, { userId: outside })
      assert.deepEqual(data.requests.map((entry) => entry.id), [ownVacationId])
      assert.deepEqual(data.history.map((entry) => entry.id), [ownHistoryId])
      assert.deepEqual(data.profile, { annualVacationEntitlement: 28, vacationTrackingStartYear: 2026, vacationTrackingOpeningBalance: 3 })
      assert.deepEqual((await call(getOwnMobileVacation, viewer)).requests, [])
    })

    await t.test('direkte Firestore-Zugriffe auf Zeitdaten und Eigenvergabe von Rechten sind gesperrt', async () => {
      const protectedPaths = [
        `timeWorkModels/${modelId}`,
        `timeAccounts/${editor}`,
        `timeDays/${editor}_${older}`,
        `timeHistory/${key}-seed`,
        `timeWorkModelTemplates/${template.id}`,
        `timeWorkModelTemplates/${template.id}/history/${key}-seed`,
        `timeWorkModelTemplateNames/${key}-seed`,
      ]
      for (const path of protectedPaths.filter((path) => path.endsWith('-seed'))) await admin.doc(path).set({ userId: editor })
      for (const name of ['editor', 'manager', 'personnel', 'superadmin', 'anonymous']) {
        const db = client(name)
        await Promise.all(protectedPaths.map(async (path) => {
          const parent = path.slice(0, path.lastIndexOf('/'))
          const existing = doc(db, path)
          await assert.rejects(getDoc(existing), denied)
          await assert.rejects(getDocs(collection(db, parent)), denied)
          await assert.rejects(setDoc(doc(db, `${parent}/${key}-forged`), { userId: editor }), denied)
          await assert.rejects(updateDoc(existing, { userId: outside }), denied)
          await assert.rejects(deleteDoc(existing), denied)
        }))
        if (name !== 'anonymous') {
          const ownProfile = doc(db, `users/${uid(name)}`)
          assert.equal((await getDoc(ownProfile)).exists(), true)
          await assert.rejects(updateDoc(ownProfile, { timeManager: true, timeManagerAllDepartments: true, 'permissions.timeTracking': 'edit' }), denied)
        }
      }
      assert.equal((await call(archiveTimeWorkModelTemplate, superadmin, { id: template.id, expectedRevision: 1 })).archived, true)
      assert.ok(!(await call(listTimeWorkModelTemplates, superadmin)).templates.some((entry) => entry.id === template.id))
    })

    await t.test('Client-Urlaubsanträge dürfen weder Genehmigungen noch falsche Verknüpfungen einschleusen', async () => {
      const db = client('editor')
      const vacation = (name, fields = {}) => {
        const ref = doc(db, 'vacationRequests', `${key}-${name}`)
        return setDoc(ref, {
          id: ref.id, userId: editor, type: 'vacation', status: 'pending', mainStatus: 'pending',
          startDate: sevenDaysAgo, endDate: sevenDaysAgo, days: 1, vacationType: 'overtime',
          note: '', requestComment: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...fields,
        })
      }
      await vacation('ordinary-pending')
      await vacation('pending-to-replace', { halfDayDate: '' })
      for (const [name, fields] of Object.entries({
        'forged-main-status': { mainStatus: 'approved' },
        'forged-request-status': { requestStatus: 'pending' },
        'forged-approval': { status: 'approved' },
        'forged-approver': { approvedBy: manager },
        'forged-time-effect': { timeAccountEffect: 'overtime_debit' },
        'forged-manual-entry': { hrManualEntry: true },
        'foreign-owner': { userId: outside },
      })) await assert.rejects(vacation(name, fields), denied)

      const followup = (name, fields = {}) => {
        const ref = doc(db, 'vacationRequests', `${key}-${name}`)
        return setDoc(ref, {
          id: ref.id, userId: editor, type: 'vacation', status: 'change_requested', requestStatus: 'pending',
          originalRequestId: ownVacationId, vacationId: ownVacationId, startDate: sevenDaysAgo,
          endDate: sevenDaysAgo, days: 1, vacationType: 'overtime', note: '', requestComment: '',
          changeRequest: { originalStartDate: older, originalEndDate: older, originalDays: 1 },
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...fields,
        })
      }
      await followup('ordinary-followup')
      for (const [name, fields] of Object.entries({
        'forged-child-status': { requestStatus: 'approved' },
        'forged-child-link': { vacationId: foreignVacationId },
        'foreign-child-owner': { originalRequestId: foreignVacationId, vacationId: foreignVacationId },
        'pending-child-root': { originalRequestId: `${key}-ordinary-pending`, vacationId: `${key}-ordinary-pending` },
        'forged-child-main-status': { mainStatus: 'approved' },
      })) await assert.rejects(followup(name, fields), denied)
      const cancellation = doc(db, 'vacationRequests', `${key}-ordinary-cancellation`)
      await setDoc(cancellation, {
        id: cancellation.id, userId: editor, type: 'vacation', status: 'cancellation_requested', requestStatus: 'pending',
        requestKind: 'cancellation', originalRequestId: ownVacationId, vacationId: ownVacationId, startDate: older,
        endDate: older, days: 1, vacationType: 'overtime', note: '', requestComment: '',
        cancellationRequest: { originalStartDate: older, originalEndDate: older, originalDays: 1 },
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      await assert.rejects(updateDoc(doc(db, 'vacationRequests', `${key}-ordinary-pending`), { status: 'approved' }), denied)
    })

    await t.test('nur Urlaubsbearbeiter schreiben eigene Anträge und nur Urlaubsmanager genehmigen sie', async () => {
      const { processVacationRequest, replacePendingVacationRequest, withdrawVacationRequest } = await import('./index.js')
      const replacement = { startDate: older, endDate: older, days: 1, vacationType: 'overtime' }
      const pendingId = `${key}-ordinary-pending`
      const viewerId = `${key}-viewer-request`
      const legacyId = `${key}-legacy-approved`
      await Promise.all([
        admin.doc(`vacationRequests/${viewerId}`).set({ userId: viewer, status: 'pending', type: 'vacation', ...replacement }),
        admin.doc(`vacationRequests/${legacyId}`).set({ userId: editor, status: 'approved', requestStatus: 'pending', type: 'vacation', ...replacement }),
      ])
      await assert.rejects(call(withdrawVacationRequest, viewer, { requestId: viewerId }), denied)
      await assert.rejects(call(replacePendingVacationRequest, viewer, { requestId: viewerId, values: replacement }), denied)
      await assert.rejects(call(withdrawVacationRequest, editor, { requestId: viewerId }), denied)
      await assert.rejects(call(replacePendingVacationRequest, editor, { requestId: viewerId, values: replacement }), denied)
      await assert.rejects(call(withdrawVacationRequest, editor, { requestId: legacyId }), { code: 'failed-precondition' })
      assert.equal((await admin.doc(`vacationRequests/${legacyId}`).get()).data().status, 'approved')
      const decision = { requestId: pendingId, decision: 'approved' }
      await assert.rejects(call(processVacationRequest, manager, decision), denied)
      await assert.rejects(call(processVacationRequest, editor, decision), denied)
      assert.equal((await call(processVacationRequest, uid('vacationManager'), decision)).status, 'approved')
      assert.equal((await admin.doc(`vacationRequests/${pendingId}`).get()).data().timeAccountEffect, 'overtime_debit')
      await assert.rejects(call(withdrawVacationRequest, editor, { requestId: pendingId }), { code: 'failed-precondition' })
      assert.equal((await call(withdrawVacationRequest, editor, { requestId: `${key}-ordinary-followup` })).status, 'withdrawn')
      assert.equal((await call(withdrawVacationRequest, editor, { requestId: `${key}-ordinary-cancellation` })).status, 'withdrawn')
      assert.equal((await admin.doc(`vacationRequests/${ownVacationId}`).get()).data().status, 'approved')
      const replacedId = `${key}-pending-to-replace`
      const revised = await call(replacePendingVacationRequest, editor, { requestId: replacedId, values: replacement })
      assert.equal(revised.status, 'pending')
      assert.equal((await admin.doc(`vacationRequests/${replacedId}`).get()).data().supersededBy, revised.requestId)
      assert.equal((await call(withdrawVacationRequest, editor, { requestId: revised.requestId })).status, 'withdrawn')
    })
    await t.test('Buchungsjournal bleibt trotz fremder Ziel-ID ausschließlich beim angemeldeten Nutzer', async () => {
      const date = '2000-01-03'
      for (const actorId of [editor, viewer, outside]) {
        const events = [{ id: `booking-${actorId}`, type: 'come', at: `${date}T08:00:00.000Z`, source: 'live' }]
        await admin.doc(`timeDays/${actorId}_${date}`).set({ userId: actorId, date, events, revision: 1 })
        await admin.doc(`timeHistory/${key}-audit-${actorId}`).set({ userId: actorId, date, kind: 'stamp', after: events[0], createdBy: actorId, createdAt: new Date() })
      }
      for (const actorId of [editor, viewer]) {
        const result = await call(listOwnTimeBookings, actorId, { userId: outside, before: '2000-01-04' })
        assert.equal(result.days.length, 1)
        assert.equal(result.days[0].events[0].id, `booking-${actorId}`)
        assert.ok(result.history.every(entry => entry.userId === actorId))
        assert.equal(result.models, undefined)
        assert.equal(result.employees, undefined)
      }
      for (const name of ['admin', 'manager', 'personnel', 'vacationManager']) await assert.rejects(call(listOwnTimeBookings, uid(name)), denied)
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
