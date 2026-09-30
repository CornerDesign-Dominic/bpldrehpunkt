import assert from 'node:assert/strict'
import test from 'node:test'
import { developmentProjectId, externalEffectsAllowed, externalEffectsEnvironment, productionProjectId, publicDataSynchronizationAllowed, runtimeProjectId } from './externalEffects.js'

test('allows external effects only in the production project', () => {
  assert.equal(externalEffectsEnvironment({ GCLOUD_PROJECT: productionProjectId }), 'production')
  assert.equal(externalEffectsAllowed({ GCLOUD_PROJECT: productionProjectId }), true)
})

test('blocks external effects in the development project', () => {
  assert.equal(externalEffectsEnvironment({ GCLOUD_PROJECT: developmentProjectId }), 'development')
  assert.equal(externalEffectsAllowed({ GCLOUD_PROJECT: developmentProjectId }), false)
  assert.equal(publicDataSynchronizationAllowed({ GCLOUD_PROJECT: developmentProjectId }), true)
})

test('fails closed for missing or unknown runtime project IDs', () => {
  assert.equal(runtimeProjectId({}), '')
  assert.equal(externalEffectsEnvironment({ GOOGLE_CLOUD_PROJECT: 'another-project' }), 'unknown')
  assert.equal(externalEffectsAllowed({ GOOGLE_CLOUD_PROJECT: 'another-project' }), false)
  assert.equal(publicDataSynchronizationAllowed({ GOOGLE_CLOUD_PROJECT: 'another-project' }), false)
})
