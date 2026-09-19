import { Link } from 'react-router'
import { Icon } from '../components/Icon'

export function NotFoundPage() {
  return (
    <section className="not-found">
      <span className="code">404</span>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has moved.</p>
      <Link to="/" className="btn btn-primary">
        <Icon name="arrowLeft" size={16} />
        Go to my collections
      </Link>
    </section>
  )
}
