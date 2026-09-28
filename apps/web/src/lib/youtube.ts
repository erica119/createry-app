/** Accept a pasted YouTube video URL, never arbitrary embed markup or hosts. */
export function getYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.split('/')[1]
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      const segments = url.pathname.split('/').filter(Boolean)
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else if (['shorts', 'live', 'embed'].includes(segments[0])) id = segments[1]
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

export function canonicalYouTubeUrl(value: string): string | null {
  const id = getYouTubeVideoId(value)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}
