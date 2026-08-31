#!/usr/bin/env node
/**
 * One active-session paper-trading cycle.
 *
 * Run by hand (or asked-for by Claude in a live session) — NOT scheduled/
 * unattended. Scans a watchlist for a Livermore-style momentum breakout
 * (price clears its prior N-day high on above-average volume), sizes the
 * trade against .desk/risk.json's limits, places a paper market order plus
 * a protective stop, and logs everything to .desk/orders.json and the
 * relevant agent briefings.
 *
 * Read-only if no signal qualifies — it will not force a trade.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AlpacaClient } from '../../connectors/alpaca/mcp-server/src/client/api.js';
import { loadCredentials } from '../../connectors/alpaca/mcp-server/src/client/credential-store.js';
import { sma, rsi } from '../../lib/indicators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DESK = path.join(ROOT, '.desk');
const ORDERS_FILE = path.join(DESK, 'orders.json');
const RISK_FILE = path.join(DESK, 'risk.json');
const BRIEFINGS = path.join(DESK, 'briefings');

const WATCHLIST = ['SPY', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMD', 'META'];
const LOOKBACK_DAYS = 60;
const BREAKOUT_WINDOW = 20; // Livermore "pivotal point": clear the prior N-day high
const VOLUME_MULTIPLE = 1.5; // on above-average volume
const STOP_LOSS_PCT = 0.06; // 6% protective stop below entry

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readJson(file: string, fallback: unknown) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function appendBriefing(slug: string, entry: string) {
  const file = path.join(BRIEFINGS, `${slug}.md`);
  if (!fs.existsSync(file)) return;
  fs.appendFileSync(file, `\n${entry}\n`);
}

interface Candidate {
  symbol: string;
  price: number;
  priorHigh: number;
  avgVolume: number;
  todayVolume: number;
  rsiValue: number;
  breakoutPct: number;
  sma20: number;
  sma50: number;
  pullbackPct: number; // distance of price above/below sma20, as a fraction
  uptrend: boolean; // price above sma50 (established trend)
}

type SignalType = 'livermore-breakout' | 'swing-pullback';

interface Signal {
  candidate: Candidate;
  type: SignalType;
  strength: number; // higher = stronger, used to rank across both strategies
  rationale: string;
}

/**
 * Any prior entry that filled after this script last ran but never got its
 * protective stop attached (e.g. market was closed at entry time) gets
 * reconciled here — Risk Manager's "stop-loss required" rule doesn't get to
 * silently lapse just because the position filled while nobody was watching.
 */
async function reconcilePendingStops(client: AlpacaClient) {
  const orders = readJson(ORDERS_FILE, { trades: [] }) as { trades: any[] };
  let changed = false;

  for (const trade of orders.trades) {
    if (trade.action !== 'entry' || trade.stop_order_id) continue;
    try {
      const filled = await client.getOrder(trade.entry_order_id);
      const qty = filled.filled_qty && parseFloat(filled.filled_qty) > 0 ? filled.filled_qty : undefined;
      if (!qty) continue; // still not filled — nothing to protect yet

      const fillPrice = parseFloat(filled.filled_avg_price ?? '0');
      const stopPrice = (fillPrice * (1 - STOP_LOSS_PCT)).toFixed(2);
      const stopOrder = await client.placeOrder({
        symbol: trade.symbol,
        side: 'sell',
        type: 'stop',
        qty,
        stop_price: stopPrice,
        time_in_force: 'gtc',
      });
      trade.entry_status = filled.status;
      trade.stop_order_id = stopOrder.id;
      trade.stop_price = stopPrice;
      changed = true;
      console.log(`Reconciled: ${trade.symbol} filled at $${fillPrice.toFixed(2)}, attached stop ${stopOrder.id} at $${stopPrice}.`);
    } catch (err: any) {
      console.error(`  Could not reconcile ${trade.symbol}: ${err.message}`);
    }
  }

  if (changed) writeJson(ORDERS_FILE, orders);
}

async function main() {
  const risk = readJson(RISK_FILE, { parameters: {} }) as {
    parameters?: { max_position_size_pct?: number; stop_loss_required?: boolean };
  };
  const maxPositionPct = risk.parameters?.max_position_size_pct ?? 5;

  const creds = await loadCredentials();
  if (!creds) {
    console.error('No Alpaca credentials found. Run `npm run login` in connectors/alpaca/mcp-server first.');
    process.exit(1);
  }
  const client = new AlpacaClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, paper: creds.paper });

  const account = await client.getAccount();
  const equity = parseFloat(account.equity);
  console.log(`Account equity: $${equity.toFixed(2)} (paper=${creds.paper})`);

  await reconcilePendingStops(client);

  const candidates: Candidate[] = [];

  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 1.6 * 24 * 60 * 60 * 1000); // pad for weekends/holidays

  for (const symbol of WATCHLIST) {
    try {
      const bars = await client.getBars(symbol, {
        timeframe: '1Day',
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        limit: 10000,
        feed: 'iex',
      });
      if (!bars || bars.length < BREAKOUT_WINDOW + 1) continue;

      const closes = bars.map(b => b.c);
      const latest = bars[bars.length - 1];
      const price = latest.c;
      const todayVolume = latest.v;

      const priorBars = bars.slice(0, -1).slice(-BREAKOUT_WINDOW);
      const priorHigh = Math.max(...priorBars.map(b => b.h));
      const priorVolumes = priorBars.map(b => b.v);
      const avgVolume = priorVolumes.reduce((a: number, b: number) => a + b, 0) / priorVolumes.length;

      const rsiSeries = rsi(closes, 14);
      const rsiValue = rsiSeries[rsiSeries.length - 1] ?? 50;

      const breakoutPct = (price - priorHigh) / priorHigh;

      const sma20Series = sma(closes, 20);
      const sma50Series = sma(closes, 50);
      const sma20 = sma20Series[sma20Series.length - 1] ?? price;
      const sma50 = sma50Series[sma50Series.length - 1] ?? price;
      const pullbackPct = (price - sma20) / sma20;
      const uptrend = price > sma50;

      candidates.push({
        symbol, price, priorHigh, avgVolume, todayVolume, rsiValue, breakoutPct,
        sma20, sma50, pullbackPct, uptrend,
      });
    } catch (err: any) {
      console.error(`  ${symbol}: skipped (${err.message})`);
    }
  }

  console.log('\nScan results:');
  const signals: Signal[] = [];
  for (const c of candidates) {
    const volRatio = c.todayVolume / c.avgVolume;
    const breakoutSignal = c.price > c.priorHigh && volRatio >= VOLUME_MULTIPLE;
    // Swing pullback: established uptrend (price > 50d SMA), price has pulled
    // back to within 1.5% of the 20d SMA (a classic "buy the dip to support"
    // entry), and RSI is in a healthy 40-55 zone (not overbought, not breaking down).
    const pullbackSignal = c.uptrend && Math.abs(c.pullbackPct) <= 0.015 && c.rsiValue >= 40 && c.rsiValue <= 55;

    console.log(
      `  ${c.symbol.padEnd(5)} price=$${c.price.toFixed(2)} prior${BREAKOUT_WINDOW}dHigh=$${c.priorHigh.toFixed(2)} ` +
      `breakout=${(c.breakoutPct * 100).toFixed(2)}% volRatio=${volRatio.toFixed(2)}x rsi=${c.rsiValue.toFixed(1)} ` +
      `sma20=$${c.sma20.toFixed(2)} sma50=$${c.sma50.toFixed(2)} uptrend=${c.uptrend}` +
      (breakoutSignal ? '  <-- LIVERMORE BREAKOUT' : '') +
      (pullbackSignal ? '  <-- SWING PULLBACK' : '')
    );

    if (breakoutSignal) {
      signals.push({
        candidate: c,
        type: 'livermore-breakout',
        strength: c.breakoutPct * 10 + (volRatio - 1), // reward bigger breakouts + heavier volume
        rationale: `Broke above ${BREAKOUT_WINDOW}-day high ($${c.priorHigh.toFixed(2)}) at $${c.price.toFixed(2)} (+${(c.breakoutPct * 100).toFixed(2)}%) on ${volRatio.toFixed(2)}x average volume — Livermore's "pivotal point."`,
      });
    }
    if (pullbackSignal) {
      signals.push({
        candidate: c,
        type: 'swing-pullback',
        strength: 1 - Math.abs(c.pullbackPct) * 10, // reward tighter pullback to support
        rationale: `Established uptrend (price $${c.price.toFixed(2)} above 50-day SMA $${c.sma50.toFixed(2)}), pulled back to within ${(c.pullbackPct * 100).toFixed(2)}% of the 20-day SMA ($${c.sma20.toFixed(2)}) with RSI ${c.rsiValue.toFixed(1)} — classic "buy the dip to support."`,
      });
    }
  }
  signals.sort((a, b) => b.strength - a.strength);

  // Never enter a symbol we already have exposure to — an open position or a
  // still-open order both count. Without this check, re-running the scan
  // while the same signal persists (e.g. market closed, order not yet
  // filled) would keep stacking new positions in the same name.
  const [openPositions, openOrders] = await Promise.all([
    client.getPositions(),
    client.getOrders({ status: 'open' }),
  ]);
  const heldSymbols = new Set([
    ...openPositions.map(p => p.symbol),
    ...openOrders.map(o => o.symbol),
  ]);
  const newSignals = signals.filter(s => !heldSymbols.has(s.candidate.symbol));
  const skipped = signals.filter(s => heldSymbols.has(s.candidate.symbol));
  for (const s of skipped) {
    console.log(`\n(${s.candidate.symbol} already has an open position/order — skipping to avoid stacking exposure.)`);
  }

  const orders = readJson(ORDERS_FILE, { trades: [] }) as { trades: any[] };

  if (newSignals.length === 0) {
    const reason = skipped.length > 0 ? 'signal(s) found but already held' : 'no_signal';
    console.log(`\nNo new trade this cycle (${reason}).`);
    orders.trades.push({
      date: today(),
      timestamp: new Date().toISOString(),
      action: 'scan_only',
      result: reason,
      watchlist: WATCHLIST,
    });
    writeJson(ORDERS_FILE, orders);
    return;
  }

  const bestSignal = newSignals[0];
  const pick = bestSignal.candidate;
  const agentSlug = bestSignal.type === 'livermore-breakout' ? 'jesse-livermore' : 'swing-trader';
  const maxNotional = equity * (maxPositionPct / 100);
  const notional = Math.min(maxNotional, equity * 0.05).toFixed(2);

  console.log(`\nSignal (${bestSignal.type}): ${pick.symbol} — ${bestSignal.rationale}`);
  console.log(`Risk Manager: sizing at $${notional} (${maxPositionPct}% max position rule).`);

  const entryOrder = await client.placeOrder({
    symbol: pick.symbol,
    side: 'buy',
    type: 'market',
    notional,
    time_in_force: 'day',
  });
  console.log(`Entry order placed: ${entryOrder.id} — ${entryOrder.status}`);

  // Protective stop (Risk Manager requires one on every position).
  const stopPrice = (pick.price * (1 - STOP_LOSS_PCT)).toFixed(2);
  let stopOrder: any = null;
  try {
    // Wait briefly for the market order to fill so we know the exact qty.
    await new Promise(r => setTimeout(r, 2000));
    const filled = await client.getOrder(entryOrder.id);
    const qty = filled.filled_qty && parseFloat(filled.filled_qty) > 0 ? filled.filled_qty : undefined;
    if (qty) {
      stopOrder = await client.placeOrder({
        symbol: pick.symbol,
        side: 'sell',
        type: 'stop',
        qty,
        stop_price: stopPrice,
        time_in_force: 'gtc',
      });
      console.log(`Protective stop placed: ${stopOrder.id} at $${stopPrice}`);
    } else {
      console.log(`Entry not yet filled — stop-loss NOT placed automatically. Check manually.`);
    }
  } catch (err: any) {
    console.error(`Could not place protective stop: ${err.message}`);
  }

  orders.trades.push({
    date: today(),
    timestamp: new Date().toISOString(),
    action: 'entry',
    symbol: pick.symbol,
    strategy: bestSignal.type,
    rationale: bestSignal.rationale,
    notional,
    entry_order_id: entryOrder.id,
    entry_status: entryOrder.status,
    stop_order_id: stopOrder?.id ?? null,
    stop_price: stopOrder ? stopPrice : null,
    mode: creds.paper ? 'paper' : 'LIVE',
  });
  writeJson(ORDERS_FILE, orders);

  appendBriefing(
    agentSlug,
    `## ${today()} — ${pick.symbol} (${bestSignal.type})\n${bestSignal.rationale}\n` +
    `Entered $${notional} paper position, order ${entryOrder.id}. Stop at $${stopPrice}.`
  );
  appendBriefing(
    'performance-analyst',
    `## ${today()} — Trade logged\n${pick.symbol} entry $${notional} (paper), stop $${stopPrice}. See .desk/orders.json.`
  );
}

main().catch(err => {
  console.error('Paper trade cycle failed:', err.message);
  process.exit(1);
});
