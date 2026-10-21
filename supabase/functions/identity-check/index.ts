// Checks an ID or business submission against the national registers
// through Dojah, records each answer, and verifies the account on the spot
// when every required check matches (complete_identity_review). Otherwise
// the submission stays with staff, with the answers beside it.
//
// Called by the app right after a submission ({ verification_id } or
// { business_verification_id }), once per submission; verification staff
// can run it again. Without the Dojah secrets it answers not_configured and
// review stays by hand.
//
// Secrets: DOJAH_APP_ID, DOJAH_SECRET_KEY, DOJAH_BASE_URL (sandbox while testing)
// Deploy:  supabase functions deploy identity-check
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { adminClient, callerFrom, cors, json, requireEnv } from '../_shared/http.ts'
import { dojah, dojahConfigured } from '../_shared/dojah.ts'
import { checkBusiness, checkPerson, type PersonSubject } from './identityCheck.ts'

type Subject = { profile_id: string; status: string; checked: boolean } & Partial<PersonSubject> & { selfie_path?: string; rc_number?: string; business_name?: string }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)
  if (!dojahConfigured()) return json({ error: 'not_configured' }, 503)

  const body = (await req.json().catch(() => ({}))) as { verification_id?: unknown; business_verification_id?: unknown }
  const subjectType = typeof body.business_verification_id === 'string' ? 'business_verification' : 'verification'
  const subjectId = subjectType === 'verification' ? body.verification_id : body.business_verification_id
  if (typeof subjectId !== 'string') return json({ error: 'verification id required' }, 400)

  const admin = adminClient()
  const { data, error } = await admin.rpc('identity_check_subject', { p_subject_type: subjectType, p_subject_id: subjectId })
  if (error) return json({ error: error.message }, 500)
  const subject = data as Subject | null

  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  })
  const { data: isStaff } = await caller.rpc('staff_can', { p_area: 'verification' })
  if (!subject || (subject.profile_id !== user.id && !isStaff)) return json({ error: 'not found' }, 404)
  if (subject.status !== 'pending') return json({ status: subject.status })
  // Each lookup is paid for: the owner gets one run per submission.
  if (subject.checked && !isStaff) return json({ status: 'referred' })

  const results = subjectType === 'verification'
    ? await checkPerson(subject as PersonSubject, dojah, async () => {
      const { data: file, error: fileError } = await admin.storage.from('verification-documents').download(subject.selfie_path!)
      if (fileError || !file) throw new Error('selfie could not be read')
      return encodeBase64(new Uint8Array(await file.arrayBuffer()))
    })
    : await checkBusiness({ rc_number: subject.rc_number!, business_name: subject.business_name! }, dojah)

  for (const r of results) {
    const { error: recordError } = await admin.rpc('record_identity_check', {
      p_subject_type: subjectType, p_subject_id: subjectId, p_kind: r.kind, p_outcome: r.outcome, p_confidence: r.confidence, p_detail: r.detail,
    })
    if (recordError) return json({ error: recordError.message }, 500)
  }
  const { data: status, error: reviewError } = await admin.rpc('complete_identity_review', { p_subject_type: subjectType, p_subject_id: subjectId })
  if (reviewError) return json({ error: reviewError.message }, 500)
  return json({ status, checks: results.map((r) => ({ kind: r.kind, outcome: r.outcome })) })
})
