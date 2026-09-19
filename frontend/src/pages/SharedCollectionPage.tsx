import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { getSharedCollection, joinSharedCollection } from '../api/collections'
import type { CollectionWithImages } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { EmptyState, ErrorMessage, Loading, Spinner } from '../components/Feedback'
import { Icon } from '../components/Icon'
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

  if (error && !collection) {
    return (
      <EmptyState icon="link" title="This link isn’t working">
        {error}
      </EmptyState>
    )
  }
  if (!collection) {
    return <Loading />
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
    <div className="stack-lg">
      <header className="page-header">
        <div className="titles">
          <span className="eyebrow">Shared collection</span>
          <h1>{collection.name}</h1>
          {collection.description && <p className="description">{collection.description}</p>}
          <div className="meta">
            <span className="avatar sm">{collection.owner.username.charAt(0)}</span>
            <span>Shared by {collection.owner.username}</span>
            <span className="dot-separator" />
            <span>
              {collection.imageCount} {collection.imageCount === 1 ? 'image' : 'images'}
            </span>
          </div>
        </div>

        <div className="header-actions">
          {!user && (
            <Link to="/login" state={{ from: location }} className="btn btn-primary">
              <Icon name="logIn" size={16} />
              Log in to join
            </Link>
          )}
          {user && collection.permission && (
            <Link to={`/collections/${collection.id}`} className="btn btn-secondary">
              Open in my collections
              <Icon name="chevronRight" size={16} />
            </Link>
          )}
          {user && !collection.permission && (
            <button type="button" className="btn btn-primary" onClick={handleJoin} disabled={joining}>
              {joining ? <Spinner /> : <Icon name="plus" size={16} strokeWidth={2.5} />}
              Join as {collection.linkAccess === 'edit' ? 'an editor' : 'a viewer'}
            </button>
          )}
        </div>
      </header>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {collection.images.length === 0 ? (
        <EmptyState icon="image" title="No images yet">
          This collection is empty for now.
        </EmptyState>
      ) : (
        <ImageGrid collectionId={collection.id} images={collection.images} canEdit={false} />
      )}
    </div>
  )
}
