# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Zhoya0077/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Zhoya0077/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Patient holder — cbBTC bars bot. Long-only trading bot for the make.fun competition `btc-race-24h-20261123-0511` ("Race a BTC trading bot live for 24 hours").

Strategy: buy the trend early at full size (scaled in: half at once, half once the close is above the 48-bar EMA), sit through the noise, exit only on a real reversal — a trailing stop 2% below the highest close since entry, with re-entry only on a breakout retaking the old peak. A 10% equity drawdown guard halts buying for the rest of the window. See the header comment in `main.ts` for the full reasoning and the dev-window evidence.

## Run it

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Requires Node 22+. No dependencies beyond the vendored `vendor/makefun-bars.ts` shim (byte-identical copy of the kit SDK, excluded from authorship counts per the competition rules).

---

<sub>Entered on [make.fun](https://make.fun/?ref=wrbbpgtj&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
