import { expect, test, type APIRequestContext } from '@playwright/test'
import { select, sql, tokenFor } from './api.ts'
import { localEnv, signInAs } from './helpers.ts'

// The numbers of the seeded people (supabase/seed.sql): Ana (teacher) 03, Luka (her student) 06, Jelena (his parent) 05.
const ANA = 'ana.nikolic@example.test'
const ANA_PHONE = '+381600000003'
const LUKA = 'ucenik1@example.test'
const JELENA = 'roditelj1@example.test'
const NIKOLA = 'admin.nastavnik@example.test' // an administrator who teaches: a colleague of Ana's
const MARKO = 'marko.jovanovic@example.test' // another teacher

const menu = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name }).click()

const restoreAna = () =>
  sql(`
    insert into public.person_phones (profile_id, phone)
    select id, '${ANA_PHONE}' from public.profiles where email = '${ANA}'
    on conflict (profile_id) do update set phone = excluded.phone`)

/** The e-mail addresses of the people whose number this account can read. */
async function whoseNumbers(request: APIRequestContext, token: string): Promise<string[]> {
  const rows = await select<{ profile: { email: string } }>(
    request,
    token,
    'person_phones?select=phone,profile:profiles(email)',
  )
  return rows.map((row) => row.profile.email)
}

test.describe('phone numbers', () => {
  test("a teacher's own number: shown, checked, changed, and never emptied", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    const ana = await tokenFor(request, ANA)
    try {
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      await menu(page, 'Podešavanja')
      const field = page.getByLabel('Broj telefona')
      const save = page.getByRole('button', { name: 'Sačuvaj broj' })
      await expect(field).toHaveValue('060 0000 003') // the number as it is written at home
      await expect(save).toBeDisabled()

      await field.fill('381 64 555 0001') // no + and no 0: the country cannot be guessed
      await save.click()
      await expect(page.getByRole('alert')).toContainText('Broj telefona nije ispravan')
      await field.fill('')
      await save.click()
      await expect(page.getByRole('alert')).toHaveText('Unesite broj telefona.')

      await field.fill('064 555 0001') // typed the way it is written at home
      await save.click()
      await expect(page.getByText('Broj telefona je sačuvan.')).toBeVisible()
      const [stored] = await select<{ phone: string }>(
        request,
        ana,
        `person_phones?select=phone&profile_id=eq.${await profileId(request, ana, ANA)}`,
      )
      expect(stored.phone).toBe('+381645550001')
    } finally {
      restoreAna()
    }
  })

  test('a teacher without a number is reminded on the schedule until they give one', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    const ana = await tokenFor(request, ANA)
    try {
      sql(
        `delete from public.person_phones where profile_id = (select id from public.profiles where email = '${ANA}')`,
      )
      expect(await whoseNumbers(request, ana)).not.toContain(ANA)

      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const note = page.getByRole('note')
      await expect(note).toContainText('Nemate upisan broj telefona.')
      await note.getByRole('link', { name: 'Podešavanja' }).click()
      await expect(page.getByText('Nemate upisan broj telefona.').first()).toBeVisible()

      await page.getByLabel('Broj telefona').fill('+381 64 555 0002')
      await page.getByRole('button', { name: 'Sačuvaj broj' }).click()
      await expect(page.getByText('Broj telefona je sačuvan.')).toBeVisible()

      await menu(page, 'Raspored')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      await expect(page.getByRole('note')).toHaveCount(0)
    } finally {
      restoreAna()
    }
  })

  test('who can read whose number, against the real database', async ({ request }) => {
    const admin = await tokenFor(request, 'admin@example.test')
    const ana = await tokenFor(request, ANA)
    const luka = await tokenFor(request, LUKA)
    const jelena = await tokenFor(request, JELENA)
    const stranger = await tokenFor(request, 'stranac@example.test')

    // the administrator reads all of them
    const everyone = await whoseNumbers(request, admin)
    for (const email of [ANA, LUKA, JELENA, NIKOLA, MARKO]) expect(everyone).toContain(email)

    // a teacher: their own, their students', those students' parents'; not a colleague's
    const teacher = await whoseNumbers(request, ana)
    for (const email of [ANA, LUKA, JELENA]) expect(teacher).toContain(email)
    for (const email of [NIKOLA, MARKO]) expect(teacher).not.toContain(email)

    // a student: their own and their teacher's, not their parent's
    const student = await whoseNumbers(request, luka)
    expect(student.sort()).toEqual([ANA, LUKA].sort())

    // a parent: their own, their children's, their children's teachers'
    const parent = await whoseNumbers(request, jelena)
    for (const email of [JELENA, LUKA, ANA]) expect(parent).toContain(email)
    for (const email of [NIKOLA, MARKO]) expect(parent).not.toContain(email)

    // a Google account without a profile reads nothing
    expect(await whoseNumbers(request, stranger)).toEqual([])
  })

  test('the database refuses what it should, whoever asks', async ({ request }) => {
    const admin = await tokenFor(request, 'admin@example.test')
    const ana = await tokenFor(request, ANA)
    const luka = await tokenFor(request, LUKA)
    const { url, key } = localEnv()
    const anaId = await profileId(request, admin, ANA)
    const lukaId = await profileId(request, admin, LUKA)
    const nikolaId = await profileId(request, admin, NIKOLA)
    const call = (token: string, id: string, phone: string | null) =>
      request.post(`${url}/rest/v1/rpc/set_person_phone`, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        data: { p_profile_id: id, p_phone: phone },
      })

    // writing is only through the function
    const direct = await request.post(`${url}/rest/v1/person_phones`, {
      headers: { apikey: key, Authorization: `Bearer ${ana}` },
      data: { profile_id: anaId, phone: '+381645550009' },
    })
    expect(direct.status()).toBe(403)

    // a number that is not one
    const invalid = await call(ana, anaId, '064 555 0001')
    expect(invalid.status()).toBe(400)
    expect(await invalid.json()).toMatchObject({ message: 'invalid phone number' })

    // a teacher keeps theirs
    const emptied = await call(ana, anaId, '')
    expect(emptied.status()).toBe(409)
    expect(await emptied.json()).toMatchObject({
      message: 'a teacher or parent needs a phone number',
    })

    // a colleague's number is not theirs to change, and a student does not change their teacher's
    expect((await call(ana, nikolaId, '+381645550010')).status()).toBe(403)
    expect((await call(luka, anaId, '+381645550010')).status()).toBe(403)

    // a student of theirs is: set, and taken away again (a student needs none)
    expect((await call(ana, lukaId, '+381 64 555 0011')).ok()).toBe(true)
    expect(await whoseNumbers(request, luka)).toContain(LUKA)
    expect((await call(ana, lukaId, '')).ok()).toBe(true)
    expect(await whoseNumbers(request, luka)).not.toContain(LUKA)
    sql(`
      insert into public.person_phones (profile_id, phone)
      select id, '+381600000006' from public.profiles where email = '${LUKA}'
      on conflict (profile_id) do nothing`)
  })
})

async function profileId(
  request: APIRequestContext,
  token: string,
  email: string,
): Promise<string> {
  const [row] = await select<{ id: string }>(request, token, `profiles?select=id&email=eq.${email}`)
  return row.id
}
