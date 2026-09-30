import assert from 'node:assert/strict'
import test from 'node:test'
import { readSidebarExpandedGroups, readSidebarFavorites, saveSidebarExpandedGroups, saveSidebarFavorites } from './sidebarPreferences.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('sidebar preferences are scoped to the user and drop unavailable navigation entries', () => {
  const originalWindow = globalThis.window
  globalThis.window = { localStorage: createStorage() }

  try {
    saveSidebarFavorites('user-a', ['/todos', '/crm', '/todos'])
    saveSidebarExpandedGroups('user-a', ['people', 'operations'])

    assert.deepEqual(readSidebarFavorites('user-a', ['/todos']), ['/todos'])
    assert.deepEqual(readSidebarFavorites('user-b', ['/todos', '/crm']), [])
    assert.deepEqual(readSidebarExpandedGroups('user-a', ['overview', 'people']), ['people'])
    assert.deepEqual(readSidebarExpandedGroups('user-b', ['overview', 'people']), [])
  } finally {
    globalThis.window = originalWindow
  }
})

test('sidebar preferences tolerate missing browser storage and malformed values', () => {
  const originalWindow = globalThis.window
  globalThis.window = { localStorage: { getItem: () => '{not json', setItem: () => { throw new Error('storage blocked') } } }

  try {
    assert.deepEqual(readSidebarFavorites('user-a', ['/todos']), [])
    assert.deepEqual(readSidebarExpandedGroups('user-a', ['overview']), [])
    assert.doesNotThrow(() => saveSidebarFavorites('user-a', ['/todos']))
    assert.doesNotThrow(() => saveSidebarExpandedGroups('user-a', ['overview']))
  } finally {
    globalThis.window = originalWindow
  }
})
