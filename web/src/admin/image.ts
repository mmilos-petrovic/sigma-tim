import { AdminError } from './adminApi'

/** The bucket accepts at most this much per file (see the `location-photos` bucket in the database). */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_SIDE = 1600
const QUALITIES = [0.85, 0.7, 0.55]
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const PHOTO_ACCEPT = ACCEPTED_TYPES.join(',')

/** Scales down to fit `max` on the longer side, never up, and never to an empty side. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function validatePhotoFile(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new AdminError('photoType')
  if (file.size === 0) throw new AdminError('photoUnreadable')
  if (file.size > MAX_INPUT_BYTES) throw new AdminError('photoTooLarge')
}

export interface ImageDeps {
  decode: (file: File) => Promise<{ width: number; height: number; source: unknown }>
  encode: (
    source: unknown,
    width: number,
    height: number,
    mime: string,
    quality: number,
  ) => Promise<Blob | null>
}

const browserDeps: ImageDeps = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height, source: bitmap }
  },
  async encode(source, width, height, mime, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    // A PNG with transparency would turn black as a JPEG.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(source as CanvasImageSource, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
  },
}

/**
 * Prepares a picture for upload: at most 1600 px on the longer side, as a JPEG under the bucket's size limit.
 * Phone photos are several megabytes; this keeps the upload quick and the bucket small.
 */
export async function shrinkImage(file: File, deps: ImageDeps = browserDeps): Promise<Blob> {
  validatePhotoFile(file)

  let decoded
  try {
    decoded = await deps.decode(file)
  } catch {
    throw new AdminError('photoUnreadable')
  }

  const { width, height } = fitWithin(decoded.width, decoded.height, MAX_SIDE)
  for (const quality of QUALITIES) {
    const blob = await deps.encode(decoded.source, width, height, 'image/jpeg', quality)
    if (!blob) throw new AdminError('photoUnreadable')
    if (blob.size <= MAX_PHOTO_BYTES) return blob
  }
  throw new AdminError('photoStillTooLarge')
}
