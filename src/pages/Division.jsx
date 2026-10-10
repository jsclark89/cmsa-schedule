import { useState } from 'react'
import { href } from '../lib/router.js'
import { fmtDate, relDay, isPast, groupBy } from '../lib/data.js'
import GameRow from './GameRow.jsx'
import { CalendarPanel } from './Team.jsx'

export default function Division({ season, favs, division }) {
  const games = season.byDivision[division.id] || []
  const teams = division.teamIds.map((id) => season.teams[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  const [showPlayed, setShowPlayed] = useState(false)
  const [showCal, setShowCal] = useState(false)
  const upcoming = games.filter((g) => !isPast(g))
  const played = games.filter((g) => isPast(g))
  const shown = showPlayed ? games : upcoming
  const byDate = groupBy(shown, (g) => g.date)

  return (
    <>
      <div className="subhead muted">{division.league} · {division.ageSlug.toUpperCase()}</div>
      <div className="chips">
        {teams.map((t) => (
          <a key={t.id} className={`chip ${favs.includes(t.id) ? 'on' : ''}`} href={href('team', t.id)}>{t.name}</a>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={() => setShowCal((v) => !v)}>📅 Subscribe to whole division</button>
      </div>
      {showCal ? <CalendarPanel kind="division" id={division.id} name={division.name} /> : null}

      {division.standings ? <Standings rows={division.standings} season={season} favs={favs} /> : null}

      <h2 className="h">
        Games
        {played.length ? (
          <button className="linkbtn" onClick={() => setShowPlayed((v) => !v)}>{showPlayed ? 'Hide played' : `Show ${played.length} played`}</button>
        ) : null}
      </h2>
      {shown.length === 0 ? <p className="muted">No games listed yet.</p> : null}
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date} className="group">
          <div className="group-title">{fmtDate(date, 'long')} <span className="muted">· {relDay(date)}</span></div>
          {list.map((g) => <GameRow key={g.key} game={g} season={season} highlightIds={favs} />)}
        </div>
      ))}
    </>
  )
}

function Standings({ rows, season, favs }) {
  const cols = ['gp', 'w', 't', 'l', 'pts', 'gf', 'ga', 'gd'].filter((c) => rows.some((r) => c in r))
  const sorted = [...rows].sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1) || (b.gd ?? 0) - (a.gd ?? 0))
  return (
    <>
      <h2 className="h">Standings</h2>
      <div className="tablewrap">
        <table className="standings">
          <thead>
            <tr><th>Team</th>{cols.map((c) => <th key={c}>{c.toUpperCase()}</th>)}</tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.teamId} className={favs.includes(r.teamId) ? 'hot' : ''}>
                <td><a href={href('team', r.teamId)}>{season.teams[r.teamId]?.name || r.teamId}</a></td>
                {cols.map((c) => <td key={c}>{r[c] ?? '-'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
