/**
 * Kept free of imports so it can be unit-tested from Vitest.
 *
 * Browsers send a preflight before every call from the app, and refuse the
 * real request unless each header the Supabase SDK adds (apikey and
 * x-client-info, as well as authorization) is allowed here.
 */
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
