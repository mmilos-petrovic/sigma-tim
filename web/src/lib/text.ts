/** Lower case, without diacritics (and đ as dj), so "petrovic" finds "Petrović". */
export const fold = (text: string): string =>
  text.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Every word typed is somewhere in the text, whatever the case or the diacritics. Nothing typed matches everything. */
export function containsWords(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const haystack = fold(text)
  return words.every((word) => haystack.includes(word))
}
