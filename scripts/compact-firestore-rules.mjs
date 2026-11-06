import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Keep quoted values and token boundaries; compact only comments/whitespace.
export function compactRulesSource(source) {
  const stripped = source.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, value =>
    value.startsWith('//') || value.startsWith('/*') ? ' ' : value)
  const combinedOperators = new Set(['&&', '||', '==', '!=', '<=', '>=', '//', '/*', '*/', '++', '--', '**'])
  return stripped.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\s+/g, (value, offset) => {
    if (!/^\s/.test(value)) return value
    const before = stripped[offset - 1] || '', after = stripped[offset + value.length] || ''
    return /[\w]/.test(before) && /[\w]/.test(after) || combinedOperators.has(before + after) ? ' ' : ''
  }).trim()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const target = resolve('tmp/firestore-release')
  mkdirSync(target, { recursive: true })
  const source = readFileSync('firestore.rules', 'utf8')
  const content = compactRulesSource(source)
  writeFileSync(resolve(target, 'firestore.rules'), content)
  writeFileSync(resolve(target, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules' } }) + '\n')
  console.log(`Prepared identical rules without comments/repeated whitespace: ${Buffer.byteLength(source)} -> ${Buffer.byteLength(content)} bytes.`)
}
