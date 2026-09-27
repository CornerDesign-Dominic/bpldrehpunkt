import { copyFile, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Firebase packages functions/ as its source. Keep a real, generated copy of
// shared modules there; a local junction/symlink or ../shared import is unsafe.
const source = fileURLToPath(new URL('../shared/', import.meta.url))
const target = fileURLToPath(new URL('../functions/shared/', import.meta.url))
const mode = process.argv[2]
if (!['--write', '--check'].includes(mode)) throw new Error('Use --write or --check.')

if (mode === '--write') await mkdir(target, { recursive: true })
const targetInfo = await lstat(target)
if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink() || await realpath(source) === await realpath(target)) {
  throw new Error('functions/shared must be a real, independent directory.')
}

const sourceFiles = (await readdir(source, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.js')).map((entry) => entry.name).sort()
if (mode === '--write') {
  for (const name of sourceFiles) await copyFile(new URL(`../shared/${name}`, import.meta.url), new URL(`../functions/shared/${name}`, import.meta.url))
}

const targetFiles = (await readdir(target, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.js')).map((entry) => entry.name).sort()
if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) throw new Error('functions/shared file list differs from shared/. Run npm run sync:functions-shared and inspect extra files.')
for (const name of sourceFiles) {
  const [original, mirror] = await Promise.all([
    readFile(new URL(`../shared/${name}`, import.meta.url)),
    readFile(new URL(`../functions/shared/${name}`, import.meta.url)),
  ])
  if (!original.equals(mirror)) throw new Error(`functions/shared/${name} differs from shared/${name}. Run npm run sync:functions-shared.`)
}
process.stdout.write(`Verified ${sourceFiles.length} deploy-safe shared modules.\n`)
