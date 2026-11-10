// Prints a new VAPID key pair for web push. Nothing is written to disk.
//   node scripts/generate-vapid-keys.mjs
//
// The PUBLIC key is not secret: it goes into the web build as VITE_VAPID_PUBLIC_KEY (Cloudflare Pages variable) and
// into the Edge Function. The PRIVATE key is a secret: it belongs only in the Edge Function secrets of the matching
// Supabase project (never in git, a chat or a build variable). Use a separate pair for staging and production.
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])

console.log('VAPID_PUBLIC_KEY=' + pub.toString('base64url'))
console.log('VAPID_PRIVATE_KEY=' + jwk.d)
