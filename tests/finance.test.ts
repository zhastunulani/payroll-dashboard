import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFinance, consolidateFinance, EMPTY_FINANCE_METRICS, normalizeFinanceMetrics, normalizeFinanceEntry, optionalAmount, financePeriod, classifyFinanceCost, periodWindow, trendPoint, financeIssues, type FinanceEntry } from "../lib/finance.ts";
const entry=(amount:number|null,extra:Partial<FinanceEntry>={}):FinanceEntry=>({id:"test",workspaceId:"a",period:"2026-08",name:"Test",category:"payroll",amount,basis:"actual",status:"paid",disposition:"included",source:"",note:"",relatedId:"",origin:"manual",updatedAt:"",...extra});
test("no data is not zero revenue, tax or advertising",()=>{
  const s=summarizeFinance([],EMPTY_FINANCE_METRICS);assert.equal(s.revenue,null);assert.equal(s.profit,null);assert.equal(s.tax,null);assert.equal(s.marketing,null);assert.equal(s.plan,null);assert.equal(s.cpl,null);
});
test("separates payments, budget, review and duplicate records",()=>{
  const s=summarizeFinance([entry(100),entry(30,{status:"unpaid"}),entry(20,{status:"unknown"}),entry(500,{basis:"plan"}),entry(999,{disposition:"review"}),entry(999,{disposition:"duplicate"}),entry(null)],EMPTY_FINANCE_METRICS);
  // Only an explicit «unpaid» is owed; spending without a confirmed status was already spent.
  assert.equal(s.cost,150);assert.equal(s.paid,120);assert.equal(s.unpaid,30);assert.equal(s.plan,500);assert.equal(s.review,1);assert.equal(s.duplicates,1);assert.equal(s.missingAmounts,1);assert.equal(s.profit,null);
});
test("salaries and mandatory payments are obligations; one-time and advertising are spent money",()=>{
  const rows=[
    entry(300,{id:"salary:1",origin:"salary",status:"paid"}),
    entry(200,{id:"salary:2",origin:"salary",status:"unpaid"}),
    entry(50,{id:"advance:2",origin:"salary",status:"paid"}),
    entry(1000,{id:"expense:rent",origin:"expense",category:"rent",status:"unpaid"}),
    entry(150,{id:"expense:net",origin:"expense",category:"services",status:"paid"}),
    entry(400,{id:"expense:desk",origin:"expense",category:"equipment",status:"unpaid",oneTime:true}),
    entry(700,{id:"import:ads",origin:"import",category:"marketing",status:"unknown"}),
    entry(80,{id:"import:event",origin:"import",category:"events",status:"unknown"}),
  ];
  const s=summarizeFinance(rows,EMPTY_FINANCE_METRICS);
  assert.deepEqual(s.kinds.salary,{total:550,paid:350,unpaid:200,count:3,unpaidCount:1});
  assert.deepEqual(s.kinds.mandatory,{total:1150,paid:150,unpaid:1000,count:2,unpaidCount:1});
  assert.deepEqual(s.kinds.target,{total:700,paid:700,unpaid:0,count:1,unpaidCount:0});
  assert.deepEqual(s.kinds.other,{total:480,paid:480,unpaid:0,count:2,unpaidCount:0});
  assert.deepEqual(s.obligations,{total:1700,paid:500,unpaid:1200,share:500/1700});
  assert.equal(s.unpaid,1200);assert.equal(s.paid,1680);assert.equal(s.cost,2880);
  assert.equal(s.payroll.paid,350);assert.equal(s.payroll.unpaid,200);
  const codes=financeIssues(s,EMPTY_FINANCE_METRICS,{payrollMonth:true,closed:false}).map(i=>i.code);
  assert.ok(codes.includes("unpaid-salary")&&codes.includes("unpaid-mandatory"));assert.ok(!codes.includes("unpaid-other"));
});
test("equipment and deposits affect cash but not operating profit",()=>{
  const s=summarizeFinance([entry(100),entry(200,{category:"equipment"}),entry(300,{category:"deposit"})],{...EMPTY_FINANCE_METRICS,revenue:1000,receipts:800});
  assert.equal(s.operating,100);assert.equal(s.capital,500);assert.equal(s.cost,600);assert.equal(s.profit,900);assert.equal(s.cashNet,200);
});
test("explicit zero is a reported value",()=>{
  const s=summarizeFinance([entry(0,{category:"tax"}),entry(0,{category:"marketing"})],normalizeFinanceMetrics({revenue:0,units:0}));
  assert.equal(s.revenue,0);assert.equal(s.profit,0);assert.equal(s.tax,0);assert.equal(s.marketing,0);assert.equal(s.unitCost,null);
});
test("unit ratios are computed from reported inputs, flagged until confirmed, and never divide by zero",()=>{
  const inputs=[entry(500),entry(200,{category:"variable"}),entry(100,{category:"marketing"})];
  const m={...EMPTY_FINANCE_METRICS,revenue:1000,units:10,leads:50,customers:5};
  const unconfirmed=summarizeFinance(inputs,m);
  assert.equal(unconfirmed.cac,20);assert.equal(unconfirmed.funnel.confirmed,false);assert.equal(unconfirmed.unit.confirmed,false);
  const s=summarizeFinance(inputs,{...m,marketingAligned:true,costsReviewed:true});
  assert.equal(s.cac,20);assert.equal(s.cpl,2);assert.equal(s.funnel.conversion,0.1);
  assert.equal(s.unitRevenue,100);assert.equal(s.unitCost,80);
  // Unit contribution = ARPU − variable cost per unit; fixed costs incl. marketing are covered by volume.
  assert.equal(s.unitContribution,80);assert.equal(s.breakEvenUnits,8);
  assert.equal(s.unit.paybackMonths,0.25);assert.equal(s.unit.ltv,null);
  assert.equal(summarizeFinance(inputs,{...m,leads:0,customers:0,units:0}).cac,null);
});
test("LTV, LTV/CAC and ROMI use client lifetime when it is reported",()=>{
  const s=summarizeFinance([entry(300),entry(100,{category:"marketing"})],{...EMPTY_FINANCE_METRICS,revenue:1000,units:10,customers:2,leads:20,retentionMonths:6});
  assert.equal(s.unit.ltv,600);assert.equal(s.unit.ltvCac,12);assert.equal(s.unit.romiBasis,"ltv");
  assert.equal(s.unit.romi,11);
  const monthOnly=summarizeFinance([entry(300),entry(100,{category:"marketing"})],{...EMPTY_FINANCE_METRICS,revenue:1000,units:10,customers:2});
  assert.equal(monthOnly.unit.romiBasis,"month");assert.equal(monthOnly.unit.romi,1);
});
test("groups costs into a management P&L and payroll by department",()=>{
  const rows=[
    entry(300,{id:"salary:1",origin:"salary",group:"Академ",status:"paid"}),
    entry(200,{id:"salary:2",origin:"salary",group:"Академ",status:"unpaid"}),
    entry(50,{id:"advance:2",origin:"salary",group:"Академ",status:"paid"}),
    entry(0,{id:"salary:3",origin:"salary",group:"Сату"}),
    entry(400,{category:"rent"}),entry(100,{category:"marketing"}),entry(70,{category:"tax"}),entry(900,{category:"equipment"}),
  ];
  const s=summarizeFinance(rows,EMPTY_FINANCE_METRICS);
  assert.deepEqual(s.groups,{payroll:550,marketing:100,opex:400,tax:70,capex:900});
  assert.equal(s.operating,1120);assert.equal(s.capital,900);
  assert.equal(s.payroll.headcount,2);assert.equal(s.payroll.average,250);assert.equal(s.payroll.advances,50);
  assert.equal(s.payroll.unpaid,200);assert.equal(s.payroll.unpaidPeople,1);
  assert.deepEqual(s.payroll.departments.map(d=>[d.name,d.amount,d.headcount]),[["Академ",550,2],["Сату",0,0]]);
  assert.deepEqual(s.categories.map(c=>c.key),["payroll","marketing","rent","tax","equipment"]);
});
test("USD advertising is converted from its own amount and rate",()=>{
  const e=normalizeFinanceEntry({workspaceId:"a",period:"2026-09",name:"Meta",category:"marketing",amount:1,basis:"actual",status:"paid",disposition:"included",currency:"USD",currencyAmount:100,fxRate:450.91});
  assert.equal(e.amount,45091);assert.equal(e.currencyAmount,100);assert.equal(e.fxRate,450.91);
  assert.throws(()=>normalizeFinanceEntry({workspaceId:"a",period:"2026-09",name:"Meta",category:"marketing",basis:"actual",status:"paid",disposition:"included",currency:"USD",currencyAmount:100}));
  const kzt=normalizeFinanceEntry({workspaceId:"a",period:"2026-09",name:"Meta",category:"marketing",amount:500,basis:"actual",status:"paid",disposition:"included",currencyAmount:9,fxRate:9});
  assert.equal(kzt.currency,"KZT");assert.equal(kzt.currencyAmount,null);assert.equal(kzt.amount,500);
  const s=summarizeFinance([entry(45091,{category:"marketing",currency:"USD",currencyAmount:100,fxRate:450.91}),entry(1000,{category:"marketing"})],{...EMPTY_FINANCE_METRICS,leads:10});
  assert.equal(s.funnel.spend,46091);assert.equal(s.funnel.spendUsd,100);assert.equal(s.funnel.cpl,4609.1);
});
test("trend window spans calendar months across a year boundary",()=>{
  assert.deepEqual(periodWindow("2026-02",4),["2025-11","2025-12","2026-01","2026-02"]);
  const p=trendPoint("2026-01",[],EMPTY_FINANCE_METRICS);
  assert.equal(p.hasData,false);assert.equal(p.cost,0);assert.equal(p.revenue,null);
});
test("data-quality checklist names what blocks a reliable report",()=>{
  const rows=[entry(200,{id:"salary:1",origin:"salary",status:"unpaid"}),entry(100,{category:"marketing"})];
  const codes=financeIssues(summarizeFinance(rows,EMPTY_FINANCE_METRICS),EMPTY_FINANCE_METRICS,{payrollMonth:true,closed:true});
  const byCode=Object.fromEntries(codes.map(i=>[i.code,i]));
  assert.equal(byCode["no-revenue"]?.level,"critical");assert.equal(byCode["unpaid-salary"]?.level,"critical");assert.equal(byCode["unpaid-salary"]?.amount,200);
  assert.ok(byCode["no-leads"]&&byCode["no-customers"]&&byCode["no-tax"]);assert.equal(byCode["unknown-status"],undefined);
  const clean=financeIssues(summarizeFinance([entry(100,{category:"tax"})],{...EMPTY_FINANCE_METRICS,revenue:500,units:5}),{...EMPTY_FINANCE_METRICS,revenue:500,units:5},{payrollMonth:true,closed:false});
  assert.deepEqual(clean,[]);
});
test("consolidated funnel pools leads only when every advertising project reports them",()=>{
  const a={entries:[entry(100,{category:"marketing"})],metrics:{...EMPTY_FINANCE_METRICS,leads:10,customers:2}};
  const b={entries:[entry(300,{category:"marketing"})],metrics:{...EMPTY_FINANCE_METRICS,leads:30,customers:3}};
  const c={entries:[entry(50)],metrics:EMPTY_FINANCE_METRICS};
  const full=consolidateFinance([a,b,c]);
  assert.equal(full.funnel.leads,40);assert.equal(full.funnel.cpl,10);assert.equal(full.funnel.cac,80);
  const partial=consolidateFinance([a,{...b,metrics:EMPTY_FINANCE_METRICS}]);
  assert.equal(partial.funnel.leads,null);assert.equal(partial.funnel.cpl,null);
});
test("consolidated profit is unavailable with partial revenue coverage",()=>{
  const s=consolidateFinance([{entries:[entry(100)],metrics:{...EMPTY_FINANCE_METRICS,revenue:1000}},{entries:[entry(200)],metrics:EMPTY_FINANCE_METRICS}]);
  assert.equal(s.cost,300);assert.equal(s.revenue,null);assert.equal(s.profit,null);assert.equal(s.revenueCoverage,1);
});
test("consolidation adds project results, never heterogeneous unit counts",()=>{
  const s=consolidateFinance([{entries:[entry(100)],metrics:{...EMPTY_FINANCE_METRICS,revenue:1000,units:2}},{entries:[entry(200)],metrics:{...EMPTY_FINANCE_METRICS,revenue:400,units:3}}]);
  assert.equal(s.revenue,1400);assert.equal(s.profit,1100);assert.equal(s.unitCost,null);
});
test("precision, validation, and property safety",()=>{
  assert.equal(summarizeFinance([entry(0.1),entry(0.2)],EMPTY_FINANCE_METRICS).cost,0.3);
  for(const x of [-1,Infinity,NaN,{},true,'garbage']) assert.throws(()=>optionalAmount(x));
  assert.throws(()=>normalizeFinanceMetrics({units:1.5}));assert.equal(optionalAmount(''),null);
  assert.throws(()=>financePeriod('2026-13'));assert.throws(()=>normalizeFinanceEntry({category:'__proto__' as never}));
  assert.equal(classifyFinanceCost('Жанерке парта'),'equipment');assert.equal(classifyFinanceCost('Амо срм подписка'),'services');
});
test("per-entry cost behavior changes unit economics without duplicating payroll",()=>{
  const m={...EMPTY_FINANCE_METRICS,revenue:1000,units:10,costsReviewed:true};
  const s=summarizeFinance([entry(200,{costBehavior:"variable"}),entry(300,{id:"fixed",costBehavior:"fixed"})],m);
  assert.equal(s.cost,500);assert.equal(s.unitContribution,80);assert.equal(s.breakEvenUnits,4);
});
