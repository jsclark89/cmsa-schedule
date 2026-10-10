import { useState } from 'react'
import { href } from '../lib/router.js'
import { favourites, nextGame, isPast, fmtDate, fmtTime, relDay, opponentOf, fieldOnly, groupBy, icsUrl, webcalUrl, siteUrl } from '../lib/data.js'
import { buildIcs, gameToEvent } from '../lib/ics.js'
import GameRow from './GameRow.jsx'
import VenueNote from './VenueNote.jsx'
import Bring from './Bring.jsx'

export default function Team({ season, favs, team }) {
  const games = season.byTeam[team.id] || []
  const next = nextGame(games)
  const division = season.divisions[team.divisionId]
  const starred = favs.includes(team.id)
  const upcoming = games.filter((g) => !isPast(g))
  const played = games.filter((g) => isPast(g))
  const [showPlayed, setShowPlayed] = useState(false)
  const [showCal, setShowCal] = useState(false)

  async function share() {
    const url = `${siteUrl()}${href('team', team.id)}`
    const data = { title: `${team.name} schedule`, text: `${team.name} games, fields and directions`, url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        alert('Link copied')
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <>
      <div className="subhead">
        <a href={href('division', team.divisionId)} className="muted">{division?.name}</a>
        {division?.stale ? <span className="pill label">data may be stale</span> : null}
      </div>
      <div className="actions">
        <button className={`btn ${starred ? 'primary' : ''}`} onClick={() => favourites.toggle(team.id)}>
          {starred ? '★ Starred' : '☆ Star this team'}
        </button>
        <button className="btn" onClick={() => setShowCal((v) => !v)}>📅 Subscribe</button>
        <button className="btn" onClick={share}>Share</button>
      </div>
      {showCal ? <CalendarPanel kind="team" id={team.id} name={team.name} /> : null}

      {next ? <Hero g={next} team={team} season={season} /> : <div className="card soft">No upcoming games listed for this team.</div>}

      <h2 className="h">Upcoming ({upcoming.length})</h2>
      <MonthGroups games={upcoming} season={season} teamId={team.id} />

      {played.length ? (
        <>
          <button className="linkbtn" onClick={() => setShowPlayed((v) => !v)}>
            {showPlayed ? 'Hide' : 'Show'} {played.length} played game{played.length === 1 ? '' : 's'}
          </button>
          {showPlayed ? <MonthGroups games={played} season={season} teamId={team.id} /> : null}
        </>
      ) : null}
    </>
  )
}

function MonthGroups({ games, season, teamId }) {
  if (!games.length) return <p className="muted">Nothing here.</p>
  const groups = groupBy(games, (g) => g.date.slice(0, 7))
  return [...groups.entries()].map(([ym, list]) => (
    <div key={ym} className="group">
      <div className="group-title">{fmtDate(`${ym}-01`, 'month')}</div>
      {list.map((g) => <GameRow key={g.key} game={g} season={season} perspective={teamId} showDate />)}
    </div>
  ))
}

function Hero({ g, team, season }) {
  const opp = opponentOf(g, team.id)
  const venue = season.venues[g.venueId]
  const field = fieldOnly(g, venue)

  function addToCalendar() {
    const ics = buildIcs({ name: team.name, events: [gameToEvent(g, { teamId: team.id, teams: season.teams, venues: season.venues, divisions: season.divisions, siteUrl: siteUrl() })] })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `game-${g.code}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <section className="hero">
      <div className="hero-kicker">Next game · {relDay(g.date)}</div>
      <div className="hero-when">{fmtDate(g.date, 'long')}</div>
      <div className="hero-time">{fmtTime(g.time)}</div>
      <div className="hero-match">
        <span className="muted">{opp.home ? 'vs' : 'at'}</span> <a href={href('team', opp.id)}>{opp.name}</a>
        <span className={`pill ${opp.home ? 'home' : 'away'}`}>{opp.home ? 'Home' : 'Away'}</span>
      </div>
      {venue ? (
        <div className="hero-venue">
          <div><a href={href('venue', venue.id)}><b>{venue.name}</b></a>{field ? <span> · {field}</span> : null}</div>
          {venue.address ? <div className="muted">{venue.address}</div> : null}
          <div className="bringrow"><Bring venue={venue} field={g.field} big /></div>
          <VenueNote venue={venue} field={g.field} />
        </div>
      ) : (
        <div className="hero-venue muted">Venue to be announced</div>
      )}
      <div className="actions">
        {venue?.mapsUrl ? <a className="btn primary" href={venue.mapsUrl} target="_blank" rel="noopener">Directions</a> : null}
        <button className="btn" onClick={addToCalendar}>Add this game to calendar</button>
      </div>
      <div className="muted small">League game #{g.code}</div>
    </section>
  )
}

export function CalendarPanel({ kind, id, name }) {
  const https = icsUrl(kind, id)
  const webcal = webcalUrl(kind, id)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(https)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy this calendar address', https)
    }
  }
  return (
    <div className="card soft">
      <p><b>Subscribe to {name}</b> and every game, move and cancellation lands in your phone calendar on its own. Updates every six hours.</p>
      <div className="actions">
        <a className="btn primary" href={webcal}>Open in calendar app</a>
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
      </div>
      <p className="muted small">
        iPhone: the first button works directly. Google Calendar: Settings, Add calendar, From URL, paste the copied address.
        {window.location.hostname === 'localhost' ? ' (Subscriptions only work once the site is published, not from localhost.)' : ''}
      </p>
    </div>
  )
}
