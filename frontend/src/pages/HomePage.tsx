import { useEffect, useState } from 'react'
import { listCollections } from '../api/collections'
import type { Collection } from '../api/types'
import { CollectionCard } from '../components/CollectionCard'
import { CreateCollectionForm } from '../components/CreateCollectionForm'
import { errorMessage } from '../lib/errors'

const PAGE_SIZE = 20

/** The user's collections (owned and shared with them), and a form to create one */
export function HomePage() {
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

  return (
    <section className="stack">
      <h1>My collections</h1>
      <CreateCollectionForm onCreated={handleCreated} />

      {error && <p className="error">{error}</p>}
      {!loading && !error && collections.length === 0 && <p>No collections yet. Create one above.</p>}

      <ul className="card-grid">
        {collections.map(collection => (
          <li key={collection.id}>
            <CollectionCard collection={collection} />
          </li>
        ))}
      </ul>

      {loading && <p>Loading…</p>}
      {hasMore && !loading && (
        <button type="button" onClick={() => loadPage(collections.length)}>
          Load more
        </button>
      )}
    </section>
  )
}
