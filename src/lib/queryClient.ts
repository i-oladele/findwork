import { QueryClient } from '@tanstack/react-query'

/**
 * Defaults tuned for a Nigerian mobile network: retry transient failures a
 * couple of times, but never retry a 4xx (an RLS denial or a bad argument
 * will fail identically every time), and keep data fresh enough that a user
 * switching tabs does not re-fetch the world.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
    mutations: { retry: 0 },
  },
})
