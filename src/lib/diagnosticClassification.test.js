import assert from 'node:assert/strict'
import test from 'node:test'
import { diagnosticCode, documentAssetDiagnosticCode, websiteDiagnosticStage } from './diagnosticClassification.js'

test('document assets report technical failures but not absent files or canceled requests', () => {
  assert.equal(documentAssetDiagnosticCode({ code: 'signature/not-uploaded' }), null)
  assert.equal(documentAssetDiagnosticCode({ code: 'storage/object-not-found' }), null)
  assert.equal(documentAssetDiagnosticCode({ code: 'functions/not-found' }), 'unavailable')
  assert.equal(documentAssetDiagnosticCode({ code: 'storage/canceled' }), null)
  assert.equal(documentAssetDiagnosticCode({ code: 'functions/internal' }), 'internal')
  assert.equal(documentAssetDiagnosticCode({ code: 'functions/permission-denied' }), 'access-failure')
  assert.equal(documentAssetDiagnosticCode({ code: 'signature/timeout' }), 'deadline-exceeded')
  assert.equal(documentAssetDiagnosticCode({ code: 'diagnostic/invalid-response' }), 'invalid-response')
})

test('shipment tracking diagnostics exclude expected user and permission errors', () => {
  assert.equal(diagnosticCode({ code: 'functions/invalid-argument' }), null)
  assert.equal(diagnosticCode({ code: 'firestore/permission-denied' }), null)
  assert.equal(diagnosticCode({ code: 'functions/unavailable' }), 'unavailable')
  assert.equal(diagnosticCode({ code: 'network/failed' }), 'unknown')
})

test('website errors are assigned to a coarse module area without storing paths', () => {
  assert.equal(websiteDiagnosticStage('/transportauftraege/dev-order'), 'transport-orders')
  assert.equal(websiteDiagnosticStage('/kunden-unternehmer/partner-1'), 'partners')
  assert.equal(websiteDiagnosticStage('/admin/diagnose'), 'administration')
  assert.equal(websiteDiagnosticStage('/unbekannt'), 'other')
})
