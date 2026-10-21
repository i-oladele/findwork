#!/usr/bin/env node
// Lists every sentence wrapped in t('...') in src/ and checks that each
// language catalog in src/locales has it, and nothing stale.
//
//   npm run i18n:check            fail if a catalog is missing a sentence or has a stale one
//   node scripts/i18n-check.mjs --missing yo   print the sentences Yoruba lacks, one per line
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LANGUAGES = ['pcm', 'yo', 'ig', 'ha']
const root = new URL('..', import.meta.url).pathname

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'locales' ? [] : files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

// t('...') or msg('...') with a single-quoted literal first argument. \' inside is unescaped.
const pattern = /\b(?:t|msg)\(\s*'((?:[^'\\]|\\.)*)'/g
// A line ending in // i18n marks every single-quoted string on it (lists kept as typed constants).
const marked = /^.*\/\/ i18n\s*$/gm
const quoted = /'((?:[^'\\]|\\.)*)'/g
const used = new Map()
const add = (raw, file) => {
  const text = raw.replace(/\\'/g, "'").replace(/\\n/g, '\n')
  if (!used.has(text)) used.set(text, file.replace(root, ''))
}
for (const file of files(join(root, 'src'))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(pattern)) add(match[1], file)
  for (const line of source.matchAll(marked)) for (const match of line[0].replace(/\/\/ i18n\s*$/, '').matchAll(quoted)) add(match[1], file)
}

const args = process.argv.slice(2)
if (args[0] === '--missing') {
  const catalog = JSON.parse(readFileSync(join(root, 'src/locales', `${args[1]}.json`), 'utf8'))
  for (const text of used.keys()) if (!(text in catalog)) console.log(JSON.stringify(text))
  process.exit(0)
}

let failed = false
console.log(`${used.size} sentences wrapped for translation`)
for (const language of LANGUAGES) {
  const catalog = JSON.parse(readFileSync(join(root, 'src/locales', `${language}.json`), 'utf8'))
  const missing = [...used.keys()].filter((text) => !(text in catalog) || !String(catalog[text]).trim())
  const stale = Object.keys(catalog).filter((text) => !used.has(text))
  const placeholders = [...used.keys()].filter((text) => text in catalog &&
    JSON.stringify((text.match(/\{\w+\}/g) ?? []).sort()) !== JSON.stringify((String(catalog[text]).match(/\{\w+\}/g) ?? []).sort()))
  console.log(`${language}: ${used.size - missing.length}/${used.size} translated${stale.length ? `, ${stale.length} stale` : ''}${placeholders.length ? `, ${placeholders.length} with wrong placeholders` : ''}`)
  for (const text of missing.slice(0, 5)) console.log(`  missing: ${JSON.stringify(text)} (${used.get(text)})`)
  for (const text of placeholders.slice(0, 5)) console.log(`  placeholders differ: ${JSON.stringify(text)}`)
  if (missing.length || stale.length || placeholders.length) failed = true
}
if (args.includes('--check') && failed) process.exit(1)
