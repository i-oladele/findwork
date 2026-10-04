// Delivers one in-app notification as a Web Push to every device its owner
// has turned push on for. Called by the database (private.request_push)
// through pg_net, not by a user, so it is deployed with JWT verification off
// (see config.toml) and refuses anything without the shared secret.
//
// One-off setup:
//   npx web-push generate-vapid-keys
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com PUSH_HOOK_SECRET=...
//   supabase functions deploy send-push --no-verify-jwt
//   VITE_VAPID_PUBLIC_KEY=<the same public key> in the app's environment
//   and the two rows in private.settings described in the push migration.
//
// Deno runtime. Not part of the Vite build (tsconfig.app.json covers src/ only).
import webpush from 'npm:web-push@3.6.7'
import { adminClient, json } from '../_shared/http.ts'
import { sendPush } from './pushPayload.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) {
    console.error('send-push is not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY')
    return json({ error: 'not configured' }, 500)
  }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@findwork.africa', publicKey, privateKey)

  const body = await req.json().catch(() => ({}))
  const admin = adminClient()
  return sendPush(req.headers.get('x-push-secret'), (body as { notification_id?: unknown }).notification_id, {
    expectedSecret: Deno.env.get('PUSH_HOOK_SECRET'),
    targets: (id) => admin.rpc('push_targets', { p_notification_id: id }),
    send: async (subscription, payload) => {
      try {
        const res = await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 900, urgency: 'high' },
        )
        return res.statusCode
      } catch (err) {
        return (err as { statusCode?: number }).statusCode ?? 0
      }
    },
    delivered: (sent, gone) => admin.rpc('push_delivered', { p_endpoints: sent, p_gone: gone }),
  })
})
