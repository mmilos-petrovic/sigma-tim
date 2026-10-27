import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { explainError } from '../admin/errors'

export function Loading() {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      Učitavanje…
    </p>
  )
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <p>{explainError(error, 'load')}</p>
      <button type="button" className="button button--secondary" onClick={onRetry}>
        Pokušaj ponovo
      </button>
    </div>
  )
}

/** Shows a loading state, then either the error with a retry or the content. */
export function Loaded<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />
  return <>{children(query.data)}</>
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-header__actions">{children}</div>}
    </div>
  )
}

export function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="notice">
      {message}
    </p>
  ) : null
}
