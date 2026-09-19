import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { addImage } from '../api/collections'
import { searchImages } from '../api/search'
import type { CollectionImage, SearchResult } from '../api/types'
import { errorMessage } from '../lib/errors'
import { ErrorMessage, Loading, Spinner } from './Feedback'
import { Icon } from './Icon'

interface ImageSearchProps {
  collectionId: number
  onSaved: (image: CollectionImage) => void
}

/** Searches Pixabay and saves results into the collection */
export function ImageSearch({ collectionId, onSaved }: ImageSearchProps) {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async (q: string, pageNumber: number) => {
    setError(null)
    setSearching(true)
    try {
      const found = await searchImages(q, pageNumber)
      setResults(found.items)
      setTotal(found.total)
      setSubmittedQuery(q)
      setPage(pageNumber)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (query.trim()) {
      runSearch(query.trim(), 1)
    }
  }

  /** Marks a result as saved in this collection, so its button changes */
  const markSaved = (sourceId: string) => {
    setResults(current =>
      current.map(result =>
        result.sourceId === sourceId ? { ...result, savedIn: [...result.savedIn, collectionId] } : result,
      ),
    )
  }

  const handleSave = async (result: SearchResult) => {
    setError(null)
    setSaving(result.sourceId)
    try {
      onSaved(await addImage(collectionId, result))
      markSaved(result.sourceId)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        markSaved(result.sourceId) // Someone else saved it already
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setSaving(null)
    }
  }

  const perPage = 20
  const hasNext = total !== null && page * perPage < total
  const pageCount = total !== null ? Math.max(1, Math.ceil(total / perPage)) : null

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">
          <Icon name="search" />
        </span>
        <div>
          <h2>Add images</h2>
          <p>Search millions of free photos on Pixabay and save them here.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="inline-form" role="search">
        <div className="input-with-icon">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label="Search Pixabay"
            placeholder="Try “mountains”, “coffee” or “architecture”"
            value={query}
            onChange={event => setQuery(event.target.value)}
            maxLength={100}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={searching}>
          {searching && <Spinner />}
          Search
        </button>
      </form>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {searching && results.length === 0 && <Loading>Searching…</Loading>}
      {!searching && submittedQuery && results.length === 0 && (
        <p className="muted center">No photos found for “{submittedQuery}”. Try another search.</p>
      )}

      {results.length > 0 && (
        <>
          <p className="subtle">
            {total !== null ? `${total.toLocaleString()} results` : 'Results'} for “{submittedQuery}”
          </p>
          <ul className="card-grid compact" aria-busy={searching}>
            {results.map(result => {
              const saved = result.savedIn.includes(collectionId)
              const isSaving = saving === result.sourceId
              return (
                <li key={result.sourceId} className="result-card">
                  <img src={result.previewUrl} alt={result.tags.join(', ')} loading="lazy" />
                  <div className="result-bar">
                    <span className="author">by {result.author}</span>
                    <button
                      type="button"
                      className={saved ? 'btn btn-sm btn-saved' : 'btn btn-sm btn-primary'}
                      onClick={() => handleSave(result)}
                      disabled={saved || isSaving}
                    >
                      {isSaving ? <Spinner /> : <Icon name={saved ? 'check' : 'bookmark'} size={14} strokeWidth={2.5} />}
                      {saved ? 'Saved' : isSaving ? 'Saving' : 'Save'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <nav className="pagination" aria-label="Search result pages">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => runSearch(submittedQuery, page - 1)}
              disabled={searching || page <= 1}
            >
              <Icon name="chevronLeft" size={16} />
              Previous
            </button>
            <span>
              Page {page}
              {pageCount !== null && ` of ${pageCount.toLocaleString()}`}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => runSearch(submittedQuery, page + 1)}
              disabled={searching || !hasNext}
            >
              Next
              <Icon name="chevronRight" size={16} />
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
