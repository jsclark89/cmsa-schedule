import { useState } from 'react'

const KEY = 'cmsa.tipDismissed'

function platform() {
  const ua = navigator.userAgent || ''
  const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
  if (standalone) return null
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

/** Shown on phones only, until dismissed or the site is opened from the home screen. */
export default function HomeScreenTip() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  const p = platform()
  if (!p || hidden) return null
  const how = p === 'ios' ? <>tap the Share button <span aria-hidden="true">⬆︎</span>, then <b>Add to Home Screen</b></> : <>tap the menu <span aria-hidden="true">⋮</span>, then <b>Add to Home screen</b></>
  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* fine */
    }
    setHidden(true)
  }
  return (
    <div className="card soft tip">
      <div>
        <b>Keep your teams one tap away:</b> {how}. Your starred teams come with it.
      </div>
      <button className="iconbtn small" onClick={dismiss} aria-label="Dismiss tip">×</button>
    </div>
  )
}
