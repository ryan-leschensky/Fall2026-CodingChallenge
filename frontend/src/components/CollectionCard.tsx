import { Link } from 'react-router'
import type { Collection } from '../api/types'
import { useAuth } from '../auth/auth-context'

/** A collection in a list, linking to its page */
export function CollectionCard({ collection }: { collection: Collection }) {
  const { user } = useAuth()
  const sharedBy = collection.owner.id === user?.id ? null : collection.owner.username

  return (
    <Link to={`/collections/${collection.id}`} className="card">
      {collection.coverUrl ? (
        <img src={collection.coverUrl} alt="" className="card-cover" loading="lazy" />
      ) : (
        <div className="card-cover placeholder">No images yet</div>
      )}
      <strong>{collection.name}</strong>
      <small>
        {collection.imageCount} {collection.imageCount === 1 ? 'image' : 'images'}
        {sharedBy && ` · shared by ${sharedBy}`}
      </small>
    </Link>
  )
}
