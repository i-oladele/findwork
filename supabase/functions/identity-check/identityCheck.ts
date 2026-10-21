/**
 * Checks one ID or business submission against the national registers and
 * records each answer. Kept free of Deno imports so it can be unit-tested
 * from Vitest; the Dojah calls and the database are passed in.
 *
 * The rules are deliberately strict about what counts as a match, because a
 * match verifies the account with nobody looking. Anything uncertain is
 * recorded as such and left for staff.
 */

export type DojahAnswer = { found: true; entity: Record<string, unknown> } | { found: false; message: string }

export type DojahApi = {
  ninLookup(nin: string): Promise<DojahAnswer>
  ninSelfie(nin: string, selfieBase64: string): Promise<DojahAnswer>
  bvnSelfie(bvn: string, selfieBase64: string): Promise<DojahAnswer>
  phoneLookup(localPhone: string): Promise<DojahAnswer>
  cacLookup(rcDigits: string, companyType: string): Promise<DojahAnswer>
}

export type Outcome = 'match' | 'mismatch' | 'not_found' | 'error'
export type Kind = 'nin' | 'bvn' | 'cac' | 'face' | 'sim'
export type Recorded = { kind: Kind; outcome: Outcome; confidence: number | null; detail: Record<string, unknown> }

/** Upper case, letters only, single spaces: "Adébáyọ̀  O'Neil" → "ADEBAYO ONEIL". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s-]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokens = (...parts: (string | null | undefined)[]) =>
  parts.flatMap((p) => normalizeName(p ?? '').split(' ')).filter((t) => t.length > 1)

/**
 * Whether the person's own first and last names both appear among the
 * register's names, in any order (Nigerian records put the surname first or
 * last). 'unknown' when there is not enough of a name to compare.
 */
export function namesMatch(register: string[], person: { first_name?: string | null; last_name?: string | null; full_name?: string | null }): 'match' | 'mismatch' | 'unknown' {
  const held = new Set(tokens(...register))
  let first = tokens(person.first_name)
  let last = tokens(person.last_name)
  if (!first.length || !last.length) {
    const all = tokens(person.full_name)
    if (all.length < 2) return 'unknown'
    first = [all[0]]
    last = [all[all.length - 1]]
  }
  if (!held.size) return 'unknown'
  return first.some((t) => held.has(t)) && last.some((t) => held.has(t)) ? 'match' : 'mismatch'
}

/** The register's names from whichever shape the answer came in. */
export function registerNames(entity: Record<string, unknown>): string[] {
  const pick = (...keys: string[]) => keys.map((k) => entity[k]).find((v) => typeof v === 'string' && v.trim()) as string | undefined
  return [pick('first_name', 'firstname'), pick('middle_name', 'middlename'), pick('last_name', 'surname', 'lastname')].filter((n): n is string => Boolean(n))
}

/** CAC company_type from the registration number's prefix. */
export function companyType(rc: string): string {
  const upper = rc.toUpperCase()
  if (upper.startsWith('BN')) return 'BUSINESS_NAME'
  if (upper.startsWith('IT')) return 'INCORPORATED_TRUSTEES'
  if (upper.startsWith('LLP')) return 'LIMITED_LIABILITY_PARTNERSHIP'
  if (upper.startsWith('LP')) return 'LIMITED_PARTNERSHIP'
  return 'COMPANY'
}

const SUFFIXES = /\b(LIMITED|LTD|PLC|NIGERIA|NIG|COMPANY|CO|ENTERPRISES?|VENTURES?|GLOBAL|INTERNATIONAL|INTL|AND|THE)\b/g

/** Two company names are the same business once the usual suffixes are set aside. */
export function companyNamesMatch(register: string, given: string): boolean {
  const core = (n: string) => normalizeName(n.replace(/&/g, ' AND ')).replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim()
  const a = core(register)
  const b = core(given)
  return a.length > 1 && a === b
}

/** "+2348031234567" → "08031234567"; null for numbers outside Nigeria. */
export function localPhone(e164: string | null | undefined): string | null {
  const digits = (e164 ?? '').replace(/\D/g, '')
  if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`
  if (digits.startsWith('0') && digits.length === 11) return digits
  return null
}

function faceResult(entity: Record<string, unknown>): Recorded {
  const v = (entity.selfie_verification ?? {}) as { confidence_value?: unknown; match?: unknown }
  const confidence = typeof v.confidence_value === 'number' ? Math.round(v.confidence_value * 100) / 100 : null
  if (typeof v.match !== 'boolean') return { kind: 'face', outcome: 'error', confidence, detail: { reason: 'no face comparison returned' } }
  return { kind: 'face', outcome: v.match ? 'match' : 'mismatch', confidence, detail: {} }
}

function nameResult(kind: Kind, answer: DojahAnswer, person: Parameters<typeof namesMatch>[1]): Recorded {
  if (!answer.found) return { kind, outcome: 'not_found', confidence: null, detail: { message: answer.message } }
  const names = registerNames(answer.entity)
  const match = namesMatch(names, person)
  return {
    kind,
    outcome: match === 'unknown' ? 'error' : match,
    confidence: null,
    detail: { registry_name: names.join(' '), ...(match === 'unknown' ? { reason: 'not enough of a name to compare' } : {}) },
  }
}

const failed = (kind: Kind, err: unknown): Recorded => ({ kind, outcome: 'error', confidence: null, detail: { message: (err as Error).message } })

export type PersonSubject = {
  id_type: string; id_number: string; first_name: string | null; last_name: string | null; full_name: string | null; phone: string | null
}

/**
 * An ID: the number against the register (with the person's name), the
 * selfie against the register's photo, and the phone number against the
 * register's name for that ID.
 */
export async function checkPerson(subject: PersonSubject, api: DojahApi, selfie: () => Promise<string>): Promise<Recorded[]> {
  if (subject.id_type !== 'nin' && subject.id_type !== 'bvn') return []
  const results: Recorded[] = []
  let names: string[] = []
  let image: string
  try {
    image = await selfie()
  } catch (err) {
    return [failed(subject.id_type, err)]
  }

  if (subject.id_type === 'nin') {
    try {
      const answer = await api.ninLookup(subject.id_number)
      results.push(nameResult('nin', answer, subject))
      if (answer.found) names = registerNames(answer.entity)
    } catch (err) { results.push(failed('nin', err)) }
    if (names.length) {
      try {
        const answer = await api.ninSelfie(subject.id_number, image)
        results.push(answer.found ? faceResult(answer.entity) : { kind: 'face', outcome: 'error', confidence: null, detail: { message: answer.message } })
      } catch (err) { results.push(failed('face', err)) }
    }
  } else {
    // One call answers both: the BVN's record and the face comparison.
    try {
      const answer = await api.bvnSelfie(subject.id_number, image)
      results.push(nameResult('bvn', answer, subject))
      if (answer.found) {
        names = registerNames(answer.entity)
        results.push(faceResult(answer.entity))
      }
    } catch (err) { results.push(failed('bvn', err)) }
  }

  const phone = localPhone(subject.phone)
  if (phone && names.length) {
    try {
      const answer = await api.phoneLookup(phone)
      if (!answer.found) {
        results.push({ kind: 'sim', outcome: 'not_found', confidence: null, detail: { message: answer.message } })
      } else {
        // The SIM's registered owner, compared with the ID's owner on the register.
        const [first, ...rest] = names
        const match = namesMatch(registerNames(answer.entity), { first_name: first, last_name: rest[rest.length - 1] ?? '' })
        results.push({ kind: 'sim', outcome: match === 'unknown' ? 'error' : match, confidence: null, detail: {} })
      }
    } catch (err) { results.push(failed('sim', err)) }
  }
  return results
}

/** A business: registered, active, and under the name given. */
export async function checkBusiness(subject: { rc_number: string; business_name: string }, api: DojahApi): Promise<Recorded[]> {
  try {
    const answer = await api.cacLookup(subject.rc_number.replace(/^[A-Z]+/i, ''), companyType(subject.rc_number))
    if (!answer.found) return [{ kind: 'cac', outcome: 'not_found', confidence: null, detail: { message: answer.message } }]
    const name = String(answer.entity.company_name ?? '')
    const status = String(answer.entity.status ?? '').toUpperCase()
    const active = status === '' || status === 'ACTIVE'
    return [{
      kind: 'cac',
      outcome: companyNamesMatch(name, subject.business_name) && active ? 'match' : 'mismatch',
      confidence: null,
      detail: { registry_name: name, ...(status ? { status } : {}) },
    }]
  } catch (err) {
    return [failed('cac', err)]
  }
}
