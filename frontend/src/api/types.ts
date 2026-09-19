// Shapes of the backend's JSON responses (see the OpenAPI docs at /api-docs on the backend)

/** Access to a collection, lowest to highest. Each level includes the ones before it. */
export type Permission = 'view' | 'edit' | 'own'

/** What joining through a share link grants */
export type LinkAccess = 'view' | 'edit'

export interface User {
  id: number
  username: string
}

export interface Session {
  user: User
  accessToken: string
  tokenType: 'Bearer'
  /** Seconds until the access token expires */
  expiresIn: number
}

export interface Collection {
  id: number
  name: string
  description: string
  owner: User
  /** The current user's access; null if they are not a member (e.g. viewing through a link) */
  permission: Permission | null
  /** null when link sharing is off */
  linkAccess: LinkAccess | null
  /** Public id for the share link; only sent to the owner, or to others while sharing is on */
  shareId: string | null
  imageCount: number
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface CollectionImage {
  id: number
  collectionId: number
  addedBy: number | null
  source: string
  sourceId: string | null
  imageUrl: string
  thumbnailUrl: string | null
  originalUrl: string | null
  pageUrl: string | null
  width: number | null
  height: number | null
  title: string
  note: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionWithImages extends Collection {
  images: CollectionImage[]
}

export interface Member extends User {
  permission: Permission
  addedAt: string
}

/** A photo found on Pixabay */
export interface SearchResult {
  source: string
  sourceId: string
  imageUrl: string
  thumbnailUrl: string
  previewUrl: string
  previewWidth: number
  previewHeight: number
  pageUrl: string
  width: number
  height: number
  tags: string[]
  author: string
  /** IDs of the user's collections that already have this photo */
  savedIn: number[]
}

/** Fields of a saved image that can be changed after saving */
export interface EditableImageFields {
  title?: string
  note?: string
  tags?: string[]
}

/** One page of a list, with the total across all pages when the server sends it */
export interface Page<T> {
  items: T[]
  total: number | null
}
