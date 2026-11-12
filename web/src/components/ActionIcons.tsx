import type { ReactNode } from 'react'

/** Line icons for the actions in a table row. Decorative: the button around them carries the name. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const ViewIcon = () => (
  <Icon>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const EditIcon = () => (
  <Icon>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icon>
)

export const DeleteIcon = () => (
  <Icon>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const AddIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

/** A square button with only an icon. The label is the accessible name and the tooltip. */
export function IconButton({
  label,
  onClick,
  danger = false,
  large = false,
  round = false,
  solid = false,
  disabled = false,
  color,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  /** A bigger button, for the main actions of a page. */
  large?: boolean
  disabled?: boolean
  /** A circle instead of a rounded square. */
  round?: boolean
  /** With a colour: the button is filled with it and the icon is white. */
  solid?: boolean
  /** Draws the icon and the edge in this colour instead of the text colour (or the button itself, when solid). */
  color?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`icon-button${danger ? ' icon-button--danger' : ''}${large ? ' icon-button--large' : ''}${round ? ' icon-button--round' : ''}`}
      style={
        color
          ? solid
            ? { color: '#ffffff', backgroundColor: color, borderColor: color }
            : { color, borderColor: color }
          : undefined
      }
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
