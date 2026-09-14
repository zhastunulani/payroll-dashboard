# Finance dashboards and site structure

## Two areas
**Талдау (reports)** always covers all four projects for one calendar month and never depends on the payroll profile.
**Payroll операциялары** work inside one project profile (sidebar switcher) and its opened months, as before.

| Area | Page | URL |
|---|---|---|
| Талдау · барлық жоба | Қаржылық шолу | `/` |
| | Жоба P&L (own project tabs) | `/finance?project=<id>` |
| | Юнит және таргет | `/unit-economics` |
| Payroll · selected profile | Айлық төлемі | `/departments` |
| | Шығындар (tabs: Міндетті төлемдер / Басқа шығындар) | `/expenses`, `/expenses?tab=other` (`/other-expenses` redirects) |
| | SMZ бөлу, Баптаулар | `/smz`, `/settings` |

- Reports take `?month=YYYY-MM`; the P&L page also `project`, `kind`, `category`, `view`, `status=unpaid` and anchors `#payments #issues #pnl #ledger`.
- Links from reports into Payroll use `?workspace=<id>&month=YYYY-MM`: they switch the payroll profile to that project and open that month. If the month is not opened yet, the nearest month is shown with a notice and an «Айды ашу» button.
- The TamshyLab theme applies only in Payroll operations; reports keep the neutral look.
- Project colors (fixed, colorblind-validated for all pairs): EdUser blue, TamshyLab teal, Тараз orange, Қызылорда violet.

## Money rules (how the owner tracks it)
Every cost of a project-month falls into exactly one bucket:
| Bucket | Source | Paid status |
|---|---|---|
| **Айлық** | Payroll salary snapshots | paid / unpaid per person. Advances deducted from the salary were handed out earlier, so they count as paid. |
| **Міндетті төлемдер** | Payroll expenses outside the one-time register (rent, internet, subscriptions; «ай сайын» ones are copied to the next month) | paid / unpaid per item |
| **Таргет / жарнама** | Marketing spend from the ledger (imports, manual USD × rate entries) and one-time marketing purchases | spent |
| **Басқа шығындар** | The one-time «Басқа шығындар» register plus other ledger spending (equipment, events, contractors…) | spent |

- Only an explicit «unpaid» is owed. Imported rows without a confirmed status are spent money; there is no «unconfirmed» pile.
- «Төленуі керек» = unpaid salaries + unpaid mandatory payments (+ ledger rows explicitly marked unpaid).
- The P&L groups the same rows by nature (payroll, rent, services, marketing…). Equipment and refundable deposits are cash out but not operating result.

## Screens
- `/` — KPI row for all projects (month total, salary paid of total, mandatory paid of total, target + other spending, result); one card per project whose rows open the exact place (salary → that project's Айлық төлемі, mandatory → Шығындар, target/other → filtered ledger, result → P&L); grouped 6-month chart; attention list; P&L table whose cells link to the filtered list behind them.
- `/finance` — one project at a time via its own tabs: KPIs, the four buckets with what is still owed, 6-month chart by bucket with revenue, issues, P&L vs previous month and budget, payroll by department, target funnel, unit economics, ledger.
- `/unit-economics` — cross-project comparison and the monthly data-entry card per project (`#metrics-<project>`).
- `/departments` (Айлық төлемі) — fund with paid/remaining progress, split by payment method; filters by status and department; employees grouped by department (unpaid first) with per-department «Бөлімді төлеу», per-person toggle, notes, edit, bulk selection. Advances given earlier are shown so the report figure (salary + advances) reconciles.
- `/expenses` (Шығындар) — mandatory payments grouped by category with paid/unpaid toggles and status filter; one-time spending with a one-line quick add; spending recorded in the reports (Excel imports, manual entries) listed read-only with a link to edit; a Таргет card; totals match the reports' buckets.

## Data model
- One ledger per project × calendar month, assembled on every read from Payroll salaries (same population as the Payroll screens: archived/deleted employees excluded), Payroll expenses (with the one-time flag), `finance_entries` (imports and manual rows) and legacy unit-economics inputs (fallback, marked duplicate once replaced).
- Commercial inputs live in `finance_metrics`: revenue, receipts, units, leads, new paying clients, client lifetime, unit type, confirmations.
- `finance_entries.currency / currency_amount / fx_rate` keep the original currency; for USD rows the tenge amount is always USD × rate.
- `GET /api/finance?period=YYYY-MM` returns the month's entries plus a 6-month trend per project and the months opened in Payroll. Manual entries can be deleted; every update/delete keeps the previous row in `finance_history`.

## Definitions
- Operating result = recognised revenue − operating costs; unavailable without revenue; pre-tax unless taxes are entered.
- Unit economics: ARPU = revenue ÷ units; unit contribution = ARPU − variable cost per unit; break-even = (operating − variable) ÷ unit contribution; LTV = unit contribution × lifetime; payback = CAC ÷ unit contribution; ROMI = (new clients × LTV − marketing) ÷ marketing (one month of contribution when lifetime is unknown).
- Funnel: CPL = marketing ÷ leads, CAC = marketing ÷ new paying clients.
- Missing data is «—», never a fabricated zero. 4-project revenue/profit need every project's revenue; pooled CPL/CAC need every advertising project's funnel; unit metrics are never pooled.

## Maintenance scripts
- `scripts/import-finance-reports.mjs` — idempotent workbook import (preview by default).
- `scripts/backfill-ad-currency.mjs` — moves "X USD × Y ₸/USD" from imported target notes into the currency columns (preview by default, `--apply` to write).
