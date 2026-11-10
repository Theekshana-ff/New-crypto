# My Crypto Desk
Static site (HTML/CSS/JS). Deploy: push to GitHub, then import the repo on vercel.com (no build settings needed).

## Signal validation (automatic)
Run the **Validate signals on real data** workflow once (Actions tab -> Run workflow); it then repeats every Sunday.
It replays real market history (fees included), writes `validated.json`, and signals with negative expectancy are switched off in the site and Telegram alerts.

## Signals that are tested on real data
The old chart-analysis signals (SMC / Fibonacci / patterns) lost money on real data, so they are switched off in `validated.json`.
Alerts now come only from simple rule-based strategies (`strat-core.js`) on CLOSED candles. Run the **Find working signals on real data** workflow (Actions tab);
it tests every setting on train / validation / test periods with fees and writes `strategy.json`. If nothing passes, no strategy alert is sent. It repeats every Sunday.
