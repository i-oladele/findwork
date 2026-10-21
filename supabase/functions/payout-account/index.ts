// Confirms a bank account with Paystack before money is sent to it.
//
//   { action: 'banks' }                                  the banks to choose from
//   { action: 'resolve', bank_code, account_number }     the bank's name for the account
//   { action: 'save', bank_code, account_number }        confirm it and make it the payout account
//
// Saving asks the bank for the account's name again (never trusting one sent
// by the app), creates a Paystack transfer recipient, and stores both. Only
// a confirmed account is paid automatically. Without PAYSTACK_SECRET_KEY the
// function answers not_configured and the app lets people type their details
// in for staff to check, as before.
//
// Deploy: supabase functions deploy payout-account
import { adminClient, callerFrom, cors, json } from '../_shared/http.ts'
import { createTransferRecipient, listBanks, resolveAccount, type Bank } from '../_shared/paystack.ts'

let banks: { at: number; list: Bank[] } | null = null

async function activeBanks(): Promise<Bank[]> {
  // The list rarely changes; keep it for an hour per running instance.
  if (!banks || Date.now() - banks.at > 3_600_000) {
    const list = (await listBanks()).filter((b) => b.active)
    banks = { at: Date.now(), list }
  }
  return banks.list
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const user = await callerFrom(req)
  if (!user) return json({ error: 'invalid session' }, 401)
  if (!Deno.env.get('PAYSTACK_SECRET_KEY')) return json({ error: 'not_configured' }, 503)

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; bank_code?: unknown; account_number?: unknown }
  try {
    if (body.action === 'banks') {
      return json({ banks: (await activeBanks()).map((b) => ({ name: b.name, code: b.code })) })
    }
    const accountNumber = typeof body.account_number === 'string' ? body.account_number.trim() : ''
    const bankCode = typeof body.bank_code === 'string' ? body.bank_code.trim() : ''
    if (!/^[0-9]{10}$/.test(accountNumber)) return json({ error: 'invalid_account', message: 'An account number is 10 digits.' }, 400)
    const bank = (await activeBanks()).find((b) => b.code === bankCode)
    if (!bank) return json({ error: 'invalid_bank', message: 'Choose your bank from the list.' }, 400)

    let resolved
    try {
      resolved = await resolveAccount(accountNumber, bankCode)
    } catch {
      return json({ error: 'account_not_found', message: 'That bank has no account with that number. Check both and try again.' }, 400)
    }
    if (body.action === 'resolve') return json({ account_name: resolved.account_name })
    if (body.action !== 'save') return json({ error: 'invalid_action' }, 400)

    const admin = adminClient()
    const { data: profile } = await admin.from('profiles').select('deleted_at, suspended_at').eq('id', user.id).maybeSingle()
    if (!profile || profile.deleted_at || profile.suspended_at) return json({ error: 'account_suspended' }, 403)

    const recipient = await createTransferRecipient({ name: resolved.account_name, accountNumber, bankCode })
    const { error } = await admin.from('payout_accounts').upsert({
      profile_id: user.id, bank_name: bank.name, bank_code: bankCode, account_number: accountNumber,
      account_name: resolved.account_name, recipient_code: recipient.recipient_code,
      verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    if (error) return json({ error: error.message }, 500)
    return json({ bank_name: bank.name, account_name: resolved.account_name })
  } catch (err) {
    return json({ error: 'paystack_unavailable', message: (err as Error).message }, 502)
  }
})
