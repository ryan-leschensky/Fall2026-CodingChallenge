import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** A spinning ring; announced to screen readers only when it has a label */
export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? 'status' : undefined} aria-label={label} />
}

/** A centered spinner with a message, for a page or section that is still loading */
export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div className="loading" role="status">
      <Spinner />
      {children}
    </div>
  )
}

/** An error message in a red callout */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      <Icon name="alert" size={16} />
      <span>{children}</span>
    </p>
  )
}

interface EmptyStateProps {
  icon: IconName
  title: string
  children?: ReactNode
  /** Buttons or links shown under the message */
  actions?: ReactNode
}

/** A placeholder for a list with nothing in it yet */
export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="actions row">{actions}</div>}
    </div>
  )
}

/** Grey placeholder cards shown while a grid loads */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <ul className="card-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="skeleton skeleton-card" />
      ))}
    </ul>
  )
}
