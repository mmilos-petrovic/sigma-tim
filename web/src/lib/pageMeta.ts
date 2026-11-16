import { useEffect } from 'react'

/** Sets a `<meta name>` and returns the way back (remove it, or put the old text back). */
function setMeta(name: string, content: string): () => void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  const created = !element
  const previous = element?.content ?? ''
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.appendChild(element)
  }
  element.content = content
  const meta = element
  return () => {
    if (created) meta.remove()
    else meta.content = previous
  }
}

/**
 * The title, description and indexing rule of the page that is open, put back when it closes. A page that should not
 * show up in search results says so with `noindex`. (The pages that are prerendered carry the same in their HTML.)
 */
export function usePageMeta({
  title,
  description,
  noindex = false,
}: {
  title: string
  description?: string
  noindex?: boolean
}) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    const undo = [
      description ? setMeta('description', description) : null,
      noindex ? setMeta('robots', 'noindex') : null,
    ]
    return () => {
      document.title = previousTitle
      for (const back of undo) back?.()
    }
  }, [title, description, noindex])
}
