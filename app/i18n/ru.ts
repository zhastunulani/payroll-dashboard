import { BANK } from "./ru/bank.ts";
import { COMMON } from "./ru/common.ts";
import { FINANCE } from "./ru/finance.ts";
import { META } from "./ru/meta.ts";
import { PAYROLL } from "./ru/payroll.ts";
import { UNIT } from "./ru/unit.ts";

/**
 * Kazakh → Russian. The key is the Kazakh text exactly as it appears in the interface, so a string
 * that is missing here still reads correctly — it simply stays in Kazakh. One file per area, merged
 * here, so several areas can be worked on without stepping on each other.
 *
 * House glossary, kept the same everywhere:
 * | Kazakh | Russian |
 * |---|---|
 * | Айлық (salary) | Зарплата |
 * | Шығын | Расход |
 * | Табыс | Доход |
 * | Түсім | Поступление |
 * | Таргет | Таргет |
 * | Жоба | Проект |
 * | Кезең / Ай | Период / Месяц |
 * | Выписка | Выписка |
 * | Төленді / Төленбеді | Оплачено / Не оплачено |
 * | Жұмсалды | Потрачено |
 * | Юнит-экономика | Юнит-экономика |
 * | Бөлім | Отдел (payroll) / Раздел (UI) |
 * | Қызметкер | Сотрудник |
 * | Лид / Клиент | Лид / Клиент |
 * | Қамту | Охват |
 * | Кабинет | Кабинет |
 * | Бағам | Курс |
 *
 * Addressing the reader stays formal («енгізіңіз» → «введите»), and «—» for missing data is never
 * translated away.
 */
export const RU: Record<string, string> = {
  ...COMMON,
  ...FINANCE,
  ...UNIT,
  ...BANK,
  ...META,
  ...PAYROLL,
};
