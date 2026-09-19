import type { ReactNode } from 'react'
import type { useCollectionList } from '../hooks/useCollectionList'
import { CollectionCard } from './CollectionCard'
import { ErrorMessage, SkeletonGrid, Spinner } from './Feedback'

interface CollectionSectionProps {
  title: string
  list: ReturnType<typeof useCollectionList>
  /** Shown once the list has loaded with nothing in it */
  empty: ReactNode
}

/** A titled grid of collections with a "Load more" button */
export function CollectionSection({ title, list, empty }: CollectionSectionProps) {
  const { collections, total, loading, error, hasMore, loadMore } = list
  const firstLoad = loading && collections.length === 0

  return (
    <section className="stack">
      <h2 className="section-title">
        {title} {total !== null && <span className="count">{total}</span>}
      </h2>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {firstLoad && <SkeletonGrid count={4} />}

      {!loading && !error && collections.length === 0 && empty}

      {collections.length > 0 && (
        <ul className="card-grid">
          {collections.map(collection => (
            <li key={collection.id}>
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="center">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loading}>
            {loading && <Spinner />}
            {loading ? 'Loading' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  )
}
