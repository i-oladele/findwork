import type { ReactNode } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from './States'

type QueryLike<T> = {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => unknown
}

/**
 * The loading / error / empty / data switch every list screen needs. Renders
 * `children` only when there is data to show.
 */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  errorMessage = 'We could not load this.',
  skeletonRows = 3,
  children,
}: {
  query: QueryLike<T>
  isEmpty?: (data: T) => boolean
  empty?: { icon?: string; title: string; body?: string; action?: ReactNode }
  errorMessage?: string
  skeletonRows?: number
  children: (data: T) => ReactNode
}) {
  if (query.isLoading) return <ListSkeleton rows={skeletonRows} />
  if (query.isError) return <ErrorState message={errorMessage} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  const blank = isEmpty
    ? isEmpty(query.data)
    : query.data === null || (Array.isArray(query.data) && query.data.length === 0)
  if (blank && empty) return <EmptyState {...empty} />
  return <>{children(query.data)}</>
}
