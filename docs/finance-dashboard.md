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
| **Таргет (Facebook)** | Only paid social advertising — money paid to Facebook / Instagram (Meta Ads), usually USD × rate | spent |
| **Басқа шығындар** | The one-time «Басқа шығындар» register plus other ledger spending (equipment, events, contractors, and offline advertising: billboards, banners, signs, roll-ups, print → P&L line «Сыртқы жарнама және баспа») | spent |

- «Таргет» is recognised by the words таргет / target / Facebook / Instagram / Meta or a USD amount. Imported rows that were filed as marketing but are offline advertising are shown as «Сыртқы жарнама және баспа» (read-time rule for imports; manual entries keep the chosen category).
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

## Bank statements (`/bank`)
Page flow: header «Выписка жүктеу» (upload in a window) → one card per project with the month's net receipts (a card filters everything below) and a «Бөлу керек» card → **«Бөлу керек»**: unassigned operations grouped by source (Kaspi address or Halyk acquiring contract); pick a project once per group, «Келесіде де осылай» saves an approved rule so future statements are sorted too → tabs **Операциялар** (filters: project, type, search only), **Есеп**, **Жүктеулер**, **Ережелер**.

Uploads: **Kaspi Pay** «Детальная информация по операциям» (.xlsx) and **Halyk** «Выписка по счету» (.pdf). More banks/formats plug into `lib/bank-parsers.ts`.
- **Check before import.** «Тексеру» parses the file and shows what would be imported; nothing is saved. Each file is checked against its own printed totals (Kaspi: sales, refunds, fees, returned fees; Halyk: debit/credit turnovers and opening + credit − debit = closing). A file that does not add up can only be imported «for review»: none of its operations count until a person assigns them.
- **No duplicates.** The same file (SHA-256) cannot be uploaded twice; operations already present from an overlapping statement are skipped by a stable key (bank, legal entity/account, operation №, date, amount, kind). The original file is stored and can be downloaded; an upload can be deleted (journaled).
- **Halyk has two reports and the right parser is chosen by the file itself.** «Выписка по счету» gives daily «Расчеты по карточкам» batches; «Выписка по Pos» (`lib/bank-pos.ts`) is the per-sale detail behind them — a landscape page where every transaction is a column and every field a row, parsed by matching the printed field names, with the printed «Итого» row as the self-check. It carries the merchant point address, contract and terminal, the bank fee per sale, the credited date, the payment method (Halyk QR, installment, bonus, NPK QR, Home Credit) and, for installments, what the merchant pays the bank (a row whose RRN ends with FE) — that is the real installment rate.
- **The same money is counted once.** Where POS rows exist for a contract and credit date, the account-statement batch for that day is marked a duplicate (`reconcilePosSettlements`), and it comes back if the POS statement is deleted. Re-uploading an overlapping POS period changes nothing: the operation key (RRN plus time) makes every transaction unique.
- **Operation kinds.** Kaspi: sale / refund with the per-operation Kaspi fee (a refund returns part of the fee). Cash sales recorded in Kaspi Pay («Наличные») are checked against «Продажи наличными», count in turnover and are not expected from Kaspi; «Возврат наличными» and «Продажи POS другого банка» are checked the same way. Halyk: «Расчеты по карточкам за DD/MM/YY» = card settlement (sales day + credited day; already net of the acquirer's fee), acquiring refunds, bank fees (with VAT when stated), own-account transfers (never revenue), taxes only when a row says so.
- **Project assignment by city (default).** The city in the merchant-point address is recognised in any spelling (Kazakh/Russian/old names: «г. Тараз, пр. Толе би», «Кызылорда, Желтоқсан», «Нур-Султан»…, whole words only) and mapped to the project named after it (Тараз → Тараз Едусер, Қызылорда → Қызылорда Едусер); Астана goes to the main project. The «Қалалар» table on the Ережелер tab lets the owner move any city to another project or back to automatic. Order: the owner's specific rules (address, contract, counterparty…) → TamshyLab caution → city. Addresses without a city (e.g. «район Нұра…») wait in «Бөлу керек».
- **Owner rules** (field + text, project or «not a project», approved or suggestion-only, priority) cover the specific cases. TamshyLab's built-in rule is **not approved**: matching operations get «Жоба анықталмады» and never enter its totals until a person decides or an approved rule is added. Text matching ignores case and Kazakh letter variants (ұ/у, қ/к…). Statuses: auto, manual, review, unknown, excluded, duplicate. Every change of project or comment is journaled (`bank_history`); rules re-apply to every operation no person has decided.
- **Actual receipts** (per project and month, only auto/manual operations): gross turnover (Kaspi sales + Halyk settlements), refunds, fees, taxes (only if stated — never calculated), after fees, after fees and taxes, credited (Halyk account statement), expected from Kaspi (sales − refunds − fees; not confirmed until a Kaspi account statement exists), operations waiting for assignment (shown apart, never in a project), duplicates skipped.
- **Reports:** by payment method (deals, turnover, share, fee share, average check, fee, rate); installment rate by legal entity (Кредит на покупки, Kaspi Red: fee ÷ volume); refunds by legal entity (count, sum, share of turnover). Excel (4 sheets), CSV of operations, print/PDF view.
- **CRM comparison:** amoCRM and CRM Eduser monthly totals are entered by hand for now (API later); the table compares them with the statement's sales and the credited sum and always shows «Сверка выполнена агрегированно…» because there is no shared deal/payment ID.
- **Revenue from the bank.** Where a project-month has assigned operations, its revenue («Табыс») is the statement's net receipts (turnover − refunds − fees − stated taxes); the manual figure is used only for months without statements (`revenueSource`: bank / manual / ledger). ARPU, profit, margin, per-student profit, trends and the overview all follow. Unit economics adds gross turnover, refund and fee shares, number of sales, average check, profit per sale and the sales needed to cover costs.
- **Integration:** `/api/finance` returns `bank` for the month and `bankFacts` per project and month across the trend window. The project report has «Нақты түсімдер және сверка» (`#receipts`): net receipts − advertising − payroll − rent − teaching costs (contractors, variable) − operating costs = cash operating profit; equipment and deposits apart. Unit economics and the overview show gross turnover, net receipts and cash profit per project, linked to the bank report.
- **Storage:** `bank_statements` (file, hash, checks), `bank_operations`, `bank_rules`, `bank_history`, `bank_crm_totals` (`lib/bank-schema.ts`).
