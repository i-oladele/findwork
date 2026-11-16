import { loadEnv } from 'vite'
import { readFileSync } from 'node:fs'

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
let failures = 0
const check = (name, valid) => {
  console.log(`${valid ? 'PASS' : 'FAIL'} ${name}`)
  if (!valid) failures++
}
let backend
try { backend = new URL(env.VITE_SUPABASE_URL) } catch { /* reported below */ }
check('Production Supabase URL uses HTTPS', backend?.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(backend?.hostname))
const key = env.VITE_SUPABASE_ANON_KEY || ''
let role
try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { /* publishable keys are not JWTs */ }
check('Client uses a public Supabase key', key.startsWith('sb_publishable_') || role === 'anon')
const legal = readFileSync('src/legal/documents.ts', 'utf8')
check('Legal documents approved', /export const DRAFT = false/.test(legal))
check('Legal placeholders completed', !/\[(?:FindWork|support email|registered address|DPO email|registration details|period|with \/|adequacy|the fees|number)/i.test(legal))
check('Public privacy and deletion routes exist', ['/legal/:doc', '/delete-account'].every(route => readFileSync('src/App.tsx', 'utf8').includes(`path="${route}"`)))
if (failures) console.error(`${failures} publishing checks require attention. Preview builds remain available with npm run build.`)
process.exitCode = failures ? 1 : 0
