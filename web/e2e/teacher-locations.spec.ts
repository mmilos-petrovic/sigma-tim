import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { block, deleteLesson, fullHourAhead, publishSlot, shown } from './calendar.ts'
import { localEnv, signInAs } from './helpers.ts'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })

/**
 * Two extra locations for this run. Ana may use the first (the administrator gives it to her in the first test, through the
 * screen, and in the second one directly); the second one she may not.
 */
async function setUp(request: APIRequestContext, run: string) {
  const nameB = `E2E Lokacija B ${run}`
  const nameC = `E2E Lokacija C ${run}`
  sql(
    `insert into public.locations (name, address) values ('${nameB}', 'Ulica 2'), ('${nameC}', 'Ulica 3')`,
  )
  const admin = await tokenFor(request, 'admin@example.test')
  const ana = await tokenFor(request, 'ana.nikolic@example.test')
  const [{ id: b }] = await select<{ id: string }>(
    request,
    admin,
    `locations?name=eq.${encodeURIComponent(nameB)}&select=id`,
  )
  const [{ id: c }] = await select<{ id: string }>(
    request,
    admin,
    `locations?name=eq.${encodeURIComponent(nameC)}&select=id`,
  )
  const [{ id: main }] = await select<{ id: string }>(
    request,
    admin,
    'locations?name=eq.Glavna lokacija&select=id',
  )
  const [{ id: teacherId }] = await select<{ id: string }>(
    request,
    admin,
    'profiles?email=eq.ana.nikolic@example.test&select=id',
  )
  const [{ id: subjectId }] = await select<{ id: string }>(
    request,
    admin,
    'subjects?name=eq.Matematika&select=id',
  )
  // every slot a test publishes is listed here, so the cleanup finds it wherever it is
  const slots: string[] = []
  return { admin, ana, nameB, nameC, b, c, main, teacherId, subjectId, slots }
}

async function tearDown(request: APIRequestContext, world: Awaited<ReturnType<typeof setUp>>) {
  // free slots still to come are deleted through the API (also the ones the test could not clean up itself)
  const found = await select<{ id: string }>(
    request,
    world.ana,
    `lessons?select=id&location_id=in.(${world.b},${world.c})`,
  )
  for (const id of new Set([...world.slots, ...found.map((slot) => slot.id)])) {
    await request.delete(`${localEnv().url}/rest/v1/lessons?id=eq.${id}`, {
      headers: { apikey: localEnv().key, Authorization: `Bearer ${world.ana}` },
    })
  }
  await rpc(request, world.admin, 'set_teacher_locations', {
    p_teacher_id: world.teacherId,
    p_location_ids: [world.main],
  })
  sql(`delete from public.locations where id in ('${world.b}', '${world.c}')`)
}

test.describe('where a teacher may teach', () => {
  test('the administrator cannot take a location away while there is a free slot there, and sees which', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const run = Date.now().toString(36)
    const world = await setUp(request, run)
    try {
      await signInAs(page, 'Admin')
      await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link', { name: 'Nastavnici' })
        .click()

      // give Ana the second location, through the screen
      await row(page, 'ana.nikolic@example.test').getByRole('button', { name: 'Lokacije' }).click()
      const places = dialog(page, 'Lokacije nastavnika Ana Nikolić')
      await expect(places.getByRole('checkbox', { name: 'Glavna lokacija' })).toBeChecked()
      await expect(places.getByRole('checkbox', { name: world.nameB })).not.toBeChecked()
      await places.getByRole('checkbox', { name: world.nameB }).check()
      await places.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Lokacije su sačuvane.')
      await expect(row(page, 'ana.nikolic@example.test')).toContainText(world.nameB)

      // Ana publishes a free slot there
      const start = fullHourAhead(60)
      const published = await publishSlot(request, world.ana, {
        ...world,
        locationId: world.b,
        start,
      })
      expect(published.ok(), await published.text()).toBe(true)
      const [{ id: slotId }] = (await published.json()) as { id: string }[]
      world.slots.push(slotId)

      // now the location cannot be taken away: the screen lists the slot and nothing changes
      await row(page, 'ana.nikolic@example.test').getByRole('button', { name: 'Lokacije' }).click()
      await places.getByRole('checkbox', { name: world.nameB }).uncheck()
      await places.getByRole('button', { name: 'Sačuvaj' }).click()
      const refusal = places.getByRole('alert')
      await expect(refusal).toContainText('nastavnik još ima buduće časove i slobodne termine')
      await expect(refusal.getByRole('listitem')).toHaveCount(1)
      await expect(refusal.getByRole('listitem')).toContainText(`${world.nameB} · slobodan termin`)
      expect(
        await select(
          request,
          world.admin,
          `teacher_locations?teacher_id=eq.${world.teacherId}&location_id=eq.${world.b}`,
        ),
      ).toHaveLength(1)

      // once the slot is gone it works
      await deleteLesson(request, world.ana, slotId)
      await places.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Lokacije su sačuvane.')
      await expect(row(page, 'ana.nikolic@example.test')).not.toContainText(world.nameB)
    } finally {
      await tearDown(request, world)
    }
  })

  test('the calendar of a teacher filters by location, and the forms offer only their own', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const run = Date.now().toString(36)
    const world = await setUp(request, run)
    try {
      await rpc(request, world.admin, 'set_teacher_locations', {
        p_teacher_id: world.teacherId,
        p_location_ids: [world.main, world.b],
      })
      const atMain = fullHourAhead(36)
      const atB = new Date(atMain.getTime() + 2 * 3_600_000)
      for (const [locationId, start] of [
        [world.main, atMain],
        [world.b, atB],
      ] as const) {
        const response = await publishSlot(request, world.ana, { ...world, locationId, start })
        expect(response.ok(), await response.text()).toBe(true)
        world.slots.push(((await response.json()) as { id: string }[])[0].id)
      }

      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const filter = page.getByLabel('Prikaz po lokaciji')
      await expect(filter).toBeVisible()
      const options = await filter.locator('option').allTextContents()
      expect(options).toContain('Sve lokacije')
      expect(options).toContain('Glavna lokacija')
      expect(options).toContain(world.nameB)
      expect(options).not.toContain(world.nameC) // a location Ana may not use is not offered

      const slotMain = block(page, 'slot', atMain)
      const slotB = block(page, 'slot', atB)
      await shown(page, slotMain)
      await expect(slotMain.first()).toBeAttached()
      await expect(slotB.first()).toBeAttached()

      await filter.selectOption({ label: world.nameB })
      await expect(slotMain).toHaveCount(0)
      await expect(slotB.first()).toBeAttached()

      await filter.selectOption({ label: 'Glavna lokacija' })
      await expect(slotB).toHaveCount(0)
      await expect(slotMain.first()).toBeAttached()

      await filter.selectOption({ label: 'Sve lokacije' })
      await expect(slotMain.first()).toBeAttached()
      await expect(slotB.first()).toBeAttached()

      // the forms offer the same places, and no other
      await page.getByRole('button', { name: 'Novi čas' }).click()
      const lesson = dialog(page, 'Novi čas')
      const places = await lesson.getByLabel('Lokacija').locator('option').allTextContents()
      expect(places).toContain('Glavna lokacija')
      expect(places).toContain(world.nameB)
      expect(places).not.toContain(world.nameC)
      await lesson.getByRole('button', { name: 'Odustani' }).click()
    } finally {
      await tearDown(request, world)
    }
  })

  test('the database refuses a slot at a location the teacher may not use, whoever asks', async ({
    request,
  }) => {
    const run = Date.now().toString(36)
    const world = await setUp(request, run)
    try {
      const refused = await publishSlot(request, world.ana, {
        ...world,
        locationId: world.c,
        start: fullHourAhead(48),
      })
      expect(refused.status()).toBe(400)
      expect(await refused.json()).toMatchObject({
        message: 'the teacher may not hold lessons at this location',
      })
      expect(
        await select(request, world.ana, `lessons?location_id=eq.${world.c}&select=id`),
      ).toEqual([])

      // and a teacher cannot give themselves a location
      const { url, key } = localEnv()
      const grant = await request.post(`${url}/rest/v1/teacher_locations`, {
        headers: { apikey: key, Authorization: `Bearer ${world.ana}` },
        data: { teacher_id: world.teacherId, location_id: world.c },
      })
      expect(grant.status()).toBe(403)
    } finally {
      await tearDown(request, world)
    }
  })
})
