import { useState } from 'react'
import { Link } from 'react-router'
import { disableShareLink, resetShareLink, setShareLink } from '../api/collections'
import type { Collection, LinkAccess } from '../api/types'
import { errorMessage } from '../lib/errors'

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
    <section className="stack panel">
      <h2>Share link</h2>
      <label>
        Anyone with the link can
        <select
          value={collection.linkAccess ?? 'off'}
          onChange={event => handleAccessChange(event.target.value)}
          disabled={busy}
        >
          <option value="off">— link sharing off —</option>
          <option value="view">view (and join as a viewer)</option>
          <option value="edit">view (and join as an editor)</option>
        </select>
      </label>

      {enabled && shareUrl && sharePath && (
        <div className="row">
          <Link to={sharePath}>{shareUrl}</Link>
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => run(() => resetShareLink(collection.id))} disabled={busy}>
            New link
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
