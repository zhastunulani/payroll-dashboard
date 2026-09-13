// Read-only preview by default. --apply inserts missing source IDs without replacing existing data.
// Usage: node --experimental-transform-types --env-file=.env.local scripts/import-finance-reports.mjs <source-folder> <latest.xlsx> [--apply] [--keep-report-months]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import readXlsx from 'read-excel-file/node';
import { neon } from '@neondatabase/serverless';
import { FINANCE_SCHEMA } from '../lib/finance-schema.ts';
import { classifyFinanceCost, normalizeFinanceEntry } from '../lib/finance.ts';

const [folder,report,...flags]=process.argv.slice(2);
if(!folder||!report) throw Error('Source folder and latest workbook are required.');
const apply=flags.includes('--apply'), keepMonths=flags.includes('--keep-report-months');
const sql=neon(process.env.DATABASE_URL);
const projects=await sql.query('SELECT id,name FROM workspaces');
const salaries=await sql.query(`SELECT s.*,m.year,m.month FROM salary_snapshots s JOIN months m ON m.id=s.month_id WHERE m.year=2026 AND m.month=8`);
const expenses=await sql.query(`SELECT e.*,m.year,m.month FROM expenses e JOIN months m ON m.id=e.month_id WHERE m.year=2026 AND m.month=8`);
const raw=JSON.parse(await fs.readFile(path.join(folder,'extracted.json'),'utf8'));
const sourceHash=createHash('sha256').update(await fs.readFile(report)).digest('hex');
const sheets=['Едусер','Тараз','Қызылорда','Тамшылаб'];
const workbook=await readXlsx(report);
const projectNames=['EdUser','Тараз Едусер','Қызылорда Едусер','TamshyLab'];
const rows=[];const controls=[];
function add(project,sheet,cell,name,amount,category,basis='actual',note='',extra={}){
  const normalized=normalizeFinanceEntry({workspaceId:project.id,period:basis==='plan'?'2026-09':'2026-08',name,amount,category,basis,status:'unknown',disposition:'included',source:`${path.basename(report)} · ${sheet}!${cell}`,note,relatedId:'',...extra});
  const id='import:monthly-2026:'+createHash('sha256').update(`${sheet}:${cell}`).digest('hex').slice(0,28);
  rows.push({id,...normalized,origin:'import',updatedAt:new Date().toISOString()});
  return rows.at(-1);
}
function duplicate(entry,live,note){entry.disposition='duplicate';entry.relatedId=live;entry.note+=` ${note} Сайттағы жол есепке алынады; Excel сомасы екінші рет қосылмайды.`;}
for(let i=0;i<sheets.length;i++){
  const sheet=sheets[i],project=projects.find(p=>p.name===projectNames[i]);
  if(!project)throw Error(`Project not found: ${projectNames[i]}`);
  const table=workbook.find(s=>s.sheet===sheet)?.data;
  if(!table)throw Error(`Missing source sheet: ${sheet}`);
  const value=(r,c)=>table[r-1]?.[c-1]??null;
  let sourceSum=0,sourceDate='';const consumed=new Set();
  const rawRows=i===1?raw.taraz:i===2?raw.kyzylorda:[];
  // Preserve the explicit or carried-forward source period, with an explanatory note.
  const rawPeriods=new Map();
  for(const r of rawRows){if(r.date && /2026-|Қыркүйек|Тамыз/.test(r.date))sourceDate=r.date;rawPeriods.set(r.row,sourceDate);}
  for(let r=8;r<=table.length;r++){
    const label=value(r,2),rawCategory=value(r,1),amount=value(r,3);
    if(!label||!rawCategory||!(typeof amount==='number'||amount==='Сома белгісіз'))continue;
    const amt=typeof amount==='number'?amount:null;
    if(amt!==null)sourceSum+=amt;
    let category=classifyFinanceCost(String(label),String(rawCategory));
    if(/Видеосабақ|Кітап|Келісім|Тест/.test(String(rawCategory)))category='contractors';
    if(/Жиһаз/.test(String(rawCategory)))category='equipment';
    if(/Техника/.test(String(rawCategory))&&!/ремонт|шнур|удлен/i.test(String(label)))category='equipment';
    if(/Негізгі айлық|Қосымша төлем/.test(String(rawCategory)))category='payroll';
    const entry=add(project,sheet,`C${r}`,String(label),amt,category);
    const rawRow=rawRows.find(x=>!consumed.has(x.row)&&x.label===label&&x.amount===amt);
    if(rawRow){
      consumed.add(rawRow.row);
      entry.note=`Бастапқы жазба: ${rawRow.label}. ${rawRow.description||''} ${rawRow.payer?`Төлеуші: ${rawRow.payer}.`:''}`;
      const date=rawPeriods.get(rawRow.row)||'Тамыз';
      entry.note+=` Бастапқы кезең: ${date}; қорытынды Excel тобы: Тамыз.`;
      if(!keepMonths && (/2026-09/.test(date)||date==='Қыркүйек'))entry.period='2026-09';
      // Building payment includes a separately identified refundable deposit.
      if(i===1&&/депозит.*1млн/i.test(rawRow.description||'')){
        entry.category='rent';entry.amount=amt-1_000_000;entry.name='Ғимарат арендасы';
        add(project,sheet,`C${r}-deposit`,'Ғимараттың қайтарылатын депозиті',1_000_000,'deposit','actual',entry.note,{period:entry.period});
      }
    }
    if(i===0){
      if(category==='payroll')duplicate(entry,`payroll:${project.id}:2026-08`,'Негізгі айлық + қосымшалар агрегаты. Ұсталымдар Excel жиынында жоқ, Payroll нақты есепті сақтайды.');
      if(r===10)duplicate(entry,`expenses:${project.id}:2026-08`,'Операциялық шығындар Payroll-де жеке жазбалармен бар.');
      if(category==='marketing'){
        entry.relatedId=`legacy:${project.id}:2026-08:marketing`;
        entry.note='Күнтізбелік кезең: 01.08–31.08. Бұрынғы 29.07–29.08 таргет сомасының орнына; екі соманы қосуға болмайды. Банк төлемі расталмаған.';
      }
    }
    if(i===1&&entry.category==='rent'){
      const old=expenses.find(e=>e.workspace_id===project.id&&Number(e.amount)===entry.amount&&/аренда/i.test(e.name));
      if(old)duplicate(entry,`expense:${old.id}`,'Аренда сайтта бар. Сайттағы төленбеген статус сақталды.');
    }
    if(i===2&&r===8){const old=expenses.find(e=>e.workspace_id===project.id&&Number(e.amount)===entry.amount&&/аренда/i.test(e.name));if(old)duplicate(entry,`expense:${old.id}`,'Аренда сайтта бар.');}
    if(i===2&&r===9){const old=expenses.find(e=>e.workspace_id===project.id&&/освежить/i.test(e.name));if(old)duplicate(entry,`expense:${old.id}`,'Ғимаратты жаңарту сайтта бар.');}
    if(i===3){
      entry.status=amt===null?'unknown':'paid';
      if([8,9,13,14,15].includes(r)){
        const normalize=s=>s.toLocaleLowerCase().replaceAll('қ','к').trim();
        const name=normalize(String(label).split(/\s*[—:]\s*/)[0]);
        const matches=salaries.filter(s=>s.workspace_id===project.id&&normalize(s.employee_name).startsWith(name)&&Number(s.base_salary)===amt);
        if(matches.length===1)duplicate(entry,`salary:${matches[0].id}`,'Жалақы сайтта бар. Аванс шегерімі жаңа есепте жеке, күйі расталмаған ретінде көрсетіледі.');
        else {entry.disposition='review';entry.note+=' Жалақыны сайттағы нақты жазбамен салыстыру қажет.';}
      }
      if(r===11){entry.disposition='review';entry.status='unknown';entry.note=`Сайтта «Кітап дизайны» төлемі бар. Бұл «${label}» төлемімен бір ме, әлде бөлек пе — нақтылау керек. Қайталанып кетпеуі үшін жиынға қосылмады.`;const old=expenses.find(e=>e.workspace_id===project.id&&e.name==='Кітап дизайны');if(old)entry.relatedId=`expense:${old.id}`;}
      if(r>=17&&r<=20){if(!keepMonths)entry.period='2026-09';entry.note='Бастапқы құжаттағы нақты күн: 12.09.2026, берілді деп көрсетілген. Қорытынды Excel-де Тамыз тобына кірген.';}
      if(r===16)entry.note='Бір кітапқа жалпы төлем. Орындаушыларға ішкі бөлу осы соманың ішінде; қайта қосылмайды.';
    }
    if(amt===null)entry.note+=' Сома берілмеген; жиынға қосылмайды.';
  }
  const expected=value(3,3);if(typeof expected!=='number'||Math.abs(sourceSum-expected)>0.01)throw Error(`${sheet}: source control mismatch ${sourceSum} vs ${expected}`);
  controls.push({sheet,sourceAugustTotal:sourceSum,expected,sourceHash});
  const end=({Едусер:9,Тараз:27,Қызылорда:14,Тамшылаб:9})[sheet];
  let planSum=0;
  for(let r=8;r<=end;r++){
    const name=value(r,5),amount=value(r,6);if(!name)continue;
    if(typeof amount==='number')planSum+=amount;
    add(project,sheet,`F${r}`,String(name),typeof amount==='number'?amount:null,classifyFinanceCost(String(name)),'plan',`Алдын ала жоспар, фактке қосылмайды. ${value(r,7)||''}`);
  }
  if(typeof value(3,6)!=='number'||Math.abs(planSum-value(3,6))>0.01)throw Error(`${sheet}: budget control mismatch`);
  const adHeader=table.findIndex(row=>row[4]==='Таргет / жарнама')+1;
  if(adHeader){
    const adPeriod=value(adHeader+1,6),usd=value(adHeader+2,6),fx=value(adHeader+3,6),kzt=value(adHeader+4,6);
    if(Math.abs(Math.round(usd*fx*100)/100-kzt)>0.01)throw Error('FX control mismatch');
    add(project,sheet,`F${adHeader+4}`,'Таргет / жарнама',kzt,'marketing','actual',`Кезең: ${adPeriod}. Толық ай емес. ${usd} USD × ${fx} ₸/USD. Бағам дереккөзде: 13.09.2026. Бұл конвертацияланған есеп, банктен алынған нақты теңге сомасы емес.`,{period:'2026-09'});
  }
}
const unique=new Set(rows.map(r=>r.id));if(!rows.length||unique.size!==rows.length)throw Error('Missing or duplicate source identities');
const directory=path.resolve('work/finance-import');await fs.mkdir(directory,{recursive:true});
await fs.writeFile(path.join(directory,'preview.json'),JSON.stringify({sourceHash,keepMonths,controls,entries:rows},null,2));
console.log(JSON.stringify({mode:apply?'apply':'preview',keepMonths,rows:rows.length,controls:controls.map(c=>({sheet:c.sheet,total:c.sourceAugustTotal})),included:rows.filter(r=>r.disposition==='included').length,duplicates:rows.filter(r=>r.disposition==='duplicate').length,review:rows.filter(r=>r.disposition==='review').length,missing:rows.filter(r=>r.amount===null).length},null,2));
if(apply){
  const existing=await sql.query("SELECT to_regclass('public.finance_entries') AS tab");
  const backup=existing[0].tab?await sql.query('SELECT * FROM finance_entries'):[];
  await fs.writeFile(path.join(directory,`backup-${Date.now()}.json`),JSON.stringify({projects,salaries,expenses,previousFinance:backup},null,2));
  await sql.transaction(FINANCE_SCHEMA.map(q=>sql.query(q)));
  const result=await sql.transaction(rows.map(r=>sql.query(`INSERT INTO finance_entries(id,workspace_id,period,name,category,amount,basis,status,disposition,source,note,related_id,origin,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'import',$13) ON CONFLICT(id) DO NOTHING RETURNING id`,[r.id,r.workspaceId,r.period,r.name,r.category,r.amount,r.basis,r.status,r.disposition,r.source,r.note,r.relatedId,r.updatedAt])));
  console.log(JSON.stringify({inserted:result.reduce((s,r)=>s+r.length,0),alreadyPresent:rows.length-result.reduce((s,r)=>s+r.length,0)}));
}
