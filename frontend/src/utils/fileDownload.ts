export interface DownloadPayload {
  blob: Blob
  filename: string
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

export function parseDownloadFilename(header: string | null, fallback: string): string {
  if (!header) return fallback
  const utf8 = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(unquote(utf8))
    } catch {
      return unquote(utf8)
    }
  }
  return unquote(header.match(/filename\s*=\s*([^;]+)/i)?.[1] ?? fallback) || fallback
}

async function downloadError(response: Response): Promise<string> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = await response.json() as { detail?: unknown; message?: unknown }
      const message = body.detail ?? body.message
      if (typeof message === 'string' && message.trim()) return message
    } catch {
      // 回落到状态码文案。
    }
  }
  return `导出失败（HTTP ${response.status}）`
}

export async function fetchDownload(
  url: string,
  fallbackFilename: string,
  fetchImpl: FetchLike = fetch,
): Promise<DownloadPayload> {
  const response = await fetchImpl(url, {
    credentials: 'include',
    headers: { Accept: '*/*' },
  })
  if (!response.ok) throw new Error(await downloadError(response))
  return {
    blob: await response.blob(),
    filename: parseDownloadFilename(response.headers.get('Content-Disposition'), fallbackFilename),
  }
}

export async function downloadFile(url: string, fallbackFilename: string): Promise<string> {
  const payload = await fetchDownload(url, fallbackFilename)
  const objectUrl = URL.createObjectURL(payload.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = payload.filename
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  return payload.filename
}
