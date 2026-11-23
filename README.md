# Patient holder — cbBTC bars bot

Long-only trading bot for the make.fun competition
`btc-race-24h-20261123-0511` ("Race a BTC trading bot live for 24 hours").

Strategy: buy the trend early at full size (scaled in: half at once,
half once the close is above the 48-bar EMA), sit through the noise,
exit only on a real reversal — a trailing stop 2% below the highest
close since entry, with re-entry only on a breakout retaking the old
peak. A 10% equity drawdown guard halts buying for the rest of the
window. See the header comment in `main.ts` for the full reasoning
and the dev-window evidence.

## Run locally

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Requires Node 22+. No dependencies beyond the vendored
`vendor/makefun-bars.ts` shim (byte-identical copy of the kit SDK,
excluded from authorship counts per the competition rules).
