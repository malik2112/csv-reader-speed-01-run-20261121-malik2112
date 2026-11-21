# csv-reader-speed-01-run-20261121-malik2112

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/malik2112/csv-reader-speed-01-run-20261121-malik2112/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/malik2112/csv-reader-speed-01-run-20261121-malik2112/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `solve.js` exports `run(input)`, which returns exactly csv-reader's reading of `{text, header}` as `{columns, rows, errors}` — the same broken-row policy (BOM drop, stray CRs, quoted fields with `""` escapes and CR/CRLF read as LF, quote junk, unterminated quotes re-read as unquoted, short/long rows padded or cut to the first record's width) — while slicing fields out of the text instead of building them a character at a time. `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=pwfn5nwa&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
