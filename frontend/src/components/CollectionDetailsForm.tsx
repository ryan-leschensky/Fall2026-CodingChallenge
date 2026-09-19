import { useState, type FormEvent } from 'react'
import { updateCollection } from '../api/collections'
import type { Collection } from '../api/types'
import { errorMessage } from '../lib/errors'

interface CollectionDetailsFormProps {
  collection: Collection
  onSaved: (collection: Collection) => void
}

/** Renames a collection or changes its description (needs edit access) */
export function CollectionDetailsForm({ collection, onSaved }: CollectionDetailsFormProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(collection.name)
  const [description, setDescription] = useState(collection.description)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setName(collection.name)
            setDescription(collection.description)
            setEditing(true)
          }}
        >
          Edit name and description
        </button>
      </div>
    )
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
    <form onSubmit={handleSubmit} className="stack panel">
      <label>
        Name
        <input value={name} onChange={event => setName(event.target.value)} maxLength={100} required />
      </label>
      <label>
        Description
        <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
