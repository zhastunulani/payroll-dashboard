<script setup lang="ts">
import { ArrowDownToLine, Check, CirclePlus, Pencil, RefreshCw, SlidersHorizontal, WalletCards } from "lucide-vue-next";
import { FINANCE_CATEGORIES, EMPTY_FINANCE_METRICS, isOperatingCost, consolidateFinance, summarizeFinance, type FinanceEntry, type FinanceMetrics, type FinanceProject } from "../../lib/finance";
type Data = { period:string; projects:FinanceProject[]; entries:FinanceEntry[]; metrics:Record<string,FinanceMetrics>; metricVersions:Record<string,string>; periods:string[] };
const route=useRoute();
const payroll=usePayroll();
const initialPeriod=typeof route.query.period==='string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(route.query.period)?route.query.period:new Date().toISOString().slice(0,7);
const period=ref(initialPeriod), project=ref("all"), data=shallowRef<Data|null>(null), loading=ref(false), error=ref(""), success=ref("");
const category=ref("all"), search=ref(""), view=ref("actual"), page=ref(1);
const entryOpen=ref(false), metricsOpen=ref(false), saving=ref(false), formError=ref("");
const entry=ref<Partial<FinanceEntry>>({}), metrics=ref<FinanceMetrics>({...EMPTY_FINANCE_METRICS}), metricsProject=ref("");
let loadId=0;
const money=(n:number|null|undefined)=>n===null||n===undefined?"—":`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n).replace(/\u00a0/g,' ')} ₸`;
const number=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
const selectedProjects=computed(()=>data.value?.projects.filter(p=>project.value==='all'||p.id===project.value)||[]);
const selectedEntries=computed(()=>data.value?.entries.filter(e=>project.value==='all'||e.workspaceId===project.value)||[]);
const cards=computed(()=>selectedProjects.value.map(p=>({...p,summary:summarizeFinance(data.value!.entries.filter(e=>e.workspaceId===p.id),data.value!.metrics[p.id]||EMPTY_FINANCE_METRICS)})));
const summary=computed(()=>project.value!=='all' && cards.value[0]?cards.value[0].summary:consolidateFinance(selectedProjects.value.map(p=>({entries:data.value!.entries.filter(e=>e.workspaceId===p.id),metrics:data.value!.metrics[p.id]||EMPTY_FINANCE_METRICS}))));
const reviewCount=computed(()=>selectedEntries.value.filter(e=>e.disposition==='review'||e.disposition==='included'&&e.amount===null).length);
const rows=computed(()=>selectedEntries.value.filter(e=>
  (view.value==='review' ? e.disposition==='review'||e.disposition==='included'&&e.amount===null : view.value==='duplicates'?e.disposition==='duplicate':e.disposition==='included'&&e.basis===view.value)
  &&(category.value==='all'||e.category===category.value)
  &&`${e.name} ${e.note} ${e.source}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())
).sort((a,b)=>(b.amount??0)-(a.amount??0)));
const shownRows=computed(()=>rows.value.slice((page.value-1)*30,page.value*30));
const pages=computed(()=>Math.max(1,Math.ceil(rows.value.length/30)));
const statusLabels={paid:"Төленген",unpaid:"Төленбеген",unknown:"Расталмаған"};
const editable=(e:FinanceEntry)=>e.origin==='import'||e.origin==='manual';
function projectName(id:string){return data.value?.projects.find(p=>p.id===id)?.name||id;}
async function openLive(r:FinanceEntry){
  await payroll.load(r.period,r.workspaceId);
  if(payroll.error.value || payroll.data.value?.selectedWorkspace.id!==r.workspaceId || payroll.data.value?.selectedMonth.id!==r.period){error.value='Payroll жазбасын осы жоба мен айда ашу мүмкін болмады.';return;}
  await navigateTo(r.origin==='salary'?'/departments':r.origin==='legacy'?'/unit-economics':r.note==='Басқа шығындар'?'/other-expenses':'/expenses');
}
function message(e:unknown){return (e as {data?:{message?:string};message?:string})?.data?.message||(e as Error)?.message||"Қате орын алды.";}
async function load(){
  const id=++loadId;loading.value=true;error.value="";
  try{const result=await $fetch<Data>("/api/finance",{query:{period:period.value}});if(id===loadId)data.value=result;}
  catch(e){if(id===loadId){error.value=message(e);data.value=null;}}
  finally{if(id===loadId)loading.value=false;}
}
watch(period,()=>{data.value=null;success.value="";load();});
watch([period,project,view,category,search],()=>{page.value=1;});
onMounted(load);
function openEntry(e?:FinanceEntry){
  formError.value="";
  entry.value=e?{...e}:{workspaceId:project.value==='all'?data.value?.projects[0]?.id:project.value,period:period.value,name:"",category:"other",amount:null,basis:view.value==='plan'?'plan':'actual',status:"unknown",disposition:"included",source:"Қолмен енгізілген",note:"",relatedId:""};
  entryOpen.value=true;
}
function openMetrics(){metricsProject.value=project.value==='all'?data.value?.projects[0]?.id||"":project.value;fillMetrics();formError.value="";metricsOpen.value=true;}
function fillMetrics(){metrics.value={...(data.value?.metrics[metricsProject.value]||EMPTY_FINANCE_METRICS)};}
async function save(kind:'entry'|'metrics'){
  saving.value=true;formError.value="";
  try{
    await $fetch('/api/finance',{method:'POST',body:kind==='entry'?{action:kind,entry:entry.value}:{action:kind,workspaceId:metricsProject.value,period:period.value,metrics:metrics.value,version:data.value?.metricVersions[metricsProject.value]??null}});
    entryOpen.value=false;metricsOpen.value=false;success.value="Сақталды. Есеп жаңартылды.";await load();
  }catch(e){formError.value=message(e);}finally{saving.value=false;}
}
async function classify(r:FinanceEntry,event:Event){
  const target=event.target as HTMLSelectElement;
  try{await $fetch('/api/finance',{method:'POST',body:{action:'classification',workspaceId:r.workspaceId,period:r.period,id:r.id,behavior:target.value}});await load();}
  catch(e){error.value=message(e);target.value=r.costBehavior||'fixed';}
}
function exportRows(){
  const fields=['Жоба','Есептік ай','Атауы','Категория','Сома, ₸','Факт / жоспар','Төлем күйі','Есепке қосылуы','Дереккөз','Ескерту'];
  // Neutralize spreadsheet formula injection in user-authored text.
  const escape=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const csv='\uFEFF'+[fields,...rows.value.map(e=>[projectName(e.workspaceId),e.period,e.name,FINANCE_CATEGORIES[e.category],e.amount??'',e.basis==='plan'?'Жоспар':'Факт',statusLabels[e.status],e.disposition,e.source,e.note])].map(r=>r.map(escape).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`finance-${period.value}-${view.value}.csv`;a.click();URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="finance-page">
    <header class="finance-heading">
      <div><span class="eyebrow">БИЗНЕС ҚАРЖЫСЫ</span><h1>Барлық жоба — бір есепте</h1><p>Айлық, операциялық шығын және қаржылық нәтиже</p></div>
      <button class="button secondary" :disabled="loading" @click="load"><RefreshCw :size="16"/> Жаңарту</button>
    </header>
    <section class="finance-toolbar panel" aria-label="Есеп сүзгілері">
      <label>Есептік ай<input v-model="period" type="month" min="2000-01" max="2099-12"></label>
      <label>Жобалар<select v-model="project"><option value="all">Барлық жобалар</option><option v-for="p in data?.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <div class="finance-actions"><button class="button secondary" :disabled="!data||loading" @click="openMetrics"><SlidersHorizontal :size="16"/> Табыс / юнит деректері</button><button class="button primary" :disabled="!data||loading" @click="openEntry()"><CirclePlus :size="16"/> Жазба қосу</button></div>
    </section>
    <p v-if="error" class="finance-error" role="alert">{{ error }} <button @click="load">Қайта жүктеу</button></p>
    <p v-if="success" class="finance-success" role="status"><Check :size="16"/>{{ success }}</p>
    <p v-if="loading" role="status">Есеп жүктелуде…</p>
    <template v-if="data && !loading">
      <section class="finance-kpis" aria-label="Негізгі көрсеткіштер">
        <article class="finance-kpi finance-primary"><span>Есепке алынған барлық шығын</span><strong>{{ money(summary.cost) }}</strong><small>Төленген + төленбеген + күйі расталмаған</small></article>
        <article class="finance-kpi"><span>Нақты төленген</span><strong>{{ money(summary.paid) }}</strong><small>Тек төленген деп белгіленген жазбалар</small></article>
        <article class="finance-kpi"><span>Төленуі керек</span><strong>{{ money(summary.unpaid) }}</strong><small>Расталған берешек · аванс қайта қосылмайды</small></article>
        <article class="finance-kpi"><span>Төлем күйі расталмаған</span><strong>{{ money(summary.unknown) }}</strong><small>Бұл сома «төленгенге» қосылмайды</small></article>
        <article v-if="summary.revenue!==null" class="finance-kpi"><span>Жалпы табыс</span><strong>{{ money(summary.revenue) }}</strong><small>Осы айда танылған табыс</small></article>
        <article v-if="summary.profit!==null" class="finance-kpi" :class="{'finance-negative':summary.profit<0}"><span>Алдын ала операциялық нәтиже</span><strong>{{ money(summary.profit) }}</strong><small>Табыс − тіркелген операциялық шығын</small></article>
        <article v-if="summary.marketing!==null" class="finance-kpi"><span>Маркетинг / таргет</span><strong>{{ money(summary.marketing) }}</strong><small>Кезеңдер әр жазбаның дереккөзінде көрсетілген</small></article>
        <article v-if="summary.tax!==null" class="finance-kpi"><span>Салық және аударымдар</span><strong>{{ money(summary.tax) }}</strong><small>Енгізілген сомалар ғана · болжам жоқ</small></article>
      </section>
      <div class="finance-notice"><WalletCards :size="19"/><div><strong>Есептің толықтығы</strong><p v-if="summary.revenue===null">{{ project==='all'?'Барлық таңдалған жобаның табысы енгізілмеген. Жалпы пайда/залал әлі есептелмейді.':'Табыс енгізілмеген. Пайда/залал әлі есептелмейді.' }}</p><p>Бұл банк көшірмесі емес: есептік айға тіркелген деректер. Сомасы белгісіз {{ summary.missingAmounts }} жазба және нақтылауды қажет ететін {{ summary.review }} жазба жиынға кірмейді. Салық пен амортизация толық енгізілмесе, нәтиже толық таза пайда болып саналмайды.</p></div></div>
      <section v-if="project==='all'" class="panel finance-section">
        <header><div><span class="eyebrow">ЖОБАЛАРДЫ САЛЫСТЫРУ</span><h2>Әр жобаның бюджеті</h2></div><small>Жобаны басып, толық есепті ашыңыз</small></header>
        <div class="finance-projects"><button v-for="p in cards" :key="p.id" @click="project=p.id"><span class="finance-project-title">{{ p.name }} <span>↗</span></span><strong>{{ money(p.summary.cost) }}</strong><small>Төленген <b>{{ money(p.summary.paid) }}</b></small><small v-if="p.summary.plan!==null">Жоспар <b>{{ money(p.summary.plan) }}</b></small><small v-if="p.summary.revenue!==null">Табыс <b>{{ money(p.summary.revenue) }}</b></small><small v-else>Табыс енгізілмеген</small></button></div>
      </section>
      <div class="finance-columns">
        <section class="panel finance-section"><header><div><span class="eyebrow">ШЫҒЫН ҚҰРЫЛЫМЫ</span><h2>Категориялар</h2></div><small>Факт / жоспар</small></header>
          <p v-if="!summary.categories.length" class="finance-empty">Осы кезеңде дерек жоқ. Алғашқы жазбаны қосыңыз.</p>
          <button v-for="c in summary.categories" :key="c.key" class="finance-category" @click="category=c.key"><span>{{ c.name }}<small v-if="c.key==='equipment'||c.key==='deposit'">Операциялық нәтижеге кірмейді</small></span><span><b>{{ money(c.amount) }}</b><small v-if="c.plan!==null">Жоспар: {{ money(c.plan) }}</small></span><i :style="{width:`${summary.cost>0?Math.min(100,(c.amount??0)/summary.cost*100):0}%`}"/></button>
        </section>
        <section class="panel finance-section"><header><div><span class="eyebrow">БЮДЖЕТ ЖӘНЕ ЮНИТ</span><h2>Қаржылық талдау</h2></div></header>
          <dl class="finance-analysis"><div><dt>Операциялық шығын</dt><dd>{{ money(summary.operating) }}</dd></div><div v-if="summary.capital"><dt>Жабдық және депозит</dt><dd>{{ money(summary.capital) }}</dd></div><div v-if="summary.plan!==null"><dt>Белгілі жоспар</dt><dd>{{ money(summary.plan) }}</dd></div><div v-if="summary.plan!==null"><dt>Жоспар − тіркелген факт</dt><dd>{{ money(summary.plan-summary.cost) }}</dd></div><div v-if="summary.cashNet!==null"><dt>Түсім − төленген шығын</dt><dd>{{ money(summary.cashNet) }}</dd></div><div v-if="summary.margin!==null"><dt>Операциялық маржа</dt><dd>{{ number(summary.margin*100) }}%</dd></div><div v-if="summary.unitCost!==null"><dt>Бір юнитке операциялық шығын</dt><dd>{{ money(summary.unitCost) }}</dd></div><div v-if="summary.unitRevenue!==null"><dt>Бір юнитке табыс</dt><dd>{{ money(summary.unitRevenue) }}</dd></div><div v-if="summary.unitContribution!==null"><dt>Бір юниттің маржиналдық табысы</dt><dd>{{ money(summary.unitContribution) }}</dd></div><div v-if="summary.cpl!==null"><dt>Лид құны · CPL</dt><dd>{{ money(summary.cpl) }}</dd></div><div v-if="summary.cac!==null"><dt>Клиент тарту құны · CAC</dt><dd>{{ money(summary.cac) }}</dd></div><div v-if="summary.breakEvenUnits!==null"><dt>Залалсыздық нүктесі, юнит</dt><dd>{{ number(summary.breakEvenUnits) }}</dd></div></dl>
          <p class="finance-footnote">{{ project==='all'?'Юнит талдауы үшін бір жобаны таңдаңыз. Әртүрлі жобалардың клиент санын араластырмаймыз.':'Табыс пен юнит санын енгізсеңіз, бір юниттің нәтижесі пайда болады. CPL/CAC үшін маркетинг пен клиент деректерінің кезеңін растаңыз.' }}</p><p class="finance-footnote">Жоспар — жеке бюджет; фактпен қосылмайды. Ай толық жабылмайынша айырманы үнем деп қабылдамаңыз. Юнит формуласы: (табыс − тікелей шығын − маркетинг) / юнит саны. Тікелей шығындар толық жіктелуі керек.</p>
        </section>
      </div>
      <section class="panel finance-section finance-ledger">
        <header><div><span class="eyebrow">ТОЛЫҚ РЕЕСТР</span><h2>Ақша қайда жұмсалды?</h2></div><button class="button secondary" @click="exportRows"><ArrowDownToLine :size="16"/> CSV экспорт</button></header>
        <div class="finance-tabs" role="group" aria-label="Жазба түрі"><button :class="{active:view==='actual'}" @click="view='actual'">Факт</button><button :class="{active:view==='plan'}" @click="view='plan'">Жоспар</button><button :class="{active:view==='review'}" @click="view='review'">Нақтылау керек ({{ reviewCount }})</button><button :class="{active:view==='duplicates'}" @click="view='duplicates'">Қайта қосылмаған ({{ summary.duplicates }})</button></div>
        <div class="finance-filters"><input v-model="search" type="search" aria-label="Жазбаны іздеу" placeholder="Атауын немесе дереккөзді іздеу"><select v-model="category" aria-label="Категория"><option value="all">Барлық категориялар</option><option v-for="(label,key) in FINANCE_CATEGORIES" :key="key" :value="key">{{ label }}</option></select><span>{{ rows.length }} жазба</span></div>
        <div v-if="!rows.length" class="finance-empty">Бұл сүзгі бойынша жазба жоқ.</div>
        <div class="finance-records"><article v-for="r in shownRows" :key="r.id" class="finance-record"><div><small>{{ projectName(r.workspaceId) }} · {{ FINANCE_CATEGORIES[r.category] }}</small><h3>{{ r.name }}</h3><details v-if="r.note||r.source"><summary>Дереккөз және түсіндірме</summary><p>{{ r.source }}</p><p>{{ r.note }}</p><p v-if="r.relatedId">Байланысты жазба: {{ r.relatedId }}</p><label v-if="r.basis==='actual' && isOperatingCost(r.category) && r.category!=='marketing'" class="finance-rule">Юнит шығынының түрі<select :value="r.costBehavior||'fixed'" :aria-label="`${r.name}: юнит шығынының түрі`" @change="classify(r,$event)"><option value="fixed">Тұрақты / үстеме шығын</option><option value="variable">Тікелей / айнымалы шығын</option></select></label></details></div><div class="finance-record-money"><strong>{{ r.amount===null?'Сома қажет':money(r.amount) }}</strong><small v-if="r.basis==='actual'" :class="'finance-status-'+r.status">{{ statusLabels[r.status] }}</small><small v-else>Жоспар</small></div><button v-if="editable(r)" class="icon-button" :aria-label="`${r.name}: өзгерту`" @click="openEntry(r)"><Pencil :size="16"/></button><button v-else class="finance-live-link" :disabled="payroll.loading.value" @click="openLive(r)">Payroll ↗</button></article></div>
        <footer class="finance-pagination"><button class="button secondary" :disabled="page<=1" @click="page--">Алдыңғы</button><span>{{ page }} / {{ pages }}</span><button class="button secondary" :disabled="page>=pages" @click="page++">Келесі</button></footer>
      </section>
    </template>
    <UiModal v-if="entryOpen" title="Қаржылық жазба" description="Жаңа сома Payroll-дегі жазбадан бөлек қосылады. Бар жазбаны қайталап енгізбеңіз." @close="!saving&&(entryOpen=false)">
      <form class="form-grid two" @submit.prevent="save('entry')"><label class="form-field">Жоба<select v-model="entry.workspaceId" required><option v-for="p in data?.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label class="form-field">Есептік ай<input v-model="entry.period" type="month" required></label><label class="form-field wide">Төлем / шығын атауы<input v-model="entry.name" maxlength="200" required></label><label class="form-field">Категория<select v-model="entry.category"><option v-for="(label,key) in FINANCE_CATEGORIES" v-show="key!=='revenue'" :key="key" :value="key">{{ label }}</option></select></label><label class="form-field">Сома, ₸<input v-model="entry.amount" type="number" min="0" step="0.01" placeholder="Белгісіз болса бос қалдырыңыз"></label><label class="form-field">Факт / жоспар<select v-model="entry.basis"><option value="actual">Факт / есептелген</option><option value="plan">Жоспар</option></select></label><label class="form-field">Төлем күйі<select v-model="entry.status"><option value="unknown">Расталмаған</option><option value="paid">Төленген</option><option value="unpaid">Төленбеген</option></select></label><label class="form-field wide">Есепке қосу<select v-model="entry.disposition"><option value="included">Есепке қосылады</option><option value="review">Нақтылау керек — қосылмайды</option><option value="duplicate">Қайталама / есептен тыс — қосылмайды</option></select></label><label class="form-field wide">Дереккөз<input v-model="entry.source" maxlength="1000"></label><label class="form-field wide">Түсіндірме<textarea v-model="entry.note" rows="3" maxlength="3000"/></label><p v-if="formError" class="finance-error form-field wide" role="alert">{{ formError }}</p><button class="button primary" :disabled="saving">{{ saving?'Сақталуда…':'Сақтау' }}</button></form>
    </UiModal>
    <UiModal v-if="metricsOpen" title="Табыс және юнит деректері" description="Бос өріс — дерек жоқ. Нақты 0 енгізсеңіз, дашбордта 0 көрсетіледі." @close="!saving&&(metricsOpen=false)">
      <form class="form-grid two" @submit.prevent="save('metrics')"><label class="form-field wide">Жоба · {{ period }}<select v-model="metricsProject" @change="fillMetrics"><option v-for="p in data?.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label class="form-field">Осы айда танылған табыс, ₸<input v-model="metrics.revenue" type="number" min="0" step="0.01" placeholder="Енгізілмеген"></label><label class="form-field">Нақты түскен ақша, ₸<input v-model="metrics.receipts" type="number" min="0" step="0.01" placeholder="Енгізілмеген"></label><label class="form-field">Юнит түрі<select v-model="metrics.unitType"><option value="client">Клиент / оқушы</option><option value="order">Тапсырыс</option><option value="service">Қызмет</option></select></label><label class="form-field">Осы айдың юнит саны<input v-model="metrics.units" type="number" min="0" step="1" placeholder="Енгізілмеген"></label><label class="form-field">Лид саны<input v-model="metrics.leads" type="number" min="0" step="1" placeholder="Енгізілмеген"></label><label class="form-field">Жаңа ақылы клиенттер<input v-model="metrics.customers" type="number" min="0" step="1" placeholder="Енгізілмеген"></label><label class="finance-check form-field wide"><input v-model="metrics.marketingAligned" type="checkbox">Маркетинг шығыны, лидтер және жаңа клиенттер бірдей кезең мен қамтуға жатады</label><label class="finance-check form-field wide"><input v-model="metrics.costsReviewed" type="checkbox">Тікелей және тұрақты шығындар толық жіктелді; юнит есебіне дайын</label><label class="form-field wide">Кезең / дереккөз / ескертпе<textarea v-model="metrics.notes" rows="3" maxlength="1200"/></label><p class="finance-footnote form-field wide">Салық пен таргетті «Жазба қосу» арқылы тиісті категорияға енгізіңіз. Жаңа төлемге нақты айын, сомасын және төлем күйін көрсетіңіз.</p><p v-if="formError" class="finance-error form-field wide" role="alert">{{ formError }}</p><button class="button primary" :disabled="saving">{{ saving?'Сақталуда…':'Сақтау' }}</button></form>
    </UiModal>
  </div>
</template>
