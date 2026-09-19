import { useAuth } from '../auth/auth-context'
import { CollectionSection } from '../components/CollectionSection'
import { CreateCollectionForm } from '../components/CreateCollectionForm'
import { EmptyState } from '../components/Feedback'
import { useCollectionList } from '../hooks/useCollectionList'

/** The user's own collections and the ones shared with them, and a form to create one */
export function HomePage() {
  const { user } = useAuth()
  const owned = useCollectionList('owned')
  const shared = useCollectionList('shared')

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="titles">
          {user && <span className="eyebrow">Welcome back, {user.username}</span>}
          <h1>Collections</h1>
          <p className="description">Your collections and the ones shared with you.</p>
        </div>
      </header>

      <CreateCollectionForm onCreated={owned.prepend} />

      <CollectionSection
        title="Your collections"
        list={owned}
        empty={
          <EmptyState icon="images" title="No collections yet">
            Create your first collection above, then search for photos to fill it.
          </EmptyState>
        }
      />

      <CollectionSection
        title="Shared with you"
        list={shared}
        empty={
          <EmptyState icon="users" title="Nothing shared yet">
            When someone shares a collection with you, or you join one through a link, it shows up here.
          </EmptyState>
        }
      />
    </div>
  )
}
