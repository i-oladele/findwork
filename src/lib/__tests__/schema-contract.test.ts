import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * database.types.ts is hand-written, so a typo can sit in both the types and
 * the code and still compile. These tests read what the app actually asks
 * for — `.from('table')` and `.rpc('fn', { p_arg })` — and check it against
 * what the migrations create, which is the thing that will be deployed.
 */
const root = process.cwd()
const migrationsDir = join(root, 'supabase/migrations')
const srcDir = join(root, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : []
  })
}

const appCode = sourceFiles(srcDir)
  .filter((f) => !f.includes('__tests__'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')

/** Tables that exist at the end of the migration history. */
const liveTables = (() => {
  const created = new Set([...migrations.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1]))
  for (const m of migrations.matchAll(/drop table public\.([a-z_]+)/g)) created.delete(m[1])
  return created
})()

/** Function name → every parameter name any version of it declares. */
const liveFunctions = (() => {
  const functions = new Map<string, Set<string>>()
  for (const m of migrations.matchAll(/create (?:or replace )?function public\.([a-z_]+)\s*\(([^)]*)\)/g)) {
    const args = new Set([...m[2].matchAll(/\b(p_[a-z_]+)\b/g)].map((a) => a[1]))
    const existing = functions.get(m[1])
    if (existing) for (const a of args) existing.add(a)
    else functions.set(m[1], args)
  }
  for (const m of migrations.matchAll(/drop function public\.([a-z_]+)\s*\(([^)]*)\)/g)) {
    // Only a signature-less drop removes the function outright; the migrations
    // also drop one overload while creating another with the same name.
    if (!m[2].trim()) functions.delete(m[1])
  }
  return functions
})()

const usedTables = [...new Set([...appCode.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))].sort()
const usedRpcs = [...appCode.matchAll(/\.rpc\('([a-z_]+)'(?:,\s*\{([^}]*)\})?/gs)].map((m) => ({
  name: m[1],
  args: [...new Set([...(m[2] ?? '').matchAll(/(p_[a-z_]+)\s*:/g)].map((a) => a[1]))],
}))

describe('the app only uses tables the migrations create', () => {
  it.each(usedTables)('%s exists', (table) => {
    expect(liveTables.has(table)).toBe(true)
  })
})

describe('the app only calls functions the migrations define', () => {
  const byName = [...new Map(usedRpcs.map((r) => [r.name + r.args.join(), r])).values()]

  it.each(byName.map((r) => [r.name, r.args] as const))('%s(%s)', (name, args) => {
    const declared = liveFunctions.get(name)
    expect(declared, `${name} is not defined by any migration`).toBeDefined()
    for (const arg of args) {
      expect(declared!.has(arg), `${name} has no parameter ${arg}`).toBe(true)
    }
  })
})

describe('dropped objects stay dropped', () => {
  it('nothing still calls the removed provider_requests table or its RPC', () => {
    expect(usedTables).not.toContain('provider_requests')
    expect(usedRpcs.map((r) => r.name)).not.toContain('respond_to_request')
  })

  it('nothing still calls add_money, which minted balance with no payment', () => {
    expect(usedRpcs.map((r) => r.name)).not.toContain('add_money')
  })
})
