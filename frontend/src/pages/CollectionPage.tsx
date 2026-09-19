import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getCollection, listImages } from '../api/collections'
import type { Collection, CollectionImage, Permission } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { CollectionActions } from '../components/CollectionActions'
import { CollectionDetailsForm } from '../components/CollectionDetailsForm'
import { EmptyState, ErrorMessage, Loading, Spinner } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { ImageGrid } from '../components/ImageGrid'
import { ImageSearch } from '../components/ImageSearch'
import { MembersPanel } from '../components/MembersPanel'
import { SharePanel } from '../components/SharePanel'
import { errorMessage } from '../lib/errors'
import { hasPermission } from '../lib/permissions'

const PAGE_SIZE = 20

const ACCESS_LABELS: Record<Permission, string> = { view: 'Viewer', edit: 'Editor', own: 'Owner' }

/** One collection at /collections/:collectionId: its images, and (with access) tools to change it */
export function CollectionPage() {
  const { collectionId = '' } = useParams()
  // A new key per collection starts the view fresh when the URL moves to another collection
  return <CollectionView key={collectionId} collectionId={collectionId} />
}

function BackLink() {
  return (
    <Link to="/" className="back-link">
      <Icon name="arrowLeft" size={16} />
      Collections
    </Link>
  )
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

  if (!validId || (error && !collection)) {
    return (
      <div className="stack-lg">
        <BackLink />
        <EmptyState icon="alert" title="Collection unavailable">
          {validId ? error : 'That is not a valid collection address.'}
        </EmptyState>
      </div>
    )
  }
  if (!collection || !user) {
    return <Loading />
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
    <div className="stack-lg">
      <BackLink />

      <header className="page-header">
        <div className="titles">
          <h1>{collection.name}</h1>
          {collection.description && <p className="description">{collection.description}</p>}
          <div className="meta">
            {collection.permission && (
              <span className={isOwner ? 'badge badge-accent' : 'badge'}>{ACCESS_LABELS[collection.permission]}</span>
            )}
            {!isOwner && <span>Owned by {collection.owner.username}</span>}
            {!isOwner && <span className="dot-separator" />}
            <span>
              {collection.imageCount} {collection.imageCount === 1 ? 'image' : 'images'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          {canEdit && <CollectionDetailsForm collection={collection} onSaved={setCollection} />}
          <CollectionActions collection={collection} user={user} onDone={() => navigate('/')} />
        </div>
      </header>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="collection-layout">
        <div className="stack-lg">
          <section className="stack">
            <h2 className="section-title">
              Images <span className="count">{collection.imageCount}</span>
            </h2>
            {images.length === 0 ? (
              <EmptyState icon="image" title="No images yet">
                {canEdit
                  ? 'Search Pixabay below to start filling this collection.'
                  : 'Images added by the editors will show up here.'}
              </EmptyState>
            ) : (
              <ImageGrid
                collectionId={collection.id}
                images={images}
                canEdit={canEdit}
                onChanged={handleImageChanged}
                onRemoved={handleImageRemoved}
              />
            )}
            {hasMore && (
              <div className="center">
                <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <Spinner />}
                  {loadingMore ? 'Loading' : 'Load more'}
                </button>
              </div>
            )}
          </section>

          {canEdit && <ImageSearch collectionId={collection.id} onSaved={handleImageSaved} />}
        </div>

        <aside className="collection-sidebar">
          {isOwner && <SharePanel collection={collection} onChanged={setCollection} />}
          <MembersPanel collection={collection} />
        </aside>
      </div>
    </div>
  )
}
