import { useState, type FormEvent } from 'react'
import { createCollection } from '../api/collections'
import type { Collection } from '../api/types'
import { errorMessage } from '../lib/errors'
import { ErrorMessage, Spinner } from './Feedback'
import { Icon } from './Icon'

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
    <form onSubmit={handleSubmit} className="panel">
      <div className="panel-header">
        <span className="panel-icon">
          <Icon name="plus" />
        </span>
        <div>
          <h2>New collection</h2>
          <p>Group photos around a project, a mood or an idea.</p>
        </div>
      </div>
      <div className="inline-form">
        <input
          aria-label="Collection name"
          placeholder="Collection name"
          value={name}
          onChange={event => setName(event.target.value)}
          maxLength={100}
          required
        />
        <input
          className="grow-2"
          aria-label="Description"
          placeholder="Description (optional)"
          value={description}
          onChange={event => setDescription(event.target.value)}
          maxLength={500}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? <Spinner /> : <Icon name="plus" size={16} strokeWidth={2.5} />}
          Create
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  )
}
