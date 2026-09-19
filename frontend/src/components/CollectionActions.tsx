import { useState } from 'react'
import { deleteCollection, removeMember } from '../api/collections'
import type { Collection, User } from '../api/types'
import { errorMessage } from '../lib/errors'
import { hasPermission } from '../lib/permissions'

interface CollectionActionsProps {
  collection: Collection
  user: User
  /** Called once the user no longer has the collection (deleted it or left it) */
  onDone: () => void
}

/**
 * Delete (for the owner) or leave (for other members). Asks for a second click to confirm rather
 * than a browser dialog.
 */
export function CollectionActions({ collection, user, onDone }: CollectionActionsProps) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOwner = hasPermission(collection.permission, 'own')
  if (!collection.permission) {
    return null
  }

  const label = isOwner ? 'Delete collection' : 'Leave collection'

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setError(null)
    try {
      if (isOwner) {
        await deleteCollection(collection.id)
      } else {
        await removeMember(collection.id, user.username)
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setConfirming(false)
    }
  }

  return (
    <div className="row">
      <button type="button" className="danger" onClick={handleClick}>
        {confirming ? `Click again to ${label.toLowerCase()}` : label}
      </button>
      {confirming && (
        <button type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
