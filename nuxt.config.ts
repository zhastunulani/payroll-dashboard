export default defineNuxtConfig({
  compatibilityDate: "2026-08-01",
  devtools: { enabled: true },
  modules: ["@nuxt/eslint"],
  css: ["~/assets/css/main.css", "~/assets/css/finance.css", "~/assets/css/analytics.css", "~/assets/css/structure.css", "~/assets/css/bank.css"],
  app: {
    head: {
      htmlAttrs: { lang: "kk" },
      title: "Айлық · Қаржылық басқару",
      meta: [
        {
          name: "description",
          content: "Айлықтар мен шығындарды басқаруға арналған қаржылық жүйе.",
        },
        { name: "theme-color", content: "#f5f7fb" },
      ],
      script: [
        {
          /**
           * Applies the saved theme before the first paint. Without it a dark-mode reader gets a
           * white flash on every load, because the app only learns the cookie once Vue has mounted.
           */
          innerHTML: "(()=>{try{var m=document.cookie.match(/(?:^|; )payroll_theme=([^;]*)/);"
            + "var t=m?decodeURIComponent(m[1]):'light';if(t==='dark'){document.documentElement.dataset.theme='dark';"
            + "document.documentElement.style.colorScheme='dark';}}catch(e){}})()",
          type: "text/javascript",
          tagPosition: "head",
        },
      ],
      link: [
        { rel: "icon", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
        },
      ],
    },
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    appPasswordHash: process.env.APP_PASSWORD_HASH,
    sessionSecret: process.env.SESSION_SECRET,
  },
  nitro: {
    preset: process.env.NITRO_PRESET,
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
});
