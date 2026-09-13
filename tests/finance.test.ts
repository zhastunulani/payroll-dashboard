import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFinance, consolidateFinance, EMPTY_FINANCE_METRICS, normalizeFinanceMetrics, normalizeFinanceEntry, optionalAmount, financePeriod, classifyFinanceCost, type FinanceEntry } from "../lib/finance.ts";
const entry=(amount:number|null,extra:Partial<FinanceEntry>={}):FinanceEntry=>({id:"test",workspaceId:"a",period:"2026-08",name:"Test",category:"payroll",amount,basis:"actual",status:"paid",disposition:"included",source:"",note:"",relatedId:"",origin:"manual",updatedAt:"",...extra});
test("no data is not zero revenue, tax or advertising",()=>{
  const s=summarizeFinance([],EMPTY_FINANCE_METRICS);assert.equal(s.revenue,null);assert.equal(s.profit,null);assert.equal(s.tax,null);assert.equal(s.marketing,null);assert.equal(s.plan,null);assert.equal(s.cpl,null);
});
test("separates payments, budget, review and duplicate records",()=>{
  const s=summarizeFinance([entry(100),entry(30,{status:"unpaid"}),entry(20,{status:"unknown"}),entry(500,{basis:"plan"}),entry(999,{disposition:"review"}),entry(999,{disposition:"duplicate"}),entry(null)],EMPTY_FINANCE_METRICS);
  assert.equal(s.cost,150);assert.equal(s.paid,100);assert.equal(s.unpaid,30);assert.equal(s.unknown,20);assert.equal(s.plan,500);assert.equal(s.review,1);assert.equal(s.duplicates,1);assert.equal(s.missingAmounts,1);assert.equal(s.profit,null);
});
test("equipment and deposits affect cash but not operating profit",()=>{
  const s=summarizeFinance([entry(100),entry(200,{category:"equipment"}),entry(300,{category:"deposit"})],{...EMPTY_FINANCE_METRICS,revenue:1000,receipts:800});
  assert.equal(s.operating,100);assert.equal(s.capital,500);assert.equal(s.cost,600);assert.equal(s.profit,900);assert.equal(s.cashNet,200);
});
test("explicit zero is a reported value",()=>{
  const s=summarizeFinance([entry(0,{category:"tax"}),entry(0,{category:"marketing"})],normalizeFinanceMetrics({revenue:0,units:0}));
  assert.equal(s.revenue,0);assert.equal(s.profit,0);assert.equal(s.tax,0);assert.equal(s.marketing,0);assert.equal(s.unitCost,null);
});
test("unit ratios need aligned source populations and never divide by zero",()=>{
  const inputs=[entry(500),entry(200,{category:"variable"}),entry(100,{category:"marketing"})];
  const m={...EMPTY_FINANCE_METRICS,revenue:1000,units:10,leads:50,customers:5};
  assert.equal(summarizeFinance(inputs,m).cac,null);
  assert.equal(summarizeFinance(inputs,m).unitContribution,null);
  const s=summarizeFinance(inputs,{...m,marketingAligned:true,costsReviewed:true});
  assert.equal(s.cac,20);assert.equal(s.cpl,2);assert.equal(s.unitRevenue,100);assert.equal(s.unitCost,80);assert.equal(s.unitContribution,70);assert.equal(s.breakEvenUnits,8);
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
