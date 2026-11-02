import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessTeamVacation, canViewTeamVacationTab, isTeamVacationPath, TEAM_VACATION_PATH, teamVacationTabs } from './teamVacationNavigation.js'
import { getPageTitle } from './pageTitles.js'

const profile = (permissions = {}, extra = {}) => ({ role: 'user', active: true, permissions, ...extra })
const visible = user => canAccessTeamVacation(user) ? teamVacationTabs.filter(tab => canViewTeamVacationTab(user, tab)).map(tab => tab.id) : []

test('team and vacation keeps existing links, distinguishes its overview and matches only its own sections', () => {
  assert.equal(TEAM_VACATION_PATH, '/team-urlaub')
  assert.deepEqual(teamVacationTabs.map(tab => tab.path), ['/team-urlaub', '/team', '/urlaub', '/urlaubsmanagement'])
  assert.equal(getPageTitle(TEAM_VACATION_PATH), 'Team & Urlaub')
  assert.equal(getPageTitle('/team'), 'Team Brennpunkt')
  assert.equal(getPageTitle('/urlaub'), 'Urlaubsübersicht')
  for (const tab of teamVacationTabs) assert.equal(isTeamVacationPath(tab.path), true)
  for (const path of ['/team-anders', '/team-urlaub-anders', '/urlaub-anders', '/personal', '/personalwesen']) assert.equal(isTeamVacationPath(path), false)
})

test('team and own leave stay separate from the vacation manager assignment', () => {
  assert.deepEqual(visible(profile({ team: 'view' })), ['overview', 'team'])
  assert.deepEqual(visible(profile({ vacation: 'edit' })), ['overview', 'vacation'])
  assert.deepEqual(visible(profile({}, { vacationManager: true })), ['overview', 'management'])
  assert.deepEqual(visible(profile({ team: 'view', vacation: 'view' }, { vacationManager: true })), ['overview', 'team', 'vacation', 'management'])
})

test('admin role alone and unrelated personnel permissions do not grant team or leave access', () => {
  assert.deepEqual(visible(profile({}, { role: 'admin' })), [])
  assert.deepEqual(visible(profile({ personnel: 'edit' })), [])
  assert.deepEqual(visible(profile()), [])
  assert.deepEqual(visible(profile({}, { role: 'superadmin' })), ['overview', 'team', 'vacation', 'management'])
})
