# CMSA Game Finder

An unofficial, parent-friendly schedule site for Calgary Minor Soccer Association
leagues. It scrapes the league's Demosphere schedule pages into one JSON file and
serves a fast, mobile-first viewer on top of it.

What a parent gets that the league site does not:

- Star your team once; the home screen shows its next game, field, address and a
  directions link every time you open it.
- Subscribe your phone calendar to the team (one link, updates itself).
- Every game at a venue on a day, and every game in the league on a day.
- A log of schedule changes (moved, added or removed games) with timestamps.
- Footwear and surface notes for each venue, pulled from the field directory.

## Run it

    npm install
    npm run scrape      # writes public/data/season.json and public/ics/*.ics
    npm run dev         # http://localhost:5173

## Deploy

The GitHub Action in `.github/workflows/update.yml` re-scrapes every six hours,
commits any data changes, builds the site and deploys it to GitHub Pages.
Turn on Pages for the repo (Settings > Pages > Source: GitHub Actions) and it runs
on the next push. For Vercel instead, import the repo, build command
`npm run build`, output `dist`, and run `npm run scrape` on a schedule elsewhere.

## Data notes

- Source pages: `calgaryminorsoccer.com/schedule/<age>` embeds a Demosphere
  element whose URL lists the division ids for that age group. Each division
  has one static HTML page per month.
- Nothing here is official. The scraper only reads public pages, keeps the
  league's game numbers, and never writes anything back.
