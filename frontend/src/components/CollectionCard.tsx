import { Link } from 'react-router'
import type { Collection } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { Icon } from './Icon'

/** A collection in a list, linking to its page */
export function CollectionCard({ collection }: { collection: Collection }) {
  const { user } = useAuth()
  const sharedBy = collection.owner.id === user?.id ? null : collection.owner.username

  const sharedBadge = sharedBy && (
    <span className="corner badge badge-solid">
      <Icon name="users" size={12} strokeWidth={2.5} />
      Shared
    </span>
  )

  return (
    <Link to={`/collections/${collection.id}`} className="card">
      {collection.coverUrl ? (
        <div className="card-media">
          <img src={collection.coverUrl} alt="" loading="lazy" />
          {sharedBadge}
        </div>
      ) : (
        <div className="card-media placeholder">
          <Icon name="images" size={28} strokeWidth={1.5} />
          No images yet
          {sharedBadge}
        </div>
      )}
      <div className="card-body">
        <span className="card-title">{collection.name}</span>
        <span className="card-meta">
          {collection.imageCount} {collection.imageCount === 1 ? 'image' : 'images'}
          {sharedBy && (
            <>
              <span className="dot-separator" />
              by {sharedBy}
            </>
          )}
        </span>
      </div>
    </Link>
  )
}
