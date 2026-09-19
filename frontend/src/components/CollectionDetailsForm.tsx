import { useEffect, useState, type FormEvent } from 'react'
import { updateCollection } from '../api/collections'
import type { Collection } from '../api/types'
import { errorMessage } from '../lib/errors'
import { ErrorMessage, Spinner } from './Feedback'
import { Icon } from './Icon'

interface CollectionDetailsFormProps {
  collection: Collection
  onSaved: (collection: Collection) => void
}

/** Renames a collection or changes its description (needs edit access), in a dialog */
export function CollectionDetailsForm({ collection, onSaved }: CollectionDetailsFormProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(collection.name)
  const [description, setDescription] = useState(collection.description)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Escape closes the dialog
  useEffect(() => {
    if (!editing) {
      return
    }
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && setEditing(false)
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editing])

  const openEditor = () => {
    setName(collection.name)
    setDescription(collection.description)
    setError(null)
    setEditing(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      onSaved(await updateCollection(collection.id, { name, description }))
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={openEditor}>
        <Icon name="pencil" size={16} />
        Edit details
      </button>

      {editing && (
        <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setEditing(false)}>
          <form
            onSubmit={handleSubmit}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-collection-title"
          >
            <div className="modal-header">
              <h2 id="edit-collection-title">Edit collection</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setEditing(false)}
                aria-label="Close"
              >
                <Icon name="x" />
              </button>
            </div>
            <label className="field">
              Name
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={100}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>
                Description <span className="hint">(optional)</span>
              </span>
              <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} />
            </label>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Spinner />}
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
