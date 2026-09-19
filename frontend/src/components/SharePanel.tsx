import { useState } from 'react'
import { Link } from 'react-router'
import { disableShareLink, resetShareLink, setShareLink } from '../api/collections'
import type { Collection, LinkAccess } from '../api/types'
import { errorMessage } from '../lib/errors'
import { ErrorMessage } from './Feedback'
import { Icon } from './Icon'

interface SharePanelProps {
  collection: Collection
  onChanged: (collection: Collection) => void
}

/** The owner's controls for the collection's share link */
export function SharePanel({ collection, onChanged }: SharePanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const sharePath = collection.shareId ? `/shared/${collection.shareId}` : null
  const shareUrl = sharePath ? `${window.location.origin}${sharePath}` : null
  const enabled = collection.linkAccess !== null

  const run = async (action: () => Promise<Collection>) => {
    setError(null)
    setBusy(true)
    try {
      onChanged(await action())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAccessChange = (value: string) => {
    run(() =>
      value === 'off' ? disableShareLink(collection.id) : setShareLink(collection.id, value as LinkAccess),
    )
  }

  const copyLink = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">
          <Icon name="link" />
        </span>
        <div>
          <h2>Share link</h2>
          <p>Let anyone with the link view or join.</p>
        </div>
      </div>

      <div className="status-line">
        <span className={enabled ? 'status-dot on' : 'status-dot'} />
        {enabled ? 'Link sharing is on' : 'Link sharing is off'}
      </div>

      <label className="field">
        Anyone with the link can
        <select
          value={collection.linkAccess ?? 'off'}
          onChange={event => handleAccessChange(event.target.value)}
          disabled={busy}
        >
          <option value="off">Nothing (sharing off)</option>
          <option value="view">View, and join as a viewer</option>
          <option value="edit">View, and join as an editor</option>
        </select>
      </label>

      {enabled && shareUrl && sharePath && (
        <div className="stack">
          <div className="share-url">
            <Link to={sharePath} title={shareUrl}>
              {shareUrl}
            </Link>
            <button
              type="button"
              className={copied ? 'btn btn-sm btn-saved' : 'btn btn-sm btn-primary'}
              onClick={copyLink}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} strokeWidth={2.25} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => resetShareLink(collection.id))}
            disabled={busy}
          >
            <Icon name="refresh" size={14} />
            Replace with a new link
          </button>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  )
}
