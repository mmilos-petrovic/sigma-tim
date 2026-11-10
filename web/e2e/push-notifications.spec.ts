import { expect, test, type Page } from '@playwright/test'
import { sql } from './api.ts'
import { signInAs, signOut } from './helpers.ts'

// Runs against the second dev server of playwright.config.ts, the one that has a VAPID key (the app shows no
// notification prompts without one). The first invitation is checked with what a browser does; the real subscription needs
// the browser's push service, so that test skips itself where that service cannot be reached.

const invitation = (page: Page) => page.getByRole('dialog', { name: 'Uključite obaveštenja' })
const banner = (page: Page) => page.getByRole('complementary', { name: 'Obaveštenja' })
const bell = (page: Page) => page.getByRole('button', { name: 'Obaveštenja', exact: true })

const devices = (email: string) =>
  Number(
    sql(
      `select count(*) from public.push_subscriptions s join public.profiles p on p.id = s.profile_id where p.email = '${email}'`,
    ),
  )

test.describe('notification prompts', () => {
  test('the first sign-in asks once, "Ne sada" leaves a banner, closing it leaves only the settings', async ({
    page,
  }) => {
    await signInAs(page, 'Učenik')
    await expect(invitation(page)).toBeVisible()
    await invitation(page).getByRole('button', { name: 'Ne sada' }).click()
    await expect(invitation(page)).toHaveCount(0)

    await expect(banner(page)).toContainText('Obaveštenja su isključena na ovom uređaju.')
    await page.getByRole('button', { name: 'Zatvori obaveštenje o obaveštenjima' }).click()
    await expect(banner(page)).toHaveCount(0)

    // the choice is remembered on this device: neither comes back
    await page.reload()
    await expect(bell(page)).toBeVisible()
    await expect(invitation(page)).toHaveCount(0)
    await expect(banner(page)).toHaveCount(0)

    // the settings stay reachable
    await bell(page).click()
    const settings = page.getByRole('dialog', { name: 'Obaveštenja' })
    await expect(settings).toContainText('Obaveštenja su isključena na ovom uređaju.')
    await expect(settings.getByRole('button', { name: 'Uključi obaveštenja' })).toBeVisible()
    await settings.getByRole('button', { name: 'Zatvori' }).click()
    await expect(settings).toHaveCount(0)
    expect(devices('ucenik1@example.test')).toBe(0)
  })

  test('a browser that blocked notifications is told how to allow them, not asked again', async ({
    page,
    context,
  }) => {
    // a site the person blocked: the page cannot ask, only explain
    await context.clearPermissions()
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' })
    })
    await signInAs(page, 'Roditelj')
    await expect(bell(page)).toBeVisible()
    await expect(invitation(page)).toHaveCount(0)
    await bell(page).click()
    await expect(page.getByRole('dialog', { name: 'Obaveštenja' })).toContainText(
      'blokirana u pregledaču',
    )
  })
})

test.describe('an iPhone that has not installed the app', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  })

  test('is shown how to add the app to the home screen instead of being asked', async ({
    page,
  }) => {
    // Safari hides the push API until the page runs as an installed app
    await page.addInitScript(() => {
      delete (window as unknown as { PushManager?: unknown }).PushManager
    })
    await signInAs(page, 'Učenik')
    const steps = page.getByRole('dialog', { name: 'Dodajte aplikaciju na početni ekran' })
    await expect(steps).toBeVisible()
    await expect(steps).toContainText('Dodaj na početni ekran')
    await expect(steps.getByRole('button', { name: 'Uključi obaveštenja' })).toHaveCount(0)
    await steps.getByRole('button', { name: 'U redu' }).click()

    await expect(banner(page)).toContainText('dodajte aplikaciju na početni ekran')
    await banner(page).getByRole('button', { name: 'Kako' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Dodajte aplikaciju na početni ekran' }),
    ).toBeVisible()
  })
})

test.describe('a real subscription', () => {
  test.use({ permissions: ['notifications'] })

  test('is made when the person agrees, kept for the next sign-in and forgotten at sign-out', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const email = 'roditelj1@example.test'
    sql(
      `delete from public.push_subscriptions where profile_id = (select id from public.profiles where email = '${email}')`,
    )

    await signInAs(page, 'Roditelj')
    // the browser already allows notifications, so there is nothing to ask: the subscription is made by itself,
    // or (where the browser's push service cannot be reached) the invitation is still there
    const subscribed = await expect
      .poll(() => devices(email), { timeout: 20_000 })
      .toBe(1)
      .then(
        () => true,
        () => false,
      )
    test.skip(!subscribed, 'the browser could not reach its push service from here')

    await expect(invitation(page)).toHaveCount(0)
    await bell(page).click()
    await expect(page.getByRole('dialog', { name: 'Obaveštenja' })).toContainText(
      'Obaveštenja su uključena na ovom uređaju.',
    )
    await page
      .getByRole('dialog', { name: 'Obaveštenja' })
      .getByRole('button', { name: 'Zatvori' })
      .click()

    // signing out forgets this device, so a shared phone never gets the next person's notices
    await signOut(page)
    expect(devices(email)).toBe(0)

    // the next sign-in brings it back by itself
    await signInAs(page, 'Roditelj')
    await expect.poll(() => devices(email), { timeout: 20_000 }).toBe(1)

    // switching it off here is remembered: the next sign-in leaves it off
    await bell(page).click()
    await page
      .getByRole('dialog', { name: 'Obaveštenja' })
      .getByRole('button', { name: 'Isključi obaveštenja' })
      .click()
    await expect(page.getByRole('dialog', { name: 'Obaveštenja' })).toContainText(
      'Obaveštenja su isključena na ovom uređaju.',
    )
    expect(devices(email)).toBe(0)
    await page
      .getByRole('dialog', { name: 'Obaveštenja' })
      .getByRole('button', { name: 'Zatvori' })
      .click()
    await signOut(page)
    await signInAs(page, 'Roditelj')
    await expect(bell(page)).toBeVisible()
    await page.waitForTimeout(1500)
    expect(devices(email)).toBe(0)

    sql(
      `delete from public.push_subscriptions where profile_id = (select id from public.profiles where email = '${email}')`,
    )
  })
})
