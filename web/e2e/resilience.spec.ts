import { expect, test } from '@playwright/test'
import { signInAs } from './helpers.ts'

// What the app does when things go wrong around it: the server refuses a sign-in that has run out, the page is older than
// the latest version, the connection is gone. Against the local stack, with the real Supabase client.

const EXPIRED = JSON.stringify({ code: 'PGRST301', message: 'JWT expired' })
const JSON_TYPE = 'application/json'
const scheduleHeading = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: 'Moj raspored', level: 1 })

test.describe('a session that has run out', () => {
  test('is renewed without the person noticing', async ({ page }) => {
    await signInAs(page, 'Nastavnik')
    await expect(scheduleHeading(page)).toBeVisible()

    const tokens: string[] = []
    await page.route('**/rest/v1/rpc/my_roles', async (route) => {
      tokens.push(route.request().headers()['authorization'] ?? '')
      // the first answer is "your token has run out"
      if (tokens.length === 1)
        return route.fulfill({ status: 401, contentType: JSON_TYPE, body: EXPIRED })
      return route.continue()
    })
    await page.reload()

    await expect(scheduleHeading(page)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(tokens).toHaveLength(2)
    // the second try went out with a token of its own, not the one that was refused
    expect(tokens[1]).toMatch(/^Bearer .+/)
    expect(tokens[1]).not.toBe(tokens[0])
  })

  test('that cannot be renewed ends at the sign-in page, which says so and brings the person back', async ({
    page,
  }) => {
    await signInAs(page, 'Nastavnik')
    await expect(scheduleHeading(page)).toBeVisible()

    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 400,
        contentType: JSON_TYPE,
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid Refresh Token',
        }),
      }),
    )
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ status: 401, contentType: JSON_TYPE, body: EXPIRED }),
    )

    await page
      .getByRole('navigation', { name: 'Glavna navigacija' })
      .getByRole('link', { name: 'Učenici', exact: true })
      .click()
    await expect(page).toHaveURL(/\/prijava$/)
    await expect(page.getByRole('alert')).toContainText('Sesija je istekla')

    // the server is well again: signing in brings the person back to the page they were on
    await page.unroute('**/auth/v1/token*')
    await page.unroute('**/rest/v1/**')
    await page.getByRole('button', { name: 'Nastavnik', exact: true }).click()
    await expect(page).toHaveURL(/\/moj-raspored\/ucenici$/)
  })
})

test.describe('a page older than the latest version', () => {
  const screenFile = /\/src\/pages\/ContextPage\.tsx/

  test('loads itself again, without a word, when a screen it asks for is gone', async ({
    page,
  }) => {
    await signInAs(page, 'Nastavnik')
    await expect(scheduleHeading(page)).toBeVisible()

    let asked = 0
    await page.route(screenFile, (route) => {
      asked++
      return asked === 1 ? route.abort() : route.continue()
    })
    await page.goto('/moj-raspored')

    await expect(scheduleHeading(page)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(asked).toBe(2)
  })

  test('shows the error after one reload, not a reload for ever, when it cannot load for good', async ({
    page,
  }) => {
    await signInAs(page, 'Nastavnik')
    await expect(scheduleHeading(page)).toBeVisible()

    let asked = 0
    await page.route(screenFile, (route) => {
      asked++
      return route.abort()
    })
    await page.goto('/moj-raspored')

    await expect(page.getByRole('alert')).toContainText('Došlo je do greške')
    await page.waitForTimeout(1500)
    expect(asked).toBe(2)
  })
})

test('the page says so when the connection is gone, and stops saying it when it is back', async ({
  page,
  context,
}) => {
  const banner = page.getByRole('status').filter({ hasText: 'Nema internet veze' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(banner).toHaveCount(0)

  await context.setOffline(true)
  await expect(banner).toBeVisible()

  await context.setOffline(false)
  await expect(banner).toHaveCount(0)
})
