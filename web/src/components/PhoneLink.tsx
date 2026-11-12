import { formatPhone } from '../lib/phone'

/** A number a phone can dial with one tap: written the way it is at home, dialled in the international form. */
export function PhoneLink({ phone }: { phone: string }) {
  return <a href={`tel:${phone}`}>{formatPhone(phone)}</a>
}
