import { useState } from 'react'
import { href, navigate } from '../lib/router.js'
import { todayStr, fmtDate, relDay, groupBy } from '../lib/data.js'
import GameRow from './GameRow.jsx'

export default function Day({ season, favs, route }) {
  const today = todayStr()
  const days = season.gameDays
  const date = route.id || days.find((d) => d >= today) || days[days.length - 1]
  const idx = days.indexOf(date)
  const [age, setAge] = useState(null)
  const [mineOnly, setMineOnly] = useState(false)

  let games = season.byDate[date] || []
  if (age) games = games.filter((g) => season.divisions[g.divisionId]?.ageSlug === age)
  if (mineOnly) games = games.filter((g) => favs.includes(g.homeId) || favs.includes(g.awayId))
  const byVenue = groupBy(games, (g) => g.venueId || 'tba')
  const upcomingDays = days.filter((d) => d >= today).slice(0, 10)

  return (
    <>
      <div className="daynav">
        <button className="iconbtn" disabled={idx <= 0} onClick={() => navigate(href('day', days[idx - 1]))} aria-label="Previous game day">‹</button>
        <div className="daynav-title">
          <div className="hero-when">{date ? fmtDate(date, 'long') : 'No games'}</div>
          <div className="muted small">{date ? relDay(date) : ''}</div>
        </div>
        <button className="iconbtn" disabled={idx < 0 || idx >= days.length - 1} onClick={() => navigate(href('day', days[idx + 1]))} aria-label="Next game day">›</button>
      </div>
      <div className="chips scroll">
        {upcomingDays.map((d) => (
          <a key={d} className={`chip ${d === date ? 'on' : ''}`} href={href('day', d)}>{fmtDate(d, 'short')}</a>
        ))}
      </div>
      <div className="chips scroll">
        {favs.length ? <button className={`chip ${mineOnly ? 'on' : ''}`} onClick={() => setMineOnly((v) => !v)}>★ My teams</button> : null}
        {season.ageGroups.map((g) => (
          <button key={g.slug} className={`chip ${age === g.slug ? 'on' : ''}`} onClick={() => setAge(age === g.slug ? null : g.slug)}>{g.label}</button>
        ))}
      </div>

      {games.length === 0 ? <p className="muted">No games match on this day.</p> : null}
      {[...byVenue.entries()].map(([vid, list]) => {
        const venue = season.venues[vid]
        return (
          <div key={vid} className="group">
            <div className="group-title">
              {venue ? <a href={href('venue', vid)}>{venue.name}</a> : 'Venue TBA'} <span className="muted">· {list.length} games</span>
            </div>
            {list.map((g) => <GameRow key={g.key} game={g} season={season} highlightIds={favs} showDivision />)}
          </div>
        )
      })}
    </>
  )
}
