import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = resolve(root, 'docs/requirements/prd-completion.md')
const audit = JSON.parse(readFileSync(resolve(root, 'docs/requirements/prd-status.json'), 'utf8'))
const source = readFileSync(resolve(root, audit.source), 'utf8')
const extracted = [...source.matchAll(/Feature: ([^\n]+)\n([\s\S]*?)(?=\nFeature:|\nConclusion:|$)/g)]
const fail = (message) => { throw new Error(message) }
if (extracted.length !== audit.features.length) fail('Every PRD feature must appear in the checklist.')
const counts = { implemented: 0, partial: 0, missing: 0, verified: 0 }
const rows = []

function bullets(text) {
  return text.split(/\n\d+\s*[A-Z]/)[0].split('●').slice(1)
    .map((s) => s.trim().replace(/\s+/g, ' ').replaceAll('V oice', 'Voice'))
}
const escape = (s) => s.replaceAll('|', '\\|').replaceAll('\n', ' ')
const link = (path) => `[${path}](../../${path})`
for (const [index, feature] of audit.features.entries()) {
  const match = extracted[index]
  if (feature.id !== `F${String(index + 1).padStart(2, '0')}` || feature.name !== match[1]) fail(`Feature mismatch at ${index + 1}`)
  const body = match[2].replace(/## Page \d+\n/g, '').split('Components\n')[1].split('Integration\n')
  if (!feature.acceptance || !feature.remaining || !feature.verification || !feature.evidence.length) fail(`Incomplete review: ${feature.id}`)
  for (const path of feature.evidence) if (!existsSync(resolve(root, path))) fail(`Missing evidence file: ${path}`)
  const sectionRows = []
  for (const [kind, requirements] of [['components', bullets(body[0])], ['integrations', bullets(body[1])]]) {
    const reviewed = feature[kind]
    if (requirements.length !== reviewed.length) fail(`${feature.id}: missing ${kind}`)
    for (const [i, requirement] of reviewed.entries()) {
      if (requirement.requirement !== requirements[i]) fail(`${feature.id}: PRD wording/order changed`)
      if (!(requirement.status in counts)) fail(`${feature.id}: unknown status`)
      if (requirement.status === 'verified' && !requirement.acceptance_evidence) fail(`${feature.id}: verified requires recorded acceptance evidence`)
      counts[requirement.status]++
      sectionRows.push(`| ${feature.id}-${kind === 'components' ? 'C' : 'I'}${String(i + 1).padStart(2, '0')} | ${escape(requirement.requirement)} | ${requirement.status} |`)
    }
  }
  rows.push(`## ${feature.id} · ${feature.name}\n\nPRD feature begins on page ${feature.page}.\n\n| ID | Requirement | Status |\n|---|---|---|\n${sectionRows.join('\n')}\n\nEvidence / relevant current code: ${feature.evidence.map(link).join(', ')}.\n\nRemaining: ${feature.remaining}\n\nAcceptance: ${feature.acceptance}\n\nVerification: ${feature.verification}`)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)
const report = `# FindWork PRD completion checklist

Reviewed ${audit.reviewed_at} against the original 20-page [functionality document](functionality.pdf), its [text extraction](functionality.md), and the [delivery roadmap](roadmap.md). Baseline commit: \`${audit.baseline_commit}\`, plus the current working-tree implementation. This is a completion ledger, not a claim that the product is finished.

## Completion standard

- **implemented**: a source-code path exists; deployed behavior is not yet signed off.
- **partial**: part of the named requirement exists; the remaining work is described below.
- **missing**: no complete implementation was found for this requirement in its PRD context.
- **verified**: implementation plus recorded acceptance evidence, including authorization and failure cases. A screen, table, mock, unit test or compiling build alone is insufficient.

There are **${audit.features.length} features and ${total} component/integration requirements**: ${counts.implemented} implemented, ${counts.partial} partial, ${counts.missing} missing, ${counts.verified} verified. These counts are not a completion percentage; requirements differ substantially in size. Repeated integrations retain separate IDs because each domain must actually integrate.

Each feature lists source evidence, remaining work and an acceptance scenario. The machine-readable source is [prd-status.json](prd-status.json). Run \`npm run prd:report\` after updating it; \`npm run prd:check\` checks every component and integration against the original wording and rejects an out-of-date report. This check verifies traceability, not functionality.

## Current constraints and decisions

- Keep React/Vite and Supabase, as previously approved; the roadmap's Next.js/DigitalOcean stack is superseded, not its functional requirements.
- No local Supabase stack. SQL checks run on plain Postgres 17, as CI does, and were last run on 4 October 2026. They have not been run against the hosted project, which holds demo data only.
- On 4 October 2026 the user asked for every PRD item to be built first, with testing and refinement to follow. Everything marked implemented below is source code that has passed unit tests and database checks on plain Postgres. The same day the migrations were applied to the hosted FindWork project and all nine Edge Functions were deployed; the new screens have not yet been used in a browser by a person.
- External accounts remain deferred. Features that depend on one are built up to that boundary and say so: identity registries, automatic bank payouts, a maps key for routed arrival times, and a streaming provider for live video. Push keys and the assistant's API key are set on the hosted project; the Paystack and Termii secrets are not, so card top-ups and SMS codes do not work there yet.
- Policy numbers chosen while building are first proposals to confirm: the trust score weights, the daily limits per verification tier, the rider's 80% share of the delivery fee, the risk-rule thresholds, and coupons being funded by whoever issues them.
- Preserve the historical September audits. Several of their missing-feature findings were completed by later commits; this checklist is the current status source.
- Legal documents and lesson content still need real approved material. Do not treat invented policies, empty lessons or fabricated verification as completion.

## What happens next

1. Done on 4 October 2026: migrations applied to the hosted project, Edge Functions deployed, API pre-request hook and scheduled jobs confirmed, push and assistant secrets set.
2. Set the Paystack and Termii secrets, and run the business-rule checks against the hosted database.
3. Walk each journey in a browser and on phones, as each kind of user: customer, provider, seller, rider, business buyer, staff role.
4. Confirm or change the policy numbers above, then tune the risk rules and matching against real activity.
5. Decide the deferred integrations, write the legal pages and the course content, and plan the native apps.

## Introduction and roadmap requirements beyond the component tables

The PRD introduction and conclusion also describe the following expectations. Roadmap phases add explicit delivery work; these remain in scope even when absent from the 239 bullets above.

| Requirement / roadmap phase | Current status and acceptance still required |
|---|---|
| Mobile app (PRD p.2), native delivery | Still a web app. It can now be added to a phone's Home Screen (web manifest) and can receive push once keys are set, but there are no native packages or store builds. Validate camera, biometrics, deep links, push, store assets and release pipelines. |
| Certifications and service packages (PRD introduction) | Packages and provider-supplied credential uploads implemented. Course certificates are issued on passing and can be verified by code without an account; the courses themselves still need writing. |
| Scale to millions (PRD conclusion) | Unverified aspiration. Define traffic/data targets, then load-test and document capacity, availability and recovery limits. |
| Phase 1: brand and UI/UX | UI system exists. Brand positioning/messaging/assets, prototype/design handoff, navigation, responsive/device and accessibility acceptance remain unverified. |
| Phase 2: infrastructure | Supabase migrations and GitHub CI exist. Environment isolation, app hosting/SSL, deployment pipelines, monitoring/logging, backups and restore drills remain unverified. |
| Phase 3: identity | F01–F03. Provider credentials do not replace authoritative identity checks. |
| Phase 4: services | F04–F06. Also validate discovery filters, recommendations and proposal lifecycle. |
| Phase 5: communication and social commerce | F07, F24–F25. In-app notifications do not satisfy push delivery. |
| Phase 6: commerce | F08–F11. Validate vendor store/dashboard, variants, inventory and fulfilment together. |
| Phase 7: money, trust and admin | F19–F21, F28–F32. Milestone escrow is built and reconciles in the database checks; premium features and renewal reminders require acceptance. |
| Phase 8: logistics and MVP QA | F22–F23 are built in source. Functional, regression, security, performance and launch testing have not started. |
| Phase 9: classifieds and safety | F14–F15. |
| Phase 10: wholesale and procurement | F12–F13. |
| Phase 11: learning | F26–F27, with certificate issuance, public verification, completion rules and profile badges built. Lesson content is still to be authored. |
| Phase 12: AI and automation | F16–F17 are fixed, explainable rules rather than models. F18 and the support, lesson and dispute helpers call Claude through one metered function, grounded in FindWork's own material with a hand-off to staff; commands, support answers and translation have answered live, lesson help and dispute summaries have not, and none has been evaluated. Predictive insight is a labelled trend line only. |
| Phase 13: security/disputes | F28–F30 plus audit history and security review. |
| Phase 14: admin/reporting | F31–F33 plus role-protected exports, complete revenue definitions and marketplace insights. |
| Phase 15: hardening and scale | Functional/regression/UX/security/performance QA, penetration testing, cache/database tuning, queues/retries, media processing, load tests, backup automation and disaster recovery remain unverified. |
| Launch content and policies | Privacy/terms still placeholders; authored learning content and operational support procedures still required. |

${rows.join('\n\n')}
`
if (process.argv.includes('--check')) {
  if (!existsSync(reportPath) || readFileSync(reportPath, 'utf8') !== report) fail('PRD report is stale. Run npm run prd:report.')
  console.log(`PRD traceability: ${audit.features.length} features, ${total} requirements; report is current.`)
} else {
  writeFileSync(reportPath, report)
  console.log(`Wrote ${relative(root, reportPath)} (${total} requirements).`)
}
