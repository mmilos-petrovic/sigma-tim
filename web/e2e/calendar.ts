import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { localEnv } from './helpers.ts'

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Belgrade',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "HH:MM" on the Belgrade clock, the way a block of the calendar writes it. */
export const clock = (at: Date | string | number) => clockFormat.format(new Date(at))

/** `hoursAhead` hours from now, on a full hour: a start time on the 15 minute grid, in the future. */
export const fullHourAhead = (hoursAhead: number) =>
  new Date(Math.ceil((Date.now() + hoursAhead * 3_600_000) / 3_600_000) * 3_600_000)

/** A block of the calendar by its class and when it is (its text reads "10:00–11:00 ..."). */
export const block = (page: Page, variant: string, start: Date, minutes = 60) =>
  page
    .locator(`.cal-item--${variant}`)
    .filter({ hasText: `${clock(start)}–${clock(new Date(start.getTime() + minutes * 60_000))}` })

/** Shows the next week if that is where the block is (a day ahead can be a Monday); this week gets a moment to load first. */
export async function shown(page: Page, target: Locator): Promise<Locator> {
  const here = await target
    .first()
    .waitFor({ state: 'attached', timeout: 4000 })
    .then(() => true)
    .catch(() => false)
  if (!here) await page.getByRole('button', { name: 'Sledeća nedelja' }).click()
  await expect(target.first()).toBeAttached()
  return target.first()
}

/** A free slot written the way the app writes it: straight into the table, as the teacher, through RLS. */
export async function publishSlot(
  request: APIRequestContext,
  token: string,
  slot: { teacherId: string; subjectId: string; locationId: string; start: Date },
) {
  const { url, key } = localEnv()
  return request.post(`${url}/rest/v1/lessons?select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
    data: {
      teacher_id: slot.teacherId,
      subject_id: slot.subjectId,
      location_id: slot.locationId,
      start_at: slot.start.toISOString(),
      end_at: new Date(slot.start.getTime() + 3_600_000).toISOString(),
      status: 'open',
      origin: 'slot',
    },
  })
}

export async function deleteLesson(request: APIRequestContext, token: string, id: string) {
  const { url, key } = localEnv()
  const response = await request.delete(`${url}/rest/v1/lessons?id=eq.${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `deleting lesson ${id}: ${await response.text()}`).toBe(true)
}
