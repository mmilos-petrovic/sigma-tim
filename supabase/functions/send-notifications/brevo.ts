// Sends an email through Brevo's transactional API. `fetch` is handed in, so the answers can be tested.
import type { Email, EmailResult, EmailSender } from './types.ts'

export interface BrevoSettings {
  apiKey: string
  sender: { email: string; name: string }
}

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 10000

async function reason(response: Response): Promise<string> {
  try {
    const body = await response.text()
    try {
      const message = (JSON.parse(body) as { message?: unknown }).message
      if (typeof message === 'string' && message) return message.slice(0, 200)
    } catch {
      // not JSON: quote what there is
    }
    return body.slice(0, 200)
  } catch {
    return ''
  }
}

export function createEmailSender(
  settings: BrevoSettings | null,
  fetchFn: typeof fetch,
): EmailSender {
  return {
    async send(email: Email): Promise<EmailResult> {
      if (!settings) return { kind: 'failed', error: 'Brevo API ključ nije podešen' }

      let response: Response
      try {
        response = await fetchFn(ENDPOINT, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': settings.apiKey,
          },
          body: JSON.stringify({
            sender: settings.sender,
            to: [email.to],
            subject: email.subject,
            textContent: email.text,
            htmlContent: email.html,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        return {
          kind: 'failed',
          error: `Brevo nije dostupan: ${(error as Error).message}`,
        }
      }

      if (response.status >= 200 && response.status < 300) return { kind: 'sent' }
      const detail = await reason(response)
      const error = `Brevo je odgovorio ${response.status}${detail ? `: ${detail}` : ''}`
      // 402: the plan's allowance is used up; 429: too many calls. Both pass when the day or the minute does.
      if (response.status === 402 || response.status === 429) return { kind: 'limit', error }
      // a wrong key or a blocked address is for the owner to fix, not for the notice: it is tried again
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        return { kind: 'failed', error }
      }
      return { kind: 'rejected', error }
    },
  }
}
