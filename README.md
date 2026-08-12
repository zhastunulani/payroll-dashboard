# Айлық · Payroll Finance OS

Айлықтар, операциялық шығындар және бір реттік жұмсалған ақшаны ай сайын басқаруға арналған жеке қаржылық жүйе. Интерфейс толық қазақ тілінде.

## Негізгі технологиялар

- Nuxt 4 және Vue 3 — интерфейс, routing және SSR негізі.
- Nitro — `/api/*` серверлік endpoint-тері.
- Neon Serverless Postgres — production және local development дерекқоры.
- PBKDF2 + HMAC session — ортақ пароль және қауіпсіз `HttpOnly` cookie.
- `read-excel-file` — `.xlsx` және `.csv` қызметкерлер импорты.
- Lucide Vue — интерфейс иконкалары.
- Cloudflare Workers немесе Render — deployment мақсаттары.

## Архитектура

```text
app/
  app.vue                    auth gate және NuxtPage
  assets/css/main.css        дизайн жүйесі және responsive layout
  components/                қайта қолданылатын UI және бизнес формалар
  composables/               API state, mutations, форматтау
  pages/                     Nuxt file-based routing
server/
  api/                       Nitro endpoint-тері
  utils/                     HTTP adapter
lib/
  calculations.ts            таза қаржылық есептеулер
  database.ts                Neon schema және snapshot loader
  payroll-import.ts          икемді Excel/CSV parser
  postgres-database.ts       D1-like prepared-statement adapter
  types.ts                   ортақ дерек типтері
app/api/                     тексерілген business action service layer
tests/                       unit және API contract тесттері
```

Nuxt page бағыттары:

| URL | Мақсаты |
|---|---|
| `/` | KPI, ақша құрылымы, өткен аймен салыстыру |
| `/departments` | Бөлімдер, қызметкерлер, айлық және төлем статусы |
| `/expenses` | Операциялық және қайталанатын шығындар |
| `/other-expenses` | Бір реттік жұмсалған ақша реестрі |
| `/settings` | Қызметкерлер, импорт, айлар, анықтамалықтар және пароль |

## Бірнеше жобамен жұмыс

- Сол жақ панельдегі жоба ауыстырғышы әр ұйымның айлық есебін бөлек ашады.
- `Жаңа жоба қосу` әрекеті ағымдағы есептік айды, алты стандартты бөлімді, төлем түрлерін және шығын категорияларын автоматты жасайды.
- Қызметкерлер, айлық snapshot-тары, шығындар, бөлімдер және айлар жоба бойынша оқшауланған.
- Бұрыннан бар деректер миграция кезінде автоматты түрде негізгі `EdUser` жобасында қалады.
- Соңғы таңдалған жоба браузерде есте сақталады. Мобильді құрылғыда ауыстырғыш бет тақырыбының үстінде көрсетіледі.

## Қаржылық логика

- Әр ай тарихи snapshot ретінде сақталады.
- Жалпы айлық = негізгі айлық + қосымша төлемдер − ұсталымдар.
- Айлық сомасы өзгерсе, `Төленді` белгісі автоматты алынады.
- Операциялық шығындар жоспарға кіреді және жеке төлем статусы бар.
- `Басқа шығындар` реестріндегі жазба бірден жұмсалған ақша болып саналады; төлем checkbox-ы жоқ және келесі айға көшірілмейді.
- Жаңа айда Академ, Мұғалімдер, Маркетинг Eduser және Ustaz Media көшіріледі.
- Кураторлар мен Сату бөлімі жаңа айда бос ашылады; жаңа тізім Excel арқылы импортталады.
- Өткен айдың snapshot-тары кейінгі өзгерістерден өзгермейді.

## Local іске қосу

Node.js 22 қажет.

1. `.env.example` негізінде `.env.local` жасаңыз.
2. Міндетті айнымалыларды толтырыңыз:

```env
DATABASE_URL=postgresql://...
APP_PASSWORD_HASH=pbkdf2$...
SESSION_SECRET=кемінде-32-таңбалы-құпия-жол
```

3. Dependency және dev server:

```bash
npm install
npm run dev
```

Local URL: `http://127.0.0.1:3100`

Пароль хэшін жасау:

```bash
npm run hash-password -- "жаңа-құпия-пароль"
```

## Excel/CSV импорт

Импорт тек `Баптаулар → Қызметкерлер` бөлімінде орналасқан.

1. Қызметкерлер қосылатын бөлімді таңдаңыз.
2. `Excel импорт` батырмасын басыңыз.
3. `.xlsx` немесе `.csv` файлын таңдаңыз.
4. Алдын ала тексеру экранындағы дайын және қате жолдарды тексеріңіз.
5. Дайын жолдарды импорттаңыз.

Parser келесі атауларды және еркін орналасқан кестелерді таниды:

- `ФИО`, `Аты-жөні`, `Қызметкер`, `Сотрудник`;
- `Оклад`, `Айлық`, `ЗП`, `Сумма`, `К выплате`;
- `Төлем түрі`, `Способ оплаты`;
- ПС, пәндер, бонус және басқа ақшалай бағандар.

Импортталған қорытынды сома қызметкердің негізгі айлығы ретінде сақталады. Қате, қайталанған немесе танылмаған жолдар базаға жіберілмейді.

## Қауіпсіздік

- Payroll API парольсіз `401` қайтарады.
- Пароль базаға PBKDF2 хэш түрінде сақталады.
- Session cookie: `HttpOnly`, `SameSite=Strict`, production-да `Secure`.
- Пароль өзгергенде `session_version` өседі және бұрынғы сессиялардың бәрі жарамсыз болады.
- `/api/ping` құпия дерекке және базаға кірмейді.
- `/api/health` Neon байланысын тексереді.

## Тексеру

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm test
```

## Render

`render.yaml` Web Service-ті сипаттайды:

- build: `npm ci --include=dev && npm run build`
- start: `npm start`
- health check: `/api/health`
- plan: `free`

Render environment variables:

- `DATABASE_URL`
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`

Free Render instance inactive кезде ұйықтауы мүмкін. Бұл Nuxt кодының қатесі емес; нақты always-on үшін Cloudflare Workers deployment қолданылады.

## Cloudflare Workers

`wrangler.jsonc` Nuxt/Nitro output-ына бағытталған:

- worker: `.output/server/index.mjs`
- assets: `.output/public`
- compatibility flag: `nodejs_compat`

Құпияларды бір рет орнатыңыз:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put APP_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

Preview және deploy:

```bash
npm run preview:worker
npm run deploy:worker
```

Осы migration кезеңінде production deploy автоматты жасалмайды. Local тексеруден кейін ғана commit/push/deploy орындалуы керек.

## Дизайн қағидалары

- Inter қарпі және `#495CF8` бренд түсі.
- Қаржылық dashboard иерархиясы: KPI → құрылым/динамика → нақты реестр.
- Барлық сомада tabular цифрлар және `1 000 ₸` форматы.
- Бірыңғай іздеуі бар dropdown; mobile-да bottom sheet болып ашылады.
- Desktop sidebar, tablet responsive grid және mobile bottom navigation.
- Төленген сома — жасыл, назар қажет сома — қызғылт сары, қате немесе өсу — қызыл.

## Git тәртібі

`.env.local`, Neon connection string, нақты пароль, импорт файлдары және қызметкерлердің жеке деректері Git-ке жіберілмеуі керек. Өзгерісті жариялау алдында:

```bash
git status
npm test
git add <қажетті файлдар>
git commit -m "feat: migrate payroll dashboard to nuxt"
git push origin main
```
