import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { getSharedCollection, joinSharedCollection } from '../api/collections'
import type { CollectionWithImages } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { ImageGrid } from '../components/ImageGrid'
import { errorMessage } from '../lib/errors'

/**
 * A collection opened through its share link at /shared/:shareId. Anyone can view it; a logged-in
 * user can join it, which adds it to their collections.
 */
export function SharedCollectionPage() {
  const { shareId = '' } = useParams()
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collection, setCollection] = useState<CollectionWithImages | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  // Wait for the session to be restored, so the response includes the user's own access
  useEffect(() => {
    if (!ready) {
      return
    }
    let cancelled = false
    getSharedCollection(shareId, { limit: 100 })
      .then(found => !cancelled && setCollection(found))
      .catch(err => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [shareId, ready, user?.id])

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!collection) {
    return <p>Loading…</p>
  }

  const handleJoin = async () => {
    setJoining(true)
    try {
      const joined = await joinSharedCollection(shareId)
      navigate(`/collections/${joined.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setJoining(false)
    }
  }

  return (
    <section className="stack">
      <header className="stack">
        <h1>{collection.name}</h1>
        {collection.description && <p>{collection.description}</p>}
        <small>
          Shared by {collection.owner.username} · {collection.imageCount}{' '}
          {collection.imageCount === 1 ? 'image' : 'images'}
        </small>
      </header>

      <div className="row">
        {!user && (
          <Link to="/login" state={{ from: location }}>
            Log in to join this collection
          </Link>
        )}
        {user && collection.permission && (
          <Link to={`/collections/${collection.id}`}>Open in my collections</Link>
        )}
        {user && !collection.permission && (
          <button type="button" onClick={handleJoin} disabled={joining}>
            Join as {collection.linkAccess === 'edit' ? 'an editor' : 'a viewer'}
          </button>
        )}
      </div>

      <ImageGrid collectionId={collection.id} images={collection.images} canEdit={false} />
    </section>
  )
}
