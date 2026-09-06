import { useMutation } from '@tanstack/react-query'
import { supabase } from '../supabase'

export type DeleteAccountError = { error: string; message?: string }

/**
 * Calls the delete-account Edge Function, which anonymises the profile and
 * removes the auth user. It refuses while the wallet still holds a balance or
 * escrow, so those cases surface as a message rather than a generic failure.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })

      if (error) {
        // A non-2xx from the function arrives as a FunctionsHttpError whose
        // body carries our own message; surface that rather than "failed".
        const body = (await (error as { context?: Response }).context
          ?.json()
          .catch(() => null)) as DeleteAccountError | null
        throw new Error(body?.message ?? error.message)
      }

      return data as { ok: true }
    },
  })
}
