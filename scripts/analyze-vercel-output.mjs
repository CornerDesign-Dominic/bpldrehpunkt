import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const outputDirectories = ['.vercel/output', 'dist']
const outputDirectoryFromEnvironment = process.env.VERCEL_OUTPUT_DIR

if (outputDirectoryFromEnvironment) outputDirectories.unshift(outputDirectoryFromEnvironment)

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

async function collectFiles(directory) {
  const files = []

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath)
      } else if (entry.isFile()) {
        files.push({ path: fullPath, bytes: (await stat(fullPath)).size })
      }
    }
  }

  await visit(directory)
  return files
}

function printBreakdown(title, entries) {
  if (!entries.length) return
  console.log(`\n${title}`)
  for (const entry of entries) console.log(`  ${formatBytes(entry.bytes).padStart(10)}  ${entry.name}`)
}

async function analyzeOutput(directory) {
  const absoluteDirectory = path.resolve(directory)
  let directoryStats
  try {
    directoryStats = await stat(absoluteDirectory)
  } catch {
    return false
  }
  if (!directoryStats.isDirectory()) return false

  const files = await collectFiles(absoluteDirectory)
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0)
  const relativeFiles = files.map((file) => ({
    ...file,
    relativePath: path.relative(absoluteDirectory, file.path).split(path.sep).join('/'),
  }))
  const byTopLevelDirectory = new Map()
  const byFunctionBundle = new Map()

  for (const file of relativeFiles) {
    const pathParts = file.relativePath.split('/')
    const topLevelDirectory = pathParts.length === 1 ? '(root files)' : pathParts[0]
    byTopLevelDirectory.set(topLevelDirectory, (byTopLevelDirectory.get(topLevelDirectory) ?? 0) + file.bytes)

    const functionDirectoryIndex = pathParts.findIndex((part) => part.endsWith('.func'))
    if (functionDirectoryIndex !== -1) {
      const functionDirectory = pathParts.slice(0, functionDirectoryIndex + 1).join('/')
      byFunctionBundle.set(functionDirectory, (byFunctionBundle.get(functionDirectory) ?? 0) + file.bytes)
    }
  }

  console.log(`\nVercel output: ${path.relative(process.cwd(), absoluteDirectory) || '.'}`)
  console.log(`  ${files.length} files, ${formatBytes(totalBytes)} total`)
  printBreakdown(
    'Largest artifacts (review these first when deployment storage grows):',
    [...relativeFiles]
      .sort((left, right) => right.bytes - left.bytes)
      .slice(0, 15)
      .map((file) => ({ name: file.relativePath, bytes: file.bytes })),
  )
  printBreakdown(
    'Size by output directory:',
    [...byTopLevelDirectory]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((left, right) => right.bytes - left.bytes),
  )
  printBreakdown(
    'Vercel Function bundles:',
    [...byFunctionBundle]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((left, right) => right.bytes - left.bytes),
  )
  return true
}

const analyzedDirectories = new Set()
let foundOutput = false
for (const directory of outputDirectories) {
  const resolvedDirectory = path.resolve(directory)
  if (analyzedDirectories.has(resolvedDirectory)) continue
  analyzedDirectories.add(resolvedDirectory)
  foundOutput = (await analyzeOutput(directory)) || foundOutput
}

if (!foundOutput) {
  console.log('No Vercel build output found. Run "npm run build" first, or set VERCEL_OUTPUT_DIR for a custom output directory.')
}
