import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getCollection, listImages } from '../api/collections'
import type { Collection, CollectionImage } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { CollectionDetailsForm } from '../components/CollectionDetailsForm'
import { CollectionActions } from '../components/CollectionActions'
import { ImageGrid } from '../components/ImageGrid'
import { ImageSearch } from '../components/ImageSearch'
import { MembersPanel } from '../components/MembersPanel'
import { SharePanel } from '../components/SharePanel'
import { errorMessage } from '../lib/errors'
import { hasPermission } from '../lib/permissions'

const PAGE_SIZE = 20

/** One collection at /collections/:collectionId: its images, and (with access) tools to change it */
export function CollectionPage() {
  const { collectionId = '' } = useParams()
  // A new key per collection starts the view fresh when the URL moves to another collection
  return <CollectionView key={collectionId} collectionId={collectionId} />
}

function CollectionView({ collectionId }: { collectionId: string }) {
  const id = Number(collectionId)
  const validId = Number.isInteger(id) && id > 0
  const { user } = useAuth()
  const navigate = useNavigate()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [images, setImages] = useState<CollectionImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!validId) {
      return
    }
    let cancelled = false
    getCollection(id, { limit: PAGE_SIZE })
      .then(({ images: firstPage, ...rest }) => {
        if (!cancelled) {
          setCollection(rest)
          setImages(firstPage)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? 'This collection does not exist, or you do not have access to it.'
              : errorMessage(err),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [id, validId])

  if (!validId) {
    return <p className="error">That is not a valid collection address.</p>
  }
  if (error && !collection) {
    return (
      <section className="stack">
        <p className="error">{error}</p>
        <Link to="/">Back to my collections</Link>
      </section>
    )
  }
  if (!collection || !user) {
    return <p>Loading…</p>
  }

  const canEdit = hasPermission(collection.permission, 'edit')
  const isOwner = hasPermission(collection.permission, 'own')
  const hasMore = images.length < collection.imageCount

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = await listImages(collection.id, { limit: PAGE_SIZE, offset: images.length })
      setImages(current => [...current, ...page.items])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const handleImageSaved = (image: CollectionImage) => {
    setImages(current => [image, ...current])
    setCollection({ ...collection, imageCount: collection.imageCount + 1 })
  }

  const handleImageChanged = (image: CollectionImage) => {
    setImages(current => current.map(existing => (existing.id === image.id ? image : existing)))
  }

  const handleImageRemoved = (imageId: number) => {
    setImages(current => current.filter(image => image.id !== imageId))
    setCollection({ ...collection, imageCount: collection.imageCount - 1 })
  }

  return (
    <section className="stack">
      <p>
        <Link to="/">← My collections</Link>
      </p>

      <header className="stack">
        <h1>{collection.name}</h1>
        {collection.description && <p>{collection.description}</p>}
        <small>
          Owned by {collection.owner.username} · your access: {collection.permission ?? 'none'} ·{' '}
          {collection.imageCount} {collection.imageCount === 1 ? 'image' : 'images'}
        </small>
      </header>

      {error && <p className="error">{error}</p>}

      {canEdit && <CollectionDetailsForm collection={collection} onSaved={setCollection} />}
      <CollectionActions collection={collection} user={user} onDone={() => navigate('/')} />

      <h2>Images</h2>
      {images.length === 0 && <p>No images yet.{canEdit && ' Search below to add some.'}</p>}
      <ImageGrid
        collectionId={collection.id}
        images={images}
        canEdit={canEdit}
        onChanged={handleImageChanged}
        onRemoved={handleImageRemoved}
      />
      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {canEdit && <ImageSearch collectionId={collection.id} onSaved={handleImageSaved} />}
      {isOwner && <SharePanel collection={collection} onChanged={setCollection} />}
      <MembersPanel collection={collection} />
    </section>
  )
}
