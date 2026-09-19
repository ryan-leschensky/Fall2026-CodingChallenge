import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { addImage } from '../api/collections'
import { searchImages } from '../api/search'
import type { CollectionImage, SearchResult } from '../api/types'
import { errorMessage } from '../lib/errors'

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

  return (
    <section className="stack panel">
      <h2>Add images</h2>
      <form onSubmit={handleSubmit} className="row">
        <input
          type="search"
          placeholder="Search Pixabay"
          value={query}
          onChange={event => setQuery(event.target.value)}
          maxLength={100}
        />
        <button type="submit" disabled={searching}>
          Search
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {searching && <p>Searching…</p>}
      {!searching && submittedQuery && results.length === 0 && <p>No results.</p>}

      <ul className="card-grid">
        {results.map(result => {
          const saved = result.savedIn.includes(collectionId)
          return (
            <li key={result.sourceId} className="card">
              <img src={result.previewUrl} alt={result.tags.join(', ')} className="card-cover" loading="lazy" />
              <small>by {result.author}</small>
              <button
                type="button"
                onClick={() => handleSave(result)}
                disabled={saved || saving === result.sourceId}
              >
                {saved ? 'Saved' : saving === result.sourceId ? 'Saving…' : 'Save'}
              </button>
            </li>
          )
        })}
      </ul>

      {results.length > 0 && (
        <div className="row">
          <button type="button" onClick={() => runSearch(submittedQuery, page - 1)} disabled={searching || page <= 1}>
            Previous
          </button>
          <span>Page {page}</span>
          <button type="button" onClick={() => runSearch(submittedQuery, page + 1)} disabled={searching || !hasNext}>
            Next
          </button>
        </div>
      )}
    </section>
  )
}
