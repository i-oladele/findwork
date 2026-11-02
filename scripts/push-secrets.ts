/**
 * Uploads the server keys kept in .env.local to the linked Supabase project,
 * and nothing else: not the VITE_ settings the app is built with, and not the
 * lines still waiting for a key.
 *
 *   npm run secrets:push                       every filled server key
 *   npm run secrets:push -- --dry-run          list them by name, upload nothing
 *   npm run secrets:push -- PAYSTACK_SECRET_KEY APP_URL    only these
 *
 * Values are never printed. The server functions read a new key on their next
 * request; there is nothing to redeploy. When PAYSTACK_HOOK_SECRET or
 * LIVEKIT_HOOK_SECRET is among them, the database is also told where the
 * functions it calls are (Paystack charge and payout; the live video meter)
 * and given the same secret, so the two match.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Every key the server functions read that a person supplies (Supabase sets its own SUPABASE_ ones). */
export const SERVER_KEYS = new Set([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'ASSISTANT_MODEL',
  'APP_URL', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_HOOK_SECRET',
  'DOJAH_APP_ID', 'DOJAH_SECRET_KEY', 'DOJAH_BASE_URL',
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_HOOK_SECRET',
  'GOOGLE_MAPS_API_KEY',
  'TERMII_API_KEY', 'TERMII_BASE_URL', 'TERMII_SENDER_ID', 'SEND_SMS_HOOK_SECRET', 'SMS_COUNTRIES',
  'FCM_PROJECT_ID', 'FCM_SERVICE_ACCOUNT_JSON',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_HOOK_SECRET',
])

/** A VITE_ name is built into the app and sent to every browser. */
const LOOKS_SECRET = /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN/
/** Keys made to be public, such as the browser-push public key the app needs. */
const MEANT_PUBLIC = /(PUBLIC_KEY|ANON_KEY)$/

export type ServerSecrets = {
  /** The NAME=value lines to upload, exactly as written. */
  lines: string[]
  names: string[]
  /** Server keys still empty. */
  empty: string[]
  /** Reasons to stop; they name keys and line numbers, never values. */
  problems: string[]
}

function isEmpty(value: string): boolean {
  const v = value.trim()
  return v === '' || v === "''" || v === '""' || v.startsWith('#')
}

export function serverSecrets(text: string, only: string[] = []): ServerSecrets {
  const out: ServerSecrets = { lines: [], names: [], empty: [], problems: [] }
  const seen = new Set<string>()
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match) {
      out.problems.push(`line ${i + 1} is not NAME=value`)
      return
    }
    const [, name, value] = match
    if (seen.has(name)) out.problems.push(`${name} appears more than once`)
    seen.add(name)
    if (name.startsWith('VITE_')) {
      if (!MEANT_PUBLIC.test(name) && (LOOKS_SECRET.test(name) || SERVER_KEYS.has(name.slice(5)))) {
        out.problems.push(`${name} would be built into the app and sent to browsers; remove the VITE_ prefix`)
      }
      return
    }
    if (name.startsWith('SUPABASE_')) {
      out.problems.push(`${name} is set by Supabase itself; remove it`)
      return
    }
    if (!SERVER_KEYS.has(name)) {
      out.problems.push(`${name} is not a key the server functions read; check the spelling`)
      return
    }
    if (only.length > 0 && !only.includes(name)) return
    if (isEmpty(value)) {
      out.empty.push(name)
      return
    }
    out.lines.push(line.replace(/^export\s+/, ''))
    out.names.push(name)
  })
  for (const name of only) if (!seen.has(name)) out.problems.push(`${name} is not in .env.local`)
  return out
}

/** The value of a NAME=value line, without surrounding quotes. */
export function valueOf(line: string): string {
  const v = line.slice(line.indexOf('=') + 1).trim()
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v
}

/**
 * The database rows that tell it where the Paystack charge and payout
 * functions are, and the secret it signs those requests with. The secret
 * must be the same as the PAYSTACK_HOOK_SECRET the functions check.
 */
export function paystackSettingsSql(projectRef: string, hookSecret: string): string {
  return settingsSql(projectRef, [
    ['paystack_charge_url', 'paystack-charge'],
    ['paystack_payout_url', 'paystack-payout'],
  ], ['paystack_hook_secret', hookSecret])
}

/** Where the database sends the live video meter its once-a-minute call, and the secret it signs it with. */
export function livekitSettingsSql(projectRef: string, hookSecret: string): string {
  return settingsSql(projectRef, [['livekit_tick_url', 'livekit-meter']], ['livekit_hook_secret', hookSecret])
}

function settingsSql(projectRef: string, functions: [string, string][], secret: [string, string]): string {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('not a Supabase project ref')
  const q = (v: string) => `'${v.replaceAll("'", "''")}'`
  const base = `https://${projectRef}.supabase.co/functions/v1`
  const rows = [...functions.map(([key, fn]) => `(${q(key)}, ${q(`${base}/${fn}`)})`), `(${q(secret[0])}, ${q(secret[1])})`]
  return `insert into private.settings(key, value) values
  ${rows.join(',\n  ')}
on conflict (key) do update set value = excluded.value;
`
}

function main(argv: string[]): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const dryRun = argv.includes('--dry-run')
  const only = argv.filter((a) => !a.startsWith('--'))
  let text: string
  try {
    text = readFileSync(join(root, '.env.local'), 'utf8')
  } catch {
    console.error('There is no .env.local in the project folder.')
    return 1
  }
  const found = serverSecrets(text, only)
  if (found.problems.length > 0) {
    console.error('Nothing uploaded. Fix these in .env.local first:')
    for (const p of found.problems) console.error(`  - ${p}`)
    return 1
  }
  if (found.empty.length > 0) console.log(`Still empty, left alone: ${found.empty.join(', ')}`)
  if (found.names.length === 0) {
    console.log('No filled server keys to upload.')
    return 0
  }
  console.log(`${dryRun ? 'Would upload' : 'Uploading'} ${found.names.length}: ${found.names.join(', ')}`)
  if (dryRun) return 0

  const dir = mkdtempSync(join(tmpdir(), 'findwork-secrets-'))
  try {
    const file = join(dir, 'secrets.env')
    writeFileSync(file, `${found.lines.join('\n')}\n`, { mode: 0o600 })
    const run = spawnSync('supabase', ['secrets', 'set', '--env-file', file], { cwd: root, stdio: 'inherit' })
    if (run.error) {
      console.error(`Could not run the Supabase CLI: ${run.error.message}`)
      return 1
    }
    if (run.status !== 0) return run.status ?? 1
    console.log('Uploaded. The server functions use them from their next request.')

    const hooks = [
      { name: 'PAYSTACK_HOOK_SECRET', label: 'Paystack', sql: paystackSettingsSql },
      { name: 'LIVEKIT_HOOK_SECRET', label: 'live video meter', sql: livekitSettingsSql },
    ].flatMap((h) => {
      const line = found.lines.find((l) => l.startsWith(`${h.name}=`))
      return line ? [{ ...h, secret: valueOf(line) }] : []
    })
    if (hooks.length > 0) {
      let ref = ''
      try { ref = readFileSync(join(root, 'supabase/.temp/project-ref'), 'utf8').trim() } catch { /* not linked */ }
      if (!ref) {
        console.error('The project is not linked (supabase link), so the database settings were not saved.')
        return 1
      }
      for (const hook of hooks) {
        const sql = join(dir, `${hook.name.toLowerCase()}.sql`)
        writeFileSync(sql, hook.sql(ref, hook.secret), { mode: 0o600 })
        const saved = spawnSync('supabase', ['db', 'query', '--linked', '--file', sql], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
        if (saved.error || saved.status !== 0) {
          console.error(`The keys are uploaded, but saving the ${hook.label} settings in the database failed; run this again.`)
          return saved.status ?? 1
        }
        console.log(`Saved the ${hook.label} settings in the database (where to call, and the shared secret).`)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
