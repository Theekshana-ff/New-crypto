# My Crypto Desk
Static site (HTML/CSS/JS). Deploy: push to GitHub, then import the repo on vercel.com (no build settings needed).

## Signal validation (automatic)
Run the **Validate signals on real data** workflow once (Actions tab -> Run workflow); it then repeats every Sunday.
It replays real market history (fees included), writes `validated.json`, and signals with negative expectancy are switched off in the site and Telegram alerts.
