import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Settings written by `npm run dev:setup` into web/.env.local. */
export function localEnv() {
  const file = join(import.meta.dirname, '..', '.env.local')
  if (!existsSync(file))
    throw new Error('web/.env.local is missing: run `npm run dev` (or `npm run dev:setup`) first.')
  const values: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) values[match[1]] = match[2]
  }
  return { url: values.VITE_SUPABASE_URL, key: values.VITE_SUPABASE_PUBLISHABLE_KEY }
}

export async function signInAs(page: Page, label: string) {
  await page.goto('/prijava')
  await page.getByRole('button', { name: label, exact: true }).click()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Odjavi se' }).click()
  await expect(page.getByRole('heading', { name: 'Prijava', level: 1 })).toBeVisible()
}

/** The access token the app is holding, to ask the API what this account can read. */
export async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((k) => /^sb-.*-auth-token$/.test(k))
    return key
      ? (JSON.parse(window.localStorage.getItem(key) ?? 'null')?.access_token as string | undefined)
      : undefined
  })
  if (!token) throw new Error('Not signed in: no session in local storage')
  return token
}

export async function readable(
  request: APIRequestContext,
  token: string,
  table: string,
  column: string,
): Promise<string[]> {
  const { url, key } = localEnv()
  const response = await request.get(`${url}/rest/v1/${table}?select=${column}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `${table} should be readable`).toBe(true)
  const rows = (await response.json()) as Record<string, string>[]
  return rows.map((row) => row[column]).sort()
}
