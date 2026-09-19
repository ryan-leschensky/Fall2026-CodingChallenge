import { useEffect, useState, type FormEvent } from 'react'
import { listMembers, removeMember, setMember } from '../api/collections'
import type { Collection, Member, Permission } from '../api/types'
import { useAuth } from '../auth/auth-context'
import { errorMessage } from '../lib/errors'
import { hasPermission } from '../lib/permissions'
import { ErrorMessage } from './Feedback'
import { Icon } from './Icon'

const PERMISSION_LABELS: Record<Permission, string> = { view: 'Viewer', edit: 'Editor', own: 'Owner' }

/** Who has access to a collection. The owner can add people, change their access, or remove them. */
export function MembersPanel({ collection }: { collection: Collection }) {
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState<Permission>('view')
  const [error, setError] = useState<string | null>(null)

  const isOwner = hasPermission(collection.permission, 'own')

  const reload = async () => setMembers(await listMembers(collection.id))

  useEffect(() => {
    let cancelled = false
    listMembers(collection.id)
      .then(found => !cancelled && setMembers(found))
      .catch(err => !cancelled && setError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [collection.id])

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    run(async () => {
      await setMember(collection.id, username.trim(), permission)
      setUsername('')
    })
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">
          <Icon name="users" />
        </span>
        <div>
          <h2>Members</h2>
          <p>
            {members.length} {members.length === 1 ? 'person has' : 'people have'} access
          </p>
        </div>
      </div>

      <ul className="member-list">
        {members.map(member => (
          <li key={member.id} className="member">
            <span className={member.permission === 'own' ? 'avatar sm' : 'avatar sm muted'}>
              {member.username.charAt(0)}
            </span>
            <span className="name">
              {member.username}
              {member.id === user?.id && <span className="you"> (you)</span>}
            </span>
            {isOwner && member.permission !== 'own' ? (
              <>
                <select
                  className="select-sm"
                  aria-label={`Access for ${member.username}`}
                  value={member.permission}
                  onChange={event => run(() => setMember(collection.id, member.username, event.target.value as Permission))}
                >
                  <option value="view">Viewer</option>
                  <option value="edit">Editor</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon danger"
                  onClick={() => run(() => removeMember(collection.id, member.username))}
                  aria-label={`Remove ${member.username}`}
                  title="Remove"
                >
                  <Icon name="x" size={16} />
                </button>
              </>
            ) : (
              <span className={member.permission === 'own' ? 'badge badge-accent' : 'badge'}>
                {PERMISSION_LABELS[member.permission]}
              </span>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <hr className="divider" />
          <form onSubmit={handleAdd} className="stack">
            <label className="field">
              Invite someone
              <input
                placeholder="Username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                required
              />
            </label>
            <div className="row">
              <select
                aria-label="Access for the new member"
                className="select-sm"
                value={permission}
                onChange={event => setPermission(event.target.value as Permission)}
              >
                <option value="view">Can view</option>
                <option value="edit">Can edit</option>
              </select>
              <span className="spacer" />
              <button type="submit" className="btn btn-primary btn-sm">
                <Icon name="userPlus" size={15} />
                Add member
              </button>
            </div>
          </form>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  )
}
