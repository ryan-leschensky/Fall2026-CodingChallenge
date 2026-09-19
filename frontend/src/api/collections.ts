import { request, totalCount } from './client'
import type {
  Collection,
  CollectionFilter,
  CollectionImage,
  CollectionWithImages,
  EditableImageFields,
  LinkAccess,
  Member,
  Page,
  Permission,
  SearchResult,
} from './types'

export interface PageQuery {
  limit?: number
  offset?: number
}

// --- Collections ---------------------------------------------------------------------------------

export interface CollectionListQuery extends PageQuery {
  filter?: CollectionFilter
}

export const listCollections = async (query: CollectionListQuery = {}): Promise<Page<Collection>> => {
  const { data, headers } = await request<Collection[]>('/collections', { query: { ...query } })
  return { items: data, total: totalCount(headers) }
}

export const createCollection = async (fields: { name: string; description?: string }) =>
  (await request<Collection>('/collections', { method: 'POST', body: fields })).data

/** A collection and its first page of images */
export const getCollection = async (id: number, query: PageQuery = {}) =>
  (await request<CollectionWithImages>(`/collections/${id}`, { query: { ...query } })).data

export const updateCollection = async (id: number, fields: { name?: string; description?: string }) =>
  (await request<Collection>(`/collections/${id}`, { method: 'PATCH', body: fields })).data

export const deleteCollection = async (id: number): Promise<void> => {
  await request<void>(`/collections/${id}`, { method: 'DELETE' })
}

// --- Images --------------------------------------------------------------------------------------

export const listImages = async (collectionId: number, query: PageQuery = {}): Promise<Page<CollectionImage>> => {
  const { data, headers } = await request<CollectionImage[]>(`/collections/${collectionId}/images`, {
    query: { ...query },
  })
  return { items: data, total: totalCount(headers) }
}

/** Saves a search result to a collection. The server keeps its own copy of Pixabay images. */
export const addImage = async (collectionId: number, result: SearchResult) => {
  const { source, sourceId, imageUrl, thumbnailUrl, pageUrl, width, height, tags } = result
  const body = { source, sourceId, imageUrl, thumbnailUrl, pageUrl, width, height, tags }
  return (await request<CollectionImage>(`/collections/${collectionId}/images`, { method: 'POST', body })).data
}

export const updateImage = async (collectionId: number, imageId: number, fields: EditableImageFields) =>
  (
    await request<CollectionImage>(`/collections/${collectionId}/images/${imageId}`, {
      method: 'PATCH',
      body: fields,
    })
  ).data

export const removeImage = async (collectionId: number, imageId: number): Promise<void> => {
  await request<void>(`/collections/${collectionId}/images/${imageId}`, { method: 'DELETE' })
}

// --- Sharing -------------------------------------------------------------------------------------

/** Turns on link sharing, or changes what joining through the link grants */
export const setShareLink = async (collectionId: number, access: LinkAccess) =>
  (await request<Collection>(`/collections/${collectionId}/share-link`, { method: 'PUT', body: { access } })).data

export const disableShareLink = async (collectionId: number) =>
  (await request<Collection>(`/collections/${collectionId}/share-link`, { method: 'DELETE' })).data

/** Replaces the share link, so links shared before stop working */
export const resetShareLink = async (collectionId: number) =>
  (await request<Collection>(`/collections/${collectionId}/share-link/reset`, { method: 'POST' })).data

/** A collection opened through its share link; works without logging in */
export const getSharedCollection = async (shareId: string, query: PageQuery = {}) =>
  (await request<CollectionWithImages>(`/shared/${encodeURIComponent(shareId)}`, { query: { ...query } })).data

/** Joins a shared collection, so it shows up in the user's list */
export const joinSharedCollection = async (shareId: string) =>
  (await request<Collection>(`/shared/${encodeURIComponent(shareId)}/join`, { method: 'POST' })).data

// --- Members -------------------------------------------------------------------------------------

export const listMembers = async (collectionId: number) =>
  (await request<Member[]>(`/collections/${collectionId}/members`)).data

/** Adds a member or changes their access. Giving "own" transfers ownership. */
export const setMember = async (collectionId: number, username: string, permission: Permission) =>
  (
    await request<Member>(`/collections/${collectionId}/members/${encodeURIComponent(username)}`, {
      method: 'PUT',
      body: { permission },
    })
  ).data

/** Removes a member; any member can remove themselves (leave) */
export const removeMember = async (collectionId: number, username: string): Promise<void> => {
  await request<void>(`/collections/${collectionId}/members/${encodeURIComponent(username)}`, { method: 'DELETE' })
}
