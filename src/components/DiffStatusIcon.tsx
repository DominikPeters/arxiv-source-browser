import type { DiffFileStatus } from '../types'

interface DiffStatusIconProps {
  status: DiffFileStatus
  className?: string
  title?: string
  ariaLabel?: string
}

function diffStatusLabel(status: DiffFileStatus): string {
  switch (status) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'modified':
      return 'Modified'
    case 'unchanged':
      return 'Unchanged'
    default:
      return status
  }
}

function DiffStatusGlyph({ status }: { status: DiffFileStatus }) {
  if (status === 'added') {
    return (
      <svg viewBox="0 0 16 16" className="diff-status-svg" aria-hidden="true">
        <path d="M8 3.25v9.5M3.25 8h9.5" />
      </svg>
    )
  }

  if (status === 'removed') {
    return (
      <svg viewBox="0 0 16 16" className="diff-status-svg" aria-hidden="true">
        <path d="M3.25 8h9.5" />
      </svg>
    )
  }

  if (status === 'modified') {
    return (
      <svg viewBox="0 0 16 16" className="diff-status-svg" aria-hidden="true">
        <circle cx="8" cy="8" r="1.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" className="diff-status-svg" aria-hidden="true">
      <circle cx="8" cy="8" r="1.2" />
    </svg>
  )
}

export default function DiffStatusIcon({
  status,
  className,
  title,
  ariaLabel,
}: DiffStatusIconProps) {
  const label = ariaLabel ?? diffStatusLabel(status)
  return (
    <span className={`diff-status-icon ${status}${className ? ` ${className}` : ''}`} title={title} aria-label={label}>
      <DiffStatusGlyph status={status} />
    </span>
  )
}
