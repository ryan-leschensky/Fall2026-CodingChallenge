import { useState, type FormEvent } from 'react'
import { removeImage, updateImage } from '../api/collections'
import type { CollectionImage } from '../api/types'
import { errorMessage } from '../lib/errors'
import { ErrorMessage, Spinner } from './Feedback'
import { Icon } from './Icon'

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

  const hasDetails = image.title || image.note || image.tags.length > 0 || image.pageUrl

  return (
    <article className="card interactive">
      <div className="card-media">
        <img src={image.thumbnailUrl ?? image.imageUrl} alt={image.title} loading="lazy" />
        <div className="overlay">
          <a
            href={image.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="overlay-btn"
            aria-label="Open full size"
            title="Open full size"
          >
            <Icon name="external" size={16} />
          </a>
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="card-body stack">
          <input
            aria-label="Title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Title"
            maxLength={200}
            autoFocus
          />
          <textarea
            aria-label="Note"
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Add a note"
            maxLength={2000}
          />
          <input
            aria-label="Tags"
            value={tags}
            onChange={event => setTags(event.target.value)}
            placeholder="Tags, comma separated"
          />
          <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy && <Spinner />}
              Save
            </button>
          </div>
        </form>
      ) : (
        (hasDetails || canEdit) && (
          <div className="card-body">
            {image.title && <span className="card-title">{image.title}</span>}
            {image.note && <p className="card-note">{image.note}</p>}
            {image.tags.length > 0 && (
              <div className="tags">
                {image.tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {(image.pageUrl || canEdit) && (
              <div className="card-footer">
                {image.pageUrl && (
                  <a href={image.pageUrl} target="_blank" rel="noreferrer" className="source-link">
                    Source
                    <Icon name="external" size={12} />
                  </a>
                )}
                <span className="spacer" />
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={startEditing}
                      disabled={busy}
                      aria-label="Edit image details"
                      title="Edit"
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon danger"
                      onClick={handleRemove}
                      disabled={busy}
                      aria-label="Remove image"
                      title="Remove"
                    >
                      {busy ? <Spinner /> : <Icon name="trash" size={16} />}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}
      {error && (
        <div className="card-body">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      )}
    </article>
  )
}
