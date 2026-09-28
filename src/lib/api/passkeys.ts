import { useQuery } from '@tanstack/react-query'
import { keys } from './keys'
import { passkeysAvailable } from '../passkeys'

/** Whether this device and the project can do fingerprint sign-in. See lib/passkeys.ts. */
export function usePasskeysAvailable() {
  return useQuery({
    queryKey: keys.passkeys.available(),
    queryFn: passkeysAvailable,
    staleTime: Infinity,
    retry: false,
  })
}
