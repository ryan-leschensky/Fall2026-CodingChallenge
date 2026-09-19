import { useState, type FormEvent } from 'react'
import { createCollection } from '../api/collections'
import type { Collection } from '../api/types'
import { errorMessage } from '../lib/errors'

interface CreateCollectionFormProps {
  onCreated: (collection: Collection) => void
}

export function CreateCollectionForm({ onCreated }: CreateCollectionFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      onCreated(await createCollection({ name, description }))
      setName('')
      setDescription('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="row">
      <input
        placeholder="New collection name"
        value={name}
        onChange={event => setName(event.target.value)}
        maxLength={100}
        required
      />
      <input
        placeholder="Description (optional)"
        value={description}
        onChange={event => setDescription(event.target.value)}
        maxLength={500}
      />
      <button type="submit" disabled={submitting}>
        Create
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
