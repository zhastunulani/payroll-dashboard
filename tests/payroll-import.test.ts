import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPayrollImportRow,
  parseDelimitedGrid,
  parseMoneyValue,
  rowsFromGrid,
  selectImportSheets,
} from "../lib/payroll-import.ts";

test("money parser understands grouped tenge and decimal cells", () => {
  assert.equal(parseMoneyValue("1 200 000 ₸"), 1_200_000);
  assert.equal(parseMoneyValue("91\u00a0500 тг"), 91_500);
  assert.equal(parseMoneyValue("200 000,00"), 200_000);
  assert.equal(parseMoneyValue(55_500.4), 55_500);
  assert.equal(parseMoneyValue("(12 500)"), -12_500);
});

test("excel rows are found below title rows and all amount columns are captured", () => {
  const records = rowsFromGrid([
    ["Кураторлар айлығы"],
    [],
    ["№", "ФИО", "Мат 2.2", "Мат 4.2", "Итого", "Способ оплаты"],
    [1, "Абдулгаппаров Нодирбек", "36 000 ₸", 55_500, 91_500, "перевод"],
  ]);
  assert.equal(records.length, 1);

  const parsed = extractPayrollImportRow(records[0], {
    fallbackDepartment: "Кураторлар",
    fallbackPaymentMethod: "Аударым",
    selectedMonth: 7,
  });
  assert.deepEqual(parsed, {
    department: "Кураторлар",
    fullName: "Абдулгаппаров Нодирбек",
    position: "",
    baseSalary: 91_500,
    components: [],
    paymentMethod: "Аударым",
    isPaid: false,
  });
});

test("separate name columns, base salary, additions and deductions are recognized", () => {
  const [record] = rowsFromGrid([
    [
      "Фамилия",
      "Имя",
      "Отчество",
      "Оклад",
      "ПС",
      "Удержание",
      "Формат оплаты",
    ],
    [
      "Амангелді",
      "Нұрдәулет",
      "Серікұлы",
      "200 000",
      "55 500",
      "10 000",
      "официально + ИП",
    ],
  ]);
  const parsed = extractPayrollImportRow(record, {
    fallbackDepartment: "Кураторлар",
    fallbackPaymentMethod: "Аударым",
    selectedMonth: 7,
  });

  assert.equal(parsed.fullName, "Амангелді Нұрдәулет Серікұлы");
  assert.equal(parsed.baseSalary, 245_500);
  assert.deepEqual(parsed.components, []);
  assert.equal(parsed.paymentMethod, "Ресми + ЖК");
});

test("CSV and multi-sheet imports select the current department", () => {
  const csv = [
    "Айлық реестр",
    "ФИО;Сумма;Оплата",
    "Аман Ақнұр;115 152;перевод",
  ].join("\n");
  assert.equal(rowsFromGrid(parseDelimitedGrid(csv)).length, 1);

  const sheets = [
    {
      sheet: "Кураторлар",
      data: [["ФИО", "Сумма"], ["Аман Ақнұр", 115_152]],
    },
    {
      sheet: "Отдел продаж",
      data: [["ФИО", "Сумма"], ["Сату менеджері", 250_000]],
    },
  ];
  assert.deepEqual(
    selectImportSheets(sheets, "dept-sales", "Сату бөлімі").map(
      (sheet) => sheet.sheet,
    ),
    ["Отдел продаж"],
  );
});
