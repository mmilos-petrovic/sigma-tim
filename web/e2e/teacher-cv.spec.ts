import { expect, test } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { localEnv, signInAs, signOut } from './helpers.ts'

const menu = (page: import('@playwright/test').Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('link', { name, exact: true })
    .click()

// A 1x1 PNG: the editor shrinks it to a JPEG in the browser, so this also proves that the real decoding and encoding work.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe("a teacher's CV", () => {
  test('is written, shown to a student and the photo is stored in the public bucket', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const run = Date.now().toString(36)
    const about = `E2E o meni ${run}`
    const { url } = localEnv()

    // a clean start, whatever an earlier run left
    const token = await tokenFor(request, 'ana.nikolic@example.test')
    await rpc(request, token, 'save_my_cv', {
      p_about: '',
      p_show_public: false,
      p_show_members: false,
      p_experience: [],
      p_education: [],
      p_skills: [],
    })

    await signInAs(page, 'Nastavnik')
    await menu(page, 'Moj CV')
    await expect(page.getByRole('heading', { name: 'Moj CV', level: 1 })).toBeVisible()

    await test.step('writes the CV and saves it in one step', async () => {
      await page.getByLabel('Kratak opis').fill(about)
      await page.getByRole('button', { name: 'Dodaj radno iskustvo' }).click()
      await page.getByLabel('Poslodavac').fill(`E2E škola ${run}`)
      await page.getByLabel('Pozicija').fill('Nastavnik')
      await page.getByRole('button', { name: 'Dodaj veštinu' }).click()
      await page.getByLabel('Veština 1').fill(`E2E veština ${run}`)
      await page.getByRole('checkbox', { name: /^Prijavljenim korisnicima/ }).check()
      await page.getByRole('button', { name: 'Sačuvaj CV' }).click()
      await expect(page.getByRole('status')).toHaveText('CV je sačuvan.')
    })

    await test.step('the database holds what was typed, in order', async () => {
      const [cv] = await select<{ about: string; show_members: boolean; slug: string }>(
        request,
        token,
        'teacher_cv?select=about,show_members,slug',
      )
      expect(cv).toMatchObject({ about, show_members: true })
      expect(cv?.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    })

    let photoPath = ''
    await test.step('a photo is shrunk, stored in the public bucket and shown', async () => {
      await page
        .getByLabel('Izaberi fotografiju')
        .or(page.getByLabel('Zameni fotografiju'))
        .setInputFiles({
          name: 'ja.png',
          mimeType: 'image/png',
          buffer: PIXEL,
        })
      await expect(
        page.getByRole('status').filter({ hasText: 'Fotografija je sačuvana.' }),
      ).toBeVisible()
      const [row] = await select<{ photo_path: string }>(
        request,
        token,
        'teacher_cv?select=photo_path',
      )
      photoPath = row!.photo_path
      expect(photoPath).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/)
      // anybody can load it by its address, without signing in
      const loaded = await request.get(`${url}/storage/v1/object/public/cv-photos/${photoPath}`)
      expect(loaded.status()).toBe(200)
      expect(loaded.headers()['content-type']).toContain('image/jpeg')
    })

    await test.step('what was written is still there after a reload', async () => {
      await page.reload()
      await expect(page.getByLabel('Kratak opis')).toHaveValue(about)
      await expect(page.getByLabel('Poslodavac')).toHaveValue(`E2E škola ${run}`)
      await expect(page.getByLabel('Veština 1')).toHaveValue(`E2E veština ${run}`)
      await expect(page.getByRole('checkbox', { name: /^Prijavljenim korisnicima/ })).toBeChecked()
    })

    await test.step('a student finds it in the CVs of the teachers', async () => {
      await signOut(page)
      await signInAs(page, 'Učenik')
      await page.getByRole('link', { name: 'CV nastavnika' }).click()
      await expect(page.getByRole('heading', { name: 'CV nastavnika', level: 1 })).toBeVisible()
      await page.getByRole('link', { name: new RegExp(about) }).click()
      const article = page.getByRole('article')
      await expect(article).toContainText(about)
      await expect(article).toContainText(`E2E škola ${run}`)
      await expect(article).toContainText(`E2E veština ${run}`)
      await expect(article.locator('img')).toHaveAttribute('src', new RegExp(photoPath))
    })

    await test.step('removing the photo removes the file', async () => {
      await signOut(page)
      await signInAs(page, 'Nastavnik')
      await menu(page, 'Moj CV')
      await page.getByRole('button', { name: 'Ukloni fotografiju' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Fotografija je uklonjena.' }),
      ).toBeVisible()
      const [row] = await select<{ photo_path: string | null }>(
        request,
        token,
        'teacher_cv?select=photo_path',
      )
      expect(row?.photo_path).toBeNull()
      const gone = await request.get(`${url}/storage/v1/object/public/cv-photos/${photoPath}`)
      expect(gone.ok()).toBe(false)
    })

    await test.step("hiding the CV removes it for others at once, but not for the teacher's own student", async () => {
      await page.getByRole('checkbox', { name: /^Prijavljenim korisnicima/ }).uncheck()
      await page.getByRole('button', { name: 'Sačuvaj CV' }).click()
      await expect(page.getByRole('status')).toHaveText('CV je sačuvan.')

      const slugsFor = async (email: string) =>
        (
          await rpc<{ slug: string }[]>(
            request,
            await tokenFor(request, email),
            'list_member_cvs',
            {},
          )
        ).map((cv) => cv.slug)
      const [own] = await select<{ slug: string }>(request, token, 'teacher_cv?select=slug')
      // another teacher no longer reads it
      expect(await slugsFor('admin.nastavnik@example.test')).not.toContain(own!.slug)
      // Luka is a student of this teacher: a teacher's own students always read the CV
      expect(await slugsFor('ucenik1@example.test')).toContain(own!.slug)
      // and so does a parent of such a student
      expect(await slugsFor('roditelj1@example.test')).toContain(own!.slug)
    })
  })
})
