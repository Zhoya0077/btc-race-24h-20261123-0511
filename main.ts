// Patient holder: a long-only cbBTC bot for the 24h bars race.
//
// Idea, in one line: buy the trend early, sit through the noise, and only
// leave on a real reversal. The dev window is a choppy grind up: every
// fast in-and-out system tested on it lost money to the ~26 bps round-trip
// cost (fees + slippage + price impact), while simply holding made +3.2%.
// So this bot trades rarely on purpose:
//
//   - Scale in: 50% of cash on the first tradable batch (that guarantees
//     the race window's "at least 1 trade" bar is met even if the window
//     opens in a downtrend and no later signal ever fires), the other 50%
//     once the close is back above the 48-bar EMA and 24 bars have passed.
//     On the dev window the second leg buys the early dip, so the split
//     entry beats a single full-size buy (+$35 vs +$32) and its action log
//     differs from the buy-and-hold house bot instead of copying it.
//   - While holding, a trailing stop 2% below the highest close since
//     entry. On the dev window the deepest pullback from a peak close was
//     1.98%, so the stop never fired there; on a real reversal it caps the
//     loss near 2% instead of riding the whole fall like buy-and-hold.
//   - After an exit, re-enter (full size) only on a breakout: the close
//     must retake the peak it fell from AND sit above the 48-bar EMA
//     (after a 24-bar cooldown), so a choppy market cannot whipsaw the
//     bot in and out every few minutes. In a steady downtrend the old
//     peak is never retaken, so the bot stays out instead of bleeding
//     on every dead-cat bounce: on the dev window played backwards
//     (a -3.6% downtrend with the same chop) this loses about $15,
//     against about $52 for re-entering on any close above the EMA and
//     about $37 for buy-and-hold.
//   - Equity drawdown guard: if equity ever falls 10% below its peak,
//     sell everything and stop buying for the rest of the window. A
//     backstop for the 25% guardrail; the trailing stop should fire first.
//
// Everything is a pure function of the bar stream: no clock, no random
// numbers, no environment reads, so two executions produce identical
// action logs. All money math uses bigint quote units; the EMA and the
// 2% / 10% thresholds use plain floats, which are deterministic
// IEEE-754 arithmetic on the same inputs.

import { BPS, runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 10_000;
const EMA_BARS = 48;
const FIRST_LEG_NUM = 1n; // first leg buys 1/2 of the cash
const FIRST_LEG_DEN = 2n;
const SECOND_LEG_MIN_BARS = 24; // bars after the first leg before topping up
const TRAIL_BPS = 200; // 2% below the peak close since entry
const REENTRY_COOLDOWN_BARS = 24;
const GUARD_BPS = 1000; // 10% equity drawdown from peak -> halt buying

// EMA state, seeded on the first close seen (warm-up bars included).
let ema: number | null = null;
// Highest close seen while holding the current position.
let peakClose: number | null = null;
// Highest equity seen so far (quote units).
let peakEquity = 0n;
// First batch on which a re-entry buy is allowed again.
let cooldownUntil = -1;
// True once the first (half-size) buy has been sent; reset if it is
// rejected, so a rejected first buy is retried instead of silently skipped.
let firstBuySent = false;
// Seq of the first buy, for the second leg's minimum gap.
let firstBuySeq = -1;
// True once the top-up leg has been sent.
let toppedUp = false;
// Peak close at the last trailing-stop exit; a re-entry buy needs the
// close to retake it (breakout), so downtrends never re-enter.
let exitPeak: number | null = null;
// True once the drawdown guard has fired: no more buys, sells still ok.
let halted = false;

function emaUpdate(close: number): void {
  if (ema === null) {
    ema = close;
    return;
  }
  const k = 2 / (EMA_BARS + 1);
  ema += k * (close - ema);
}

function buyAmount(state: BarsState, notional: bigint): OrderInput[] {
  const { caps, fees } = state.hello;
  const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
  const size = notional < byWeight ? notional : byWeight;
  if (size === 0n || size < BigInt(fees.min_notional_quote_units)) return [];
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

function sellAll(state: BarsState): OrderInput[] {
  const p = state.positions.get(SYMBOL);
  if (p === undefined || p.qty === 0n) return [];
  return [{ side: 'sell', symbol: SYMBOL, qty: p.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state, batch) {
    const closeRaw = state.close(SYMBOL);
    if (closeRaw !== null) emaUpdate(Number(closeRaw));
    if (state.equity > peakEquity) peakEquity = state.equity;

    // A rejected buy is retried on the next batch: reset the leg flags.
    if (batch.fills.some((f) => f.side === 'buy' && f.status === 'rejected')) {
      firstBuySent = false;
      toppedUp = false;
    }

    if (state.warmingUp) return [];
    if (closeRaw === null) return [];
    const close = Number(closeRaw);
    const holding = state.positions.has(SYMBOL);

    if (holding) {
      if (peakClose === null || close > peakClose) peakClose = close;
      // Drawdown guard: a 10% equity fall ends trading for the window.
      if (state.equity * 10_000n < peakEquity * BigInt(10_000 - GUARD_BPS)) {
        halted = true;
        peakClose = null;
        return sellAll(state);
      }
      // Trailing stop: 2% below the peak close since entry.
      if (peakClose !== null && close * 10_000 < peakClose * (10_000 - TRAIL_BPS)) {
        exitPeak = peakClose;
        peakClose = null;
        cooldownUntil = state.seq + REENTRY_COOLDOWN_BARS;
        return sellAll(state);
      }
      // Top-up leg: the remaining cash, once the trend confirms.
      if (!toppedUp && firstBuySeq >= 0 && state.seq >= firstBuySeq + SECOND_LEG_MIN_BARS && ema !== null && close > ema) {
        toppedUp = true;
        return buyAmount(state, state.cash);
      }
      return [];
    }

    // Flat: no buys while halted or cooling down.
    if (halted || state.seq < cooldownUntil) return [];
    // First buy: half size, at once, whatever the trend.
    if (!firstBuySent) {
      firstBuySent = true;
      firstBuySeq = state.seq;
      peakClose = close;
      return buyAmount(state, (state.cash * FIRST_LEG_NUM) / FIRST_LEG_DEN);
    }
    // Re-entry after an exit: full size, only on a breakout — the close
    // retakes the peak it fell from and sits above the 48-bar EMA.
    if (exitPeak !== null && close > exitPeak && ema !== null && close > ema) {
      toppedUp = true;
      exitPeak = null;
      return buyAmount(state, state.cash);
    }
    return [];
  },
});
