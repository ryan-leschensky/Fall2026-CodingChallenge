import { request, totalCount } from './client'
import type { Page, SearchResult } from './types'

/** Searches Pixabay through the backend (which holds the API key) */
export const searchImages = async (
  q: string,
  page = 1,
  signal?: AbortSignal,
): Promise<Page<SearchResult>> => {
  const { data, headers } = await request<SearchResult[]>('/search/images', { query: { q, page }, signal })
  return { items: data, total: totalCount(headers) }
}
