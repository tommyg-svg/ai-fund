# Morning Trading Report (7:00 AM Australia/Sydney)

You are generating Tommy's morning trading report. This is a READ-ONLY reporting
task. Do NOT place, modify, or cancel any orders. Do NOT change any desk state,
risk limits, or configuration. Only read data and send one email.

## Context

- This is the `ai-fund` paper-trading desk (Cube exchange = staging/testnet,
  Alpaca = paper trading). No real money is at risk yet — everything is
  simulated. This report is read alongside an evening report (9:30pm) as part
  of a week-long paper-trading evaluation period before any live trading
  decision is made.
- Active desk agents are in `.desk/state.json` — read it to see who is hired
  (expect: risk-manager, jesse-livermore, swing-trader, performance-analyst).
- The US market session runs overnight Australia/Sydney time, so this report
  should cover what happened while Tommy slept, plus crypto (Cube runs 24/7).

## Steps

1. Read `.desk/state.json` for active agents and any prior notes.
2. Call `get_account` and `get_positions` on both `alpaca` and `cube` MCP tools
   to get current paper balances, open positions, and unrealized P&L.
3. Call `get_orders` on both to see anything filled or still open overnight.
4. Using the hired personas' philosophies (Jesse Livermore = momentum/tape
   reading, Swing Trader = multi-day trend holds, Risk Manager = position
   sizing and drawdown limits), write a report in this exact structure:

   **Subject line**: `Morning Trading Report — [today's date]`

   **Body**, in plain English first — assume Tommy is reading this on his phone
   mid-walk, not at a desk analyzing a spreadsheet:

   1. **The one-line summary** — one sentence: what happened overnight, in
      plain terms (e.g. "Bitcoin held steady, no new trades filled overnight").
   2. **What we'd be withdrawing today** — the paper account's realized P&L
      since yesterday's report, stated as a dollar figure, with a clear label
      that this is SIMULATED/PAPER money, not real. If nothing changed, say so
      plainly rather than padding the report.
   3. **What happened and why** — 2-4 short bullets on any trades/signals,
      each explained in the professional-trader technique it's based on (e.g.
      "Livermore-style: price broke above the prior swing high on rising
      volume, which is the classic 'pivotal point' momentum signal") — written
      so someone with zero trading background can follow it.
   4. **Markers to watch today** — 2-3 concrete, simple things to keep an eye
      on (e.g. "If BTC drops below $X, our stop-loss would trigger" or "Watch
      the 9:30am US open for follow-through on yesterday's move"). Keep this
      section growing in depth over time as Tommy's familiarity increases —
      today, keep it simple.
   5. **Risk Manager's note** — one line from the Risk Manager's perspective:
      current drawdown/exposure status, in plain terms.

5. Send this as an email to tommyg.info@gmail.com using the Gmail MCP tool.
   Use a plain-text, clean-formatted body (no heavy markdown/code blocks —
   this is read on a phone).
6. After sending, append a one-line log entry to
   `.desk/reports/log.md` (create the file if it doesn't exist) with the date,
   "morning", and the one-line summary — for a record of what was sent.

If any MCP tool call fails (e.g. connector not authenticated), do not retry
indefinitely — send the email anyway noting what couldn't be fetched, so
Tommy still gets a report at 7am rather than silence.
