import { describe, expect, it, vi } from 'vitest'
import { AdminError } from './adminApi'
import { fitWithin, MAX_PHOTO_BYTES, shrinkImage, validatePhotoFile } from './image'

const file = (type: string, size = 1000, name = 'photo') =>
  new File([new Uint8Array(size)], name, { type })

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error instanceof AdminError ? error.code : 'not an AdminError'
  }
  return null
}

describe('fitWithin', () => {
  it('shrinks the longer side to the limit and keeps the proportions', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(3000, 3000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never enlarges', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never produces an empty side', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 })
  })
})

describe('validatePhotoFile', () => {
  it('accepts JPEG, PNG and WebP', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(codeOf(() => validatePhotoFile(file(type)))).toBeNull()
    }
  })

  it('refuses other types', () => {
    for (const type of ['image/gif', 'image/heic', 'application/pdf', 'text/plain', '']) {
      expect(codeOf(() => validatePhotoFile(file(type)))).toBe('photoType')
    }
  })

  it('refuses a file over 20 MB, and an empty one', () => {
    expect(codeOf(() => validatePhotoFile(file('image/jpeg', 20 * 1024 * 1024 + 1)))).toBe(
      'photoTooLarge',
    )
    expect(codeOf(() => validatePhotoFile(file('image/jpeg', 20 * 1024 * 1024)))).toBeNull()
    expect(codeOf(() => validatePhotoFile(file('image/jpeg', 0)))).toBe('photoUnreadable')
  })
})

describe('shrinkImage', () => {
  const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })

  it('decodes, scales to 1600 px and encodes as JPEG', async () => {
    const decode = vi.fn(async () => ({ width: 4000, height: 3000, source: 'bitmap' }))
    const encode = vi.fn(async () => blobOf(300_000))

    const result = await shrinkImage(file('image/png'), { decode, encode })

    expect(decode).toHaveBeenCalledOnce()
    expect(encode).toHaveBeenCalledWith('bitmap', 1600, 1200, 'image/jpeg', 0.85)
    expect(result.size).toBe(300_000)
  })

  it('tries a lower quality when the first result is still too big', async () => {
    const decode = async () => ({ width: 2000, height: 2000, source: 'bitmap' })
    const encode = vi
      .fn<
        (
          source: unknown,
          w: number,
          h: number,
          mime: string,
          quality: number,
        ) => Promise<Blob | null>
      >()
      .mockResolvedValueOnce(blobOf(MAX_PHOTO_BYTES + 1))
      .mockResolvedValueOnce(blobOf(MAX_PHOTO_BYTES - 1))

    const result = await shrinkImage(file('image/jpeg'), { decode, encode })

    expect(encode.mock.calls.map((call) => call[4])).toEqual([0.85, 0.7])
    expect(result.size).toBe(MAX_PHOTO_BYTES - 1)
  })

  it('gives up with a clear error when it cannot get under the limit', async () => {
    const decode = async () => ({ width: 2000, height: 2000, source: 'bitmap' })
    const encode = vi.fn(async () => blobOf(MAX_PHOTO_BYTES + 1))
    await expect(shrinkImage(file('image/jpeg'), { decode, encode })).rejects.toMatchObject({
      code: 'photoStillTooLarge',
    })
    expect(encode).toHaveBeenCalledTimes(3)
  })

  it('reports a file that cannot be decoded', async () => {
    const decode = async () => {
      throw new Error('bad image')
    }
    await expect(
      shrinkImage(file('image/jpeg'), { decode, encode: async () => null }),
    ).rejects.toMatchObject({
      code: 'photoUnreadable',
    })
  })

  it('reports an encoder that returns nothing', async () => {
    const decode = async () => ({ width: 100, height: 100, source: 'bitmap' })
    await expect(
      shrinkImage(file('image/jpeg'), { decode, encode: async () => null }),
    ).rejects.toMatchObject({
      code: 'photoUnreadable',
    })
  })

  it('refuses a wrong type before decoding anything', async () => {
    const decode = vi.fn()
    await expect(
      shrinkImage(file('application/pdf'), { decode, encode: vi.fn() }),
    ).rejects.toMatchObject({
      code: 'photoType',
    })
    expect(decode).not.toHaveBeenCalled()
  })
})
