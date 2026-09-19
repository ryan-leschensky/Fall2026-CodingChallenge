import { useEffect, useState, type FormEvent } from 'react'
import { listMembers, removeMember, setMember } from '../api/collections'
import type { Collection, Member, Permission } from '../api/types'
import { errorMessage } from '../lib/errors'
import { hasPermission } from '../lib/permissions'

/** Who has access to a collection. The owner can add people, change their access, or remove them. */
export function MembersPanel({ collection }: { collection: Collection }) {
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
    <section className="stack panel">
      <h2>Members</h2>
      <ul className="stack">
        {members.map(member => (
          <li key={member.id} className="row">
            <span>{member.username}</span>
            {isOwner && member.permission !== 'own' ? (
              <>
                <select
                  value={member.permission}
                  onChange={event => run(() => setMember(collection.id, member.username, event.target.value as Permission))}
                >
                  <option value="view">view</option>
                  <option value="edit">edit</option>
                </select>
                <button type="button" className="danger" onClick={() => run(() => removeMember(collection.id, member.username))}>
                  Remove
                </button>
              </>
            ) : (
              <small>{member.permission}</small>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={handleAdd} className="row">
          <input
            placeholder="Username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            required
          />
          <select value={permission} onChange={event => setPermission(event.target.value as Permission)}>
            <option value="view">can view</option>
            <option value="edit">can edit</option>
          </select>
          <button type="submit">Add member</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
