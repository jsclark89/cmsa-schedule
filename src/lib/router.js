import { useEffect, useState } from 'react'

// Hash routing so the same static build works on GitHub Pages, Vercel or a USB stick.
// #/team/117130593  #/division/116934220  #/venue/107091227  #/day/2026-10-18  #/changes  #/

export function parseHash(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  return { page: parts[0] || 'home', id: parts[1] || null, parts }
}

export function useRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parseHash(hash)
}

export const href = (...parts) => '#/' + parts.map(encodeURIComponent).join('/')

export function navigate(to) {
  window.location.hash = to
}

export function back(fallback = '#/') {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}
