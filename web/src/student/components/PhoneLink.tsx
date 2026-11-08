/** A number a phone can dial with one tap. */
export function PhoneLink({ phone }: { phone: string }) {
  return <a href={`tel:${phone}`}>{phone}</a>
}
