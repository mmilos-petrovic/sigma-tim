import { expect, test, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { localEnv, signInAs } from './helpers.ts'

// The main administrator makes a teacher an administrator and takes that away again; another administrator cannot do that
// and cannot change the account of an administrator. Against the local stack: "Admin" is the main administrator,
// "Admin i nastavnik" an ordinary one, and Miloš Petrović (petrovicmilos@gmail.com) an administrator who teaches.

const MAIN = 'admin@example.test'
const ORDINARY = 'admin.nastavnik@example.test'
const OWNER = 'petrovicmilos@gmail.com'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })

async function openTeachers(page: Page, persona: string) {
  await signInAs(page, persona)
  // an administrator who also teaches is asked which side to open, or lands on the side used last
  const chooser = page.getByRole('heading', { name: 'Izaberite prikaz' })
  const switcher = page.getByRole('navigation', { name: 'Izbor prikaza' })
  const administration = page.getByRole('heading', { name: 'Administracija', level: 1 })
  await expect(chooser.or(switcher).or(administration)).toBeVisible()
  if (await chooser.isVisible()) {
    await page.getByRole('main').getByRole('link', { name: 'Administracija' }).click()
  } else if (await switcher.isVisible()) {
    await switcher.getByRole('link', { name: 'Administracija' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Administracija', level: 1 })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('link', { name: 'Nastavnici' })
    .click()
  await expect(page.getByRole('heading', { name: 'Nastavnici', level: 1 })).toBeVisible()
}

const isAdmin = (email: string) =>
  sql(`select is_admin from public.profiles where email = '${email}'`) === 't'

test.describe('administrators', () => {
  test.use({ actionTimeout: 15_000 })

  test('the main administrator makes a teacher an administrator and takes it away again', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const run = Date.now().toString(36)
    const email = `e2e-roles-${run}@example.test`
    const main = await tokenFor(request, MAIN)
    const [math] = await select<{ id: string }>(
      request,
      main,
      'subjects?name=eq.Matematika&select=id',
    )
    const [location] = await select<{ id: string }>(
      request,
      main,
      'locations?name=eq.Glavna lokacija&select=id',
    )
    const teacherId = await rpc<string>(request, main, 'create_teacher', {
      p_email: email,
      p_first_name: 'E2E',
      p_last_name: `Uloge${run}`,
      p_subject_ids: [math.id],
      p_location_ids: [location.id],
      p_phone: '+381641234567',
    })

    try {
      await openTeachers(page, 'Admin')
      const mine = row(page, email)
      await expect(mine).toBeVisible()
      await expect(mine.getByText('Administrator', { exact: true })).toHaveCount(0)

      await mine.getByRole('button', { name: 'Postavi za administratora' }).click()
      const grant = dialog(page, 'Novi administrator')
      await expect(grant).toContainText(`Uloge${run}`)
      await grant.getByRole('button', { name: 'Postavi za administratora' }).click()
      await expect(page.getByRole('status')).toHaveText('Nastavnik je postao administrator.')
      await expect(mine.getByText('Administrator', { exact: true })).toBeVisible()
      expect(isAdmin(email)).toBe(true)
      await expect(mine.getByRole('button', { name: 'Postavi za administratora' })).toHaveCount(0)

      // the owner is an administrator who teaches too: the role can be taken from them as well, but here we leave them be
      await expect(
        row(page, 'Miloš Petrović').getByRole('button', { name: 'Ukloni administratora' }),
      ).toBeVisible()

      await mine.getByRole('button', { name: 'Ukloni administratora' }).click()
      await dialog(page, 'Uklanjanje administratora')
        .getByRole('button', { name: 'Ukloni administratora' })
        .click()
      await expect(page.getByRole('status')).toHaveText(
        'Administrator je uklonjen. Osoba je i dalje nastavnik.',
      )
      await expect(mine.getByText('Administrator', { exact: true })).toHaveCount(0)
      expect(isAdmin(email)).toBe(false)
      expect(
        sql(
          `select count(*) from public.teachers t join public.profiles p on p.id = t.profile_id where p.email = '${email}'`,
        ),
      ).toBe('1')
    } finally {
      // never taught, so the account goes completely
      await rpc(request, main, 'erase_teacher', { p_teacher_id: teacherId }).catch(() => undefined)
      sql(
        `delete from public.profiles where email = '${email}' and not exists (select 1 from public.lessons l where l.teacher_id = profiles.id)`,
      )
    }
  })

  test('another administrator can do neither, and cannot change the account of an administrator', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const ordinary = await tokenFor(request, ORDINARY)
    const { url, key } = localEnv()
    const call = (name: string, body: Record<string, unknown>) =>
      request.post(`${url}/rest/v1/rpc/${name}`, {
        headers: { apikey: key, Authorization: `Bearer ${ordinary}` },
        data: body,
      })
    const [owner] = await select<{ id: string }>(
      request,
      ordinary,
      `profiles?email=eq.${OWNER}&select=id`,
    )
    const emailBefore = sql(`select email from public.profiles where id = '${owner.id}'`)

    await openTeachers(page, 'Admin i nastavnik')
    const ownerRow = row(page, 'Miloš Petrović')
    await expect(ownerRow).toBeVisible()
    await expect(ownerRow.getByText('Samo glavni administrator menja ovaj nalog.')).toBeVisible()
    await expect(ownerRow.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Postavi za administratora' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ukloni administratora' })).toHaveCount(0)
    // an ordinary teacher is as editable as before, and so is this administrator's own row
    await expect(
      row(page, 'Ana Nikolić').getByRole('button', { name: 'Promeni email' }),
    ).toBeVisible()
    await expect(
      row(page, 'Nikola Đorđević').getByRole('button', { name: 'Telefon' }),
    ).toBeVisible()

    // and the database says no however it is asked
    expect((await call('grant_admin', { p_teacher_id: owner.id })).status()).toBe(403)
    expect((await call('revoke_admin', { p_profile_id: owner.id })).status()).toBe(403)
    expect(
      (
        await call('change_profile_email', {
          p_profile_id: owner.id,
          p_new_email: 'e2e-takeover@example.test',
        })
      ).status(),
    ).toBe(403)
    expect((await call('deactivate_teacher', { p_teacher_id: owner.id })).status()).toBe(403)
    expect(sql(`select email from public.profiles where id = '${owner.id}'`)).toBe(emailBefore)
    expect(sql(`select is_active from public.teachers where profile_id = '${owner.id}'`)).toBe('t')
  })
})
