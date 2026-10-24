import { useState } from 'react'
import { href } from '../lib/router.js'
import { nextGame, fmtDate, fmtTime, relDay, opponentOf, fieldOnly, trainingFor, nextSession, weekdayName, venueByName } from '../lib/data.js'
import Bring from './Bring.jsx'

export default function Home({ season, favs }) {
  const [q, setQ] = useState('')
  const [age, setAge] = useState(null)
  const myTeams = favs.map((id) => season.teams[id]).filter(Boolean)
  const query = q.trim().toLowerCase()
  const results = query.length >= 2
    ? season.teamList.filter((t) => t.name.toLowerCase().includes(query) || t.division?.name.toLowerCase().includes(query)).slice(0, 40)
    : []

  return (
    <>
      <section>
        <h2 className="h">My teams</h2>
        {myTeams.length === 0 ? (
          <div className="card soft">
            <p><b>Star a team once</b> and its next game, field and address are here every time you open this.</p>
            <p className="muted">Search by team or coach name below. Division names end in the coach's surname, like "Dev MILLER".</p>
          </div>
        ) : (
          myTeams.map((t) => <TeamCard key={t.id} team={t} season={season} />)
        )}
      </section>

      <section>
        <h2 className="h">Find a team</h2>
        <input
          className="search"
          type="search"
          placeholder="Team, club or coach name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {query.length >= 2 ? (
          results.length ? (
            <div className="list">
              {results.map((t) => (
                <a key={t.id} className="item" href={href('team', t.id)}>
                  <span>{t.name}{t.tag ? <span className="muted"> ({t.tag})</span> : null}</span>
                  <span className="muted small">{t.division?.name}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">No team matches "{q}". Try part of the club name.</p>
          )
        ) : null}
      </section>

      <section>
        <h2 className="h">Browse</h2>
        <div className="chips">
          {season.ageGroups.map((g) => (
            <button key={g.slug} className={`chip ${age === g.slug ? 'on' : ''}`} onClick={() => setAge(age === g.slug ? null : g.slug)}>
              {g.label}
            </button>
          ))}
        </div>
        {age ? (
          <div className="list">
            {Object.values(season.divisions)
              .filter((d) => d.ageSlug === age)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((d) => (
                <a key={d.id} className="item" href={href('division', d.id)}>
                  <span>{d.name}</span>
                  <span className="muted small">{d.teamIds.length} teams · {season.byDivision[d.id]?.length || 0} games</span>
                </a>
              ))}
          </div>
        ) : null}
      </section>
    </>
  )
}

function TeamCard({ team, season }) {
  const games = season.byTeam[team.id] || []
  const g = nextGame(games)
  const division = season.divisions[team.divisionId]
  return (
    <a className="card teamcard" href={href('team', team.id)}>
      <div className="teamcard-name">{team.name}</div>
      <div className="muted small">{division?.name}</div>
      {g ? <NextLine g={g} teamId={team.id} season={season} /> : <div className="muted">No more games listed this season.</div>}
      {trainingFor(season, team.id).map((t, i) => {
        const d = nextSession(t)
        return d ? (
          <div key={i} className="muted small trainline">
            Training {weekdayName(t.weekday).replace(/s$/, '')} {fmtDate(d, 'short').split(', ')[1]} · {fmtTime(t.start)} · {t.venue}{t.field ? ` ${t.field}` : ''}
            {' '}<Bring venue={venueByName(season, t.venue)} field={[t.venue, t.field].filter(Boolean).join(' ')} />
          </div>
        ) : null
      })}
    </a>
  )
}

function NextLine({ g, teamId, season }) {
  const opp = opponentOf(g, teamId)
  const venue = season.venues[g.venueId]
  return (
    <div className="nextline">
      <div className="nextline-when">
        <b>{relDay(g.date)}</b> · {fmtDate(g.date, 'short')} · {fmtTime(g.time)}
      </div>
      <div>
        {opp.home ? 'vs' : 'at'} {opp.name} <span className={`pill ${opp.home ? 'home' : 'away'}`}>{opp.home ? 'Home' : 'Away'}</span>
      </div>
      <div className="muted small">{venue?.name}{fieldOnly(g, venue) ? ` · ${fieldOnly(g, venue)}` : ''}</div>
      <div><Bring venue={venue} field={g.field} /></div>
    </div>
  )
}
