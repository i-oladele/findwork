// The FindWork assistant: voice and typed commands, support answers,
// message translation, lesson help and dispute case summaries. Each is one
// request to Claude; the API key must never reach the browser, so the call
// happens here.
//
//   supabase secrets set ANTHROPIC_API_KEY=...
//   supabase functions deploy assistant
//
// Without the key the function answers { configured: false } and the app
// hides or falls back for each feature. ASSISTANT_MODEL may be set to
// claude-sonnet-5-5 to trade some quality for cost; the default is
// claude-opus-5-5.
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { adminClient, cors, json, requireEnv } from '../_shared/http.ts'
import { buildRequest, InputError, readResult, TASKS, type Task } from './prompts.ts'

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'invalid session' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ configured: false })

  // Everything read for the request is read as the caller, so the database
  // decides what they may see.
  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return json({ error: 'invalid session' }, 401)

  const body = (await req.json().catch(() => ({}))) as { task?: unknown; input?: Record<string, unknown> }
  if (typeof body.task !== 'string' || !TASKS.includes(body.task as Task)) return json({ error: 'unknown task' }, 400)
  const task = body.task as Task
  const input = { ...(body.input ?? {}) }

  // The material for a lesson and the file for a dispute come from the
  // database, never from the request, so nobody can be answered from
  // material they cannot open.
  if (task === 'lesson') {
    const content = await caller.rpc('course_content', { p_course_id: String(input.course_id ?? '') })
    const lessons = ((content.data ?? []) as { title: string; body: string | null }[]).filter((l) => l.body)
    if (content.error || lessons.length === 0) return json({ error: 'Enrol on the course to ask about its lessons.' }, 403)
    input.material = lessons.map((l) => `LESSON: ${l.title}\n${l.body}`).join('\n\n')
  }
  if (task === 'dispute') {
    const file = await caller.rpc('dispute_case_file', { p_dispute_id: String(input.dispute_id ?? '') })
    if (file.error || !file.data) return json({ error: 'Only dispute staff can summarise a case.' }, 403)
    input.case_file = JSON.stringify(file.data, null, 2)
  }

  let request
  try {
    request = buildRequest(task, input)
  } catch (err) {
    if (err instanceof InputError) return json({ error: err.message }, 400)
    throw err
  }

  const allowed = await adminClient().rpc('assistant_allow', { p_profile_id: auth.user.id, p_task: task })
  if (allowed.error) return json({ error: 'The assistant is unavailable right now.' }, 500)
  if (!allowed.data) return json({ error: 'You have reached today\'s limit for the assistant. Try again tomorrow, or write to support.' }, 429)

  const configured = Deno.env.get('ASSISTANT_MODEL')
  const model = configured && MODELS.includes(configured) ? configured : 'claude-opus-5-5'
  const client = new Anthropic({ apiKey })
  try {
    // Thinking is always on for these models and is left at its default; how
    // hard the model works is set by effort.
    const response = await client.beta.messages.create({
      model,
      max_tokens: request.maxTokens,
      // If a safety classifier declines the request, the API retries it on
      // the model Anthropic recommends for that category.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: request.effort,
        ...(request.schema ? { format: { type: 'json_schema', schema: request.schema } } : {}),
      },
      // The instructions are the same for every request of a task, so they
      // are cached; what the person asked comes after.
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.user }],
    })

    if (response.stop_reason === 'refusal') return json({ configured: true, declined: true })
    if (response.stop_reason === 'max_tokens') return json({ error: 'That was too long to answer in one go. Ask a shorter question.' }, 422)
    const output = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
    return json({ configured: true, result: readResult(task, output) })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'The assistant is busy. Try again in a moment.' }, 429)
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('assistant: the ANTHROPIC_API_KEY secret was rejected')
      return json({ configured: false })
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`assistant: API error ${err.status}: ${err.message}`)
      return json({ error: 'The assistant is unavailable right now.' }, 502)
    }
    if (err instanceof SyntaxError) return json({ error: 'The assistant gave an answer we could not read. Try again.' }, 502)
    throw err
  }
})
