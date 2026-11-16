/** The teacher's photo, or their initials when there is none. */
export function CvPhoto({
  src,
  firstName,
  lastName,
  size = 'small',
}: {
  src: string | null
  firstName: string
  lastName: string
  size?: 'small' | 'large'
}) {
  if (src) return <img className={`cv-photo cv-photo--${size}`} src={src} alt="" loading="lazy" />
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  return (
    <span className={`cv-photo cv-photo--${size} cv-photo--initials`} aria-hidden="true">
      {initials}
    </span>
  )
}
