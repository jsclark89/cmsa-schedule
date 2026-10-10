import { useEffect, useState } from 'react'
import { useRoute, href, back } from './lib/router.js'
import { loadSeason, favourites, fmtStamp } from './lib/data.js'
import Home from './pages/Home.jsx'
import Team from './pages/Team.jsx'
import Division from './pages/Division.jsx'
import Venue from './pages/Venue.jsx'
import Day from './pages/Day.jsx'
import Changes from './pages/Changes.jsx'

export default function App() {
  const route = useRoute()
  const [season, setSeason] = useState(null)
  const [error, setError] = useState(null)
  const [favs, setFavs] = useState(favourites.get)

  useEffect(() => {
    loadSeason().then(setSeason, (e) => setError(e.message))
  }, [])
  useEffect(() => {
    const on = () => setFavs(favourites.get())
    window.addEventListener('cmsa:favs', on)
    return () => window.removeEventListener('cmsa:favs', on)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.page, route.id])

  const isHome = route.page === 'home'

  let title = 'Game Finder'
  let body = null
  if (error) body = <p className="notice error">{error}</p>
  else if (!season) body = <p className="notice">Loading the schedule…</p>
  else {
    const props = { season, favs, route }
    switch (route.page) {
      case 'team': {
        const t = season.teams[route.id]
        title = t ? t.name : 'Team'
        body = t ? <Team {...props} team={t} /> : <NotFound what="team" />
        break
      }
      case 'division': {
        const d = season.divisions[route.id]
        title = d ? d.name : 'Division'
        body = d ? <Division {...props} division={d} /> : <NotFound what="division" />
        break
      }
      case 'venue': {
        const v = season.venues[route.id]
        title = v ? v.name : 'Venue'
        body = v ? <Venue {...props} venue={v} /> : <NotFound what="venue" />
        break
      }
      case 'day':
        title = 'Games by day'
        body = <Day {...props} />
        break
      case 'changes':
        title = 'Schedule changes'
        body = <Changes {...props} />
        break
      default:
        body = <Home {...props} />
    }
  }

  useEffect(() => {
    document.title = isHome ? 'CMSA Game Finder' : `${title} · CMSA Game Finder`
  }, [title, isHome])

  return (
    <div className="app">
      <header className="topbar">
        {isHome ? (
          <div className="brand">
            <span className="ball" aria-hidden="true">⚽</span>
            <span>CMSA Game Finder</span>
          </div>
        ) : (
          <>
            <button className="iconbtn" onClick={() => back()} aria-label="Back">‹</button>
            <h1 className="topbar-title">{title}</h1>
          </>
        )}
      </header>
      <main className="page">{body}</main>
      <nav className="bottomnav" aria-label="Main">
        <a href={href()} className={route.page === 'home' ? 'on' : ''}>
          <span aria-hidden="true">★</span>My teams
        </a>
        <a href={href('day')} className={route.page === 'day' ? 'on' : ''}>
          <span aria-hidden="true">📅</span>By day
        </a>
        <a href={href('changes')} className={route.page === 'changes' ? 'on' : ''}>
          <span aria-hidden="true">↻</span>Changes
          {season?.changes?.length ? <b className="badge">{Math.min(season.changes.length, 99)}</b> : null}
        </a>
      </nav>
      {season && isHome ? (
        <footer className="foot">
          Unofficial. Read from calgaryminorsoccer.com at {fmtStamp(season.generatedAt)}. Confirm anything odd with your coach.
        </footer>
      ) : null}
    </div>
  )
}

function NotFound({ what }) {
  return (
    <p className="notice">
      That {what} is not in the current schedule data. <a href={href()}>Go home</a>
    </p>
  )
}
