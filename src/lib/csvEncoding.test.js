import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeCsvBytes } from './csvEncoding.js'

test('keeps UTF-8 CSV text unchanged', () => {
  assert.equal(decodeCsvBytes(new TextEncoder().encode('Düsseldorf;Fördertechnik')), 'Düsseldorf;Fördertechnik')
})

test('falls back to Windows-1252 for DyCoS-style umlauts', () => {
  const windows1252 = Uint8Array.from([0x46, 0xF6, 0x72, 0x64, 0x65, 0x72, 0x74, 0x65, 0x63, 0x68, 0x6E, 0x69, 0x6B, 0x3B, 0x4C, 0xF6, 0x6E, 0x65, 0x6E, 0x3B, 0x4D, 0xFC, 0x6E, 0x63, 0x68, 0x65, 0x6E])
  assert.equal(decodeCsvBytes(windows1252), 'Fördertechnik;Lönen;München')
})
