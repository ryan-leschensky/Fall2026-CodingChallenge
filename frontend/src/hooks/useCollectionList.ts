import { useCallback, useEffect, useState } from 'react'
import { listCollections } from '../api/collections'
import type { Collection, CollectionFilter } from '../api/types'
import { errorMessage } from '../lib/errors'

const PAGE_SIZE = 20

/** One of the user's collection lists, loaded a page at a time */
export function useCollectionList(filter: CollectionFilter) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The first page
  useEffect(() => {
    let cancelled = false
    listCollections({ filter, limit: PAGE_SIZE })
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
  }, [filter])

  /** Adds the next page to the list */
  const loadMore = async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await listCollections({ filter, limit: PAGE_SIZE, offset: collections.length })
      setCollections(current => [...current, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /** Puts a collection the user just created at the top, as the server would list it */
  const prepend = useCallback((collection: Collection) => {
    setCollections(current => [collection, ...current])
    setTotal(current => (current ?? 0) + 1)
  }, [])

  const hasMore = total !== null && collections.length < total

  return { collections, total, loading, error, hasMore, loadMore, prepend }
}
