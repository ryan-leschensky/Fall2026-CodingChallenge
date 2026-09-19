import { useEffect, useState } from 'react'
import { listCollections } from '../api/collections'
import type { Collection } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { CollectionCard } from '../components/CollectionCard'
import { CreateCollectionForm } from '../components/CreateCollectionForm'
import { EmptyState, ErrorMessage, SkeletonGrid, Spinner } from '../components/Feedback'
import { errorMessage } from '../lib/errors'

const PAGE_SIZE = 20

/** The user's collections (owned and shared with them), and a form to create one */
export function HomePage() {
  const { user } = useAuth()
  const [collections, setCollections] = useState<Collection[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Adds the next page of collections to the list */
  const loadPage = async (offset: number) => {
    setLoading(true)
    setError(null)
    try {
      const page = await listCollections({ limit: PAGE_SIZE, offset })
      setCollections(current => [...current, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // The first page
  useEffect(() => {
    let cancelled = false
    listCollections({ limit: PAGE_SIZE })
      .then(page => {
        if (!cancelled) {
          setCollections(page.items)
          setTotal(page.total)
        }
      })
      .catch(err => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreated = (collection: Collection) => {
    setCollections(current => [collection, ...current])
    setTotal(current => (current ?? 0) + 1)
  }

  const hasMore = total !== null && collections.length < total
  const firstLoad = loading && collections.length === 0

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="titles">
          {user && <span className="eyebrow">Welcome back, {user.username}</span>}
          <h1>My collections</h1>
          <p className="description">
            {total !== null && total > 0
              ? `${total} ${total === 1 ? 'collection' : 'collections'}, including ones shared with you.`
              : 'Your collections and the ones shared with you.'}
          </p>
        </div>
      </header>

      <CreateCollectionForm onCreated={handleCreated} />

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {firstLoad && <SkeletonGrid count={4} />}

      {!loading && !error && collections.length === 0 && (
        <EmptyState icon="images" title="No collections yet">
          Create your first collection above, then search for photos to fill it.
        </EmptyState>
      )}

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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => loadPage(collections.length)}
            disabled={loading}
          >
            {loading && <Spinner />}
            {loading ? 'Loading' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
