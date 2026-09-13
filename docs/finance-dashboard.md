# Consolidated finance dashboard

## Scope
All Payroll workspaces, without modifying GrantScope or overwriting payroll history.
`/finance` combines current salary/expense records with a separate supplementary ledger.

## Delivery plan
1. Reconcile source workbooks by project, reporting month, actual/budget and existing record IDs.
2. Add authenticated finance API, supplementary entries and nullable commercial metrics.
3. Provide project/month filters, expense categories, payment status, plan comparison, unit metrics and editable review queue.
4. Import only idempotent, traceable entries. Preserve duplicates and ambiguities as excluded review records.
5. Test calculations, persistence and desktop/mobile browser flows before publication.

## Definitions
- Registered costs are not the same as confirmed cash paid. Unknown payment status is separate from unpaid.
- Payroll uses snapshot settlement amounts. Advance deductions are separately flagged; they are not assumed paid again.
- Equipment and refundable deposits are cash investments/assets, not operating costs. No depreciation or tax rates are invented.
- Profit is the provisional recorded revenue minus recorded operating costs. It is unavailable without revenue and is not audited net income.
- Unit metrics require matching project/month inputs. Missing data is `null`, never a fabricated zero. Aggregate revenue/results require all selected projects to report revenue.
- Budget is never added to actual. Partial advertising periods retain their dates and FX provenance.
- Report duplicates are linked to live IDs and excluded. Ambiguous imports remain visible in review but excluded from totals until resolved.
- Imported source values are private database data, not committed in frontend code.

## Source observations (13 September 2026)
Latest workbook: Айлық_есеп_жарнама_қосылған.xlsx. Its August grouping includes some September dates in the raw source; retain both the original period and the chosen reporting month.
EdUser August source payroll omits deductions of 271,375 KZT; live payroll remains authoritative.
August advertising 01.08–31.08 is a different period from legacy 29.07–29.08; never sum them.
September advertising is partial through 7 September and converted at the source's stated 450.91 KZT/USD, not a verified bank charge.
