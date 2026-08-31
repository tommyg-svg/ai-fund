# Evening Trading Report (9:30 PM Australia/Sydney)

You are generating Tommy's evening trading report. This is a READ-ONLY
reporting task. Do NOT place, modify, or cancel any orders. Do NOT change any
desk state, risk limits, or configuration. Only read data and send one email.

## Context

- This is the `ai-fund` paper-trading desk (Cube exchange = staging/testnet,
  Alpaca = paper trading). No real money is at risk yet — everything is
  simulated. This report is read alongside a morning report (7am) as part of
  a week-long paper-trading evaluation period before any live trading
  decision is made.
- Active desk agents are in `.desk/state.json` — read it to see who is hired
  (expect: risk-manager, jesse-livermore, swing-trader, performance-analyst).
- This report lands right before bed (10pm), and right before the US market
  opens overnight Australia/Sydney time — so it should both recap today and
  set expectations for what might happen overnight while Tommy sleeps.

## Steps

1. Read `.desk/state.json` for active agents and any prior notes, and read
   `.desk/reports/log.md` if it exists to see this morning's report summary.
2. Call `get_account` and `get_positions` on both `alpaca` and `cube` MCP tools
   to get current paper balances, open positions, and unrealized P&L.
3. Call `get_orders` on both to see everything that happened today.
4. Using the hired personas' philosophies (Jesse Livermore = momentum/tape
   reading, Swing Trader = multi-day trend holds, Risk Manager = position
   sizing and drawdown limits), write a report in this exact structure:

   **Subject line**: `Evening Trading Report — [today's date]`

   **Body**, in plain English first — assume Tommy is reading this on his
   phone right before bed, not at a desk analyzing a spreadsheet:

   1. **The one-line summary** — one sentence on how today went.
   2. **What we'd be withdrawing today** — today's realized P&L, stated as a
      dollar figure, clearly labeled SIMULATED/PAPER money. If nothing
      changed, say so plainly.
   3. **What happened and why** — 2-4 short bullets on today's trades/signals,
      each explained via the professional-trader technique behind it, in
      plain language a beginner can follow.
   4. **Overnight watch** — since the US market opens while Tommy sleeps,
      2-3 concrete things that could happen overnight and what the desk would
      do about them (e.g. "If the position hits our stop-loss overnight, it
      exits automatically — you'll see it in tomorrow's report").
   5. **Risk Manager's note** — one line: current drawdown/exposure status,
      and confirmation that risk limits are holding.
   6. **Running week tally** — since this is a week-long paper-trading trial,
      include a simple running total: cumulative simulated P&L since the
      trial started (pull prior entries from `.desk/reports/log.md`).

5. Send this as an email to tommyg.info@gmail.com using the Gmail MCP tool.
   Use a plain-text, clean-formatted body (no heavy markdown/code blocks —
   this is read on a phone).
6. After sending, append a one-line log entry to
   `.desk/reports/log.md` (create the file if it doesn't exist) with the date,
   "evening", the one-line summary, and today's P&L figure.

If any MCP tool call fails (e.g. connector not authenticated), do not retry
indefinitely — send the email anyway noting what couldn't be fetched, so
Tommy still gets a report at 9:30pm rather than silence.
