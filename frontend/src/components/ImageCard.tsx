import { useState, type FormEvent } from 'react'
import { removeImage, updateImage } from '../api/collections'
import type { CollectionImage } from '../api/types'
import { errorMessage } from '../lib/errors'

interface ImageCardProps {
  collectionId: number
  image: CollectionImage
  canEdit: boolean
  onChanged?: (image: CollectionImage) => void
  onRemoved?: (imageId: number) => void
}

/** Parses a comma-separated tag list as typed by the user */
const parseTags = (text: string): string[] =>
  text
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)

/** A saved image, with its title, note and tags; editable and removable with edit access */
export function ImageCard({ collectionId, image, canEdit, onChanged, onRemoved }: ImageCardProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(image.title)
  const [note, setNote] = useState(image.note)
  const [tags, setTags] = useState(image.tags.join(', '))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const startEditing = () => {
    setTitle(image.title)
    setNote(image.note)
    setTags(image.tags.join(', '))
    setEditing(true)
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onChanged?.(await updateImage(collectionId, image.id, { title, note, tags: parseTags(tags) }))
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setError(null)
    setBusy(true)
    try {
      await removeImage(collectionId, image.id)
      onRemoved?.(image.id)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <article className="card">
      <a href={image.imageUrl} target="_blank" rel="noreferrer">
        <img src={image.thumbnailUrl ?? image.imageUrl} alt={image.title} className="card-cover" loading="lazy" />
      </a>

      {editing ? (
        <form onSubmit={handleSave} className="stack">
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" maxLength={200} />
          <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Note" maxLength={2000} />
          <input value={tags} onChange={event => setTags(event.target.value)} placeholder="Tags, comma separated" />
          <div className="row">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {image.title && <strong>{image.title}</strong>}
          {image.note && <p>{image.note}</p>}
          {image.tags.length > 0 && <small>{image.tags.join(' · ')}</small>}
          {image.pageUrl && (
            <small>
              <a href={image.pageUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </small>
          )}
          {canEdit && (
            <div className="row">
              <button type="button" onClick={startEditing} disabled={busy}>
                Edit
              </button>
              <button type="button" className="danger" onClick={handleRemove} disabled={busy}>
                Remove
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  )
}
