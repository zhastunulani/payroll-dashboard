# Finance dashboards

## Screens
| URL | Purpose |
|---|---|
| `/` | Portfolio overview for a calendar month: KPIs, one card per project, 6-month cost trend by project, data-quality checklist, management P&L matrix (lines × projects + total + previous month). |
| `/finance?project=<id>` | Project P&L: KPIs vs previous month, cost structure by group with revenue line, category P&L vs previous month and budget, payroll by department, target funnel, unit economics, full ledger with CSV export. `project=all` shows the consolidated view. |
| `/unit-economics` | Cross-project unit economics and target funnel, target spend trend, CAC/CPL by month, and the monthly data-entry form per project (revenue, receipts, students, leads, new paying clients, client lifetime). |

Payroll operations (`/departments`, `/expenses`, `/other-expenses`, `/smz`, `/settings`) are unchanged and remain per workspace.

## Data model
- One ledger per project × calendar month (`YYYY-MM`), assembled on every read from:
  - Payroll salary snapshots (settled amount; deducted advances as separate `unknown`-status rows) — the same population as the Payroll screens, so archived or deleted employees are excluded;
  - Payroll expenses (auto-classified into finance categories);
  - `finance_entries` (imports and manual rows: target, taxes, contractors, equipment, budget);
  - legacy unit-economics inputs (fallback; marked duplicate once replaced).
- Commercial inputs live in `finance_metrics` (JSON per project-month): `revenue`, `receipts`, `units`, `leads`, `customers`, `retentionMonths`, `unitType`, confirmations.
- `finance_entries.currency / currency_amount / fx_rate` keep the original currency of a payment (e.g. Meta Ads in USD). For USD rows the tenge amount is always derived as USD × rate on save.
- `GET /api/finance?period=YYYY-MM` returns the selected month's entries plus a 6-month `trend` per project and the months that exist in Payroll.
- Manual entries can be deleted (`deleteEntry`); imported ones are excluded via their disposition. Every update/delete stores the previous row in `finance_history`.

## Definitions
- Management P&L groups: **ФОТ** (payroll), **Таргет / маркетинг**, **Операциялық** (contractors, rent, services, office, travel, events, variable, other), **Салық**, **Капитал** (equipment, refundable deposits — cash out, but not operating result).
- Operating result = recognised revenue − operating costs. Unavailable without revenue; it is pre-tax unless taxes are entered.
- Unit economics per project-month: ARPU = revenue ÷ units; unit contribution = ARPU − variable cost per unit; break-even units = (operating − variable) ÷ unit contribution; LTV = unit contribution × client lifetime (months); payback = CAC ÷ unit contribution; ROMI = (new clients × LTV − marketing) ÷ marketing, or with one month of contribution when lifetime is unknown.
- Funnel: CPL = marketing ÷ leads, CAC = marketing ÷ new paying clients, conversion = clients ÷ leads. Metrics are computed whenever inputs exist; unconfirmed period alignment is flagged, not hidden.
- Missing data is `null` ("—"), never a fabricated zero. Consolidated revenue/profit require every project's revenue; pooled CPL/CAC require the funnel of every advertising project. Unit metrics are never pooled across projects.
- Budget (plan) is never added to actual.

## Data-quality checklist (per project-month)
Missing revenue, unpaid salaries (critical once the month is closed), unpaid expenses, target spend without leads/clients, leads without spend, revenue without units, missing taxes, unconfirmed payment status, review items, missing amounts, rows in "other", and months not opened in Payroll.

## Maintenance scripts
- `scripts/import-finance-reports.mjs` — idempotent workbook import (preview by default).
- `scripts/backfill-ad-currency.mjs` — moves "X USD × Y ₸/USD" from imported target notes into the currency columns (preview by default, `--apply` to write; only rows where amount = USD × rate).

## Source observations (13 September 2026)
Latest workbook: Айлық_есеп_жарнама_қосылған.xlsx. Its August grouping includes some September dates in the raw source; retain both the original period and the chosen reporting month.
EdUser August source payroll omits deductions of 271,375 KZT; live payroll remains authoritative.
August advertising 01.08–31.08 is a different period from legacy 29.07–29.08; never sum them.
September advertising is partial through 7 September and converted at the source's stated 450.91 KZT/USD, not a verified bank charge.
