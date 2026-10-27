import { expect, type APIRequestContext } from '@playwright/test'
import { localEnv } from './helpers.ts'

/** Talks to the local stack the way the app's own session would: as a signed-in dev account, through RLS. */
export async function tokenFor(request: APIRequestContext, email: string): Promise<string> {
  const { url, key, password } = localEnv()
  const response = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email, password },
  })
  expect(response.ok(), `signing in as ${email}`).toBe(true)
  return ((await response.json()) as { access_token: string }).access_token
}

export async function rpc<T = unknown>(
  request: APIRequestContext,
  token: string,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { url, key } = localEnv()
  const response = await request.post(`${url}/rest/v1/rpc/${name}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    data: body,
  })
  expect(response.ok(), `${name}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

export async function select<T = Record<string, unknown>>(
  request: APIRequestContext,
  token: string,
  query: string,
): Promise<T[]> {
  const { url, key } = localEnv()
  const response = await request.get(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `GET ${query}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T[]
}

/** Object names stored under a prefix of the location-photos bucket. */
export async function storedPhotos(
  request: APIRequestContext,
  token: string,
  prefix: string,
): Promise<string[]> {
  const { url, key } = localEnv()
  const response = await request.post(`${url}/storage/v1/object/list/location-photos`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    data: { prefix, limit: 20 },
  })
  expect(response.ok(), 'listing the bucket').toBe(true)
  return ((await response.json()) as { name: string }[]).map((object) => object.name)
}
