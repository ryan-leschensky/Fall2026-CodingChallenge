import type { Permission } from '../api/types'

const RANK: Record<Permission, number> = { view: 1, edit: 2, own: 3 }

/** Whether a user's access to a collection is enough for an action that needs `required` (mirrors the backend) */
export const hasPermission = (actual: Permission | null | undefined, required: Permission): boolean =>
  actual != null && RANK[actual] >= RANK[required]
