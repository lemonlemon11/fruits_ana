const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'IMG',
])

const ALLOWED_ATTRS = new Set(['href', 'target', 'rel', 'src', 'alt', 'width', 'height'])

export function sanitizeNotificationHtml(html: string): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('*').forEach((node) => {
    const element = node as HTMLElement
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      return
    }
    Array.from(element.attributes).forEach((attr) => {
      if (!ALLOWED_ATTRS.has(attr.name)) element.removeAttribute(attr.name)
    })
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || ''
      if (!/^(https?:\/\/|mailto:)/i.test(href)) element.removeAttribute('href')
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    }
    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src') || ''
      if (!/^(https?:\/\/|data:image\/)/i.test(src)) element.removeAttribute('src')
      element.setAttribute('alt', element.getAttribute('alt') || '')
    }
  })

  return template.innerHTML
}

export function notificationPlainText(html: string): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html
  const text = (template.content.textContent || '').replace(/\s+/g, ' ').trim()
  const imageCount = template.content.querySelectorAll('img').length
  if (!imageCount) return text
  const imageLabel = imageCount === 1 ? '[图片]' : `[${imageCount} 张图片]`
  return [text, imageLabel].filter(Boolean).join(' ')
}
