import type { CategoryBudget, FinancialProfile, Transaction } from "@/lib/financial-types";

export const QA_BACKUP_STORAGE_KEY = "awn.qa-backup.financial-profile.v2";
const QA_PROFILE_MARKER = "qa-2026-salary";

const accountIds = {
  salary: "qa-account-salary",
  everyday: "qa-account-everyday",
  savings: "qa-account-savings",
  backup: "qa-account-backup",
  spare: "qa-account-spare",
} as const;

const cardIds = {
  groceries: "qa-card-groceries",
  everyday: "qa-card-everyday",
  backup: "qa-card-backup",
  reserve: "qa-card-reserve",
} as const;

const categoryLimits: Record<string, number> = {
  Rent: 1000,
  "Furniture / Appliances": 400,
  DEWA: 350,
  Chiller: 200,
  Gas: 50,
  "Phone Bill": 200,
  Internet: 350,
  Groceries: 900,
  Delivery: 200,
  "Dining Out": 250,
  "Work Food": 300,
  "Daily Miscellaneous": 340,
  Fuel: 400,
  Taxi: 150,
  Parking: 100,
  "Going Out": 150,
  "Gym Fees": 200,
  Netflix: 50,
  "YouTube Premium": 30,
  "Amazon Prime": 20,
  "Google Photos": 10,
  "Russian Classes": 150,
  Clothing: 150,
  Gifts: 50,
  "Salon/Barber": 150,
  Care: 50,
};

export const qaCategoryCatalog = [
  "Rent", "Furniture / Appliances", "DEWA", "Chiller", "Gas", "Phone Bill", "Internet", "Tabby", "Tamara",
  "Groceries", "Vape", "Delivery", "Dining Out", "Work Food", "Daily Miscellaneous",
  "Fuel", "Taxi", "Parking", "Going Out", "Electronics", "Movies", "Fun",
  "Job Insurance", "Prescriptions", "Over-the-counter drugs", "Vitamins/Supplements", "Life Insurance",
  "Plane Fare", "Accommodations", "Vacation Food", "Souvenirs", "Rent a Car", "Vacation Miscellaneous",
  "Gym Fees", "Volleyball", "Sports Equipment", "Noon Premium", "YouTube Premium", "Netflix", "Office 365",
  "Amazon Prime", "Adobe Creative Cloud", "Disney Plus", "Google Photos", "Russian Classes",
  "Clothing", "Gifts", "Salon/Barber", "Books", "Care",
] as const;

const categoryBudgetSnapshot = (month: string): CategoryBudget[] => qaCategoryCatalog.map((name) => ({
  id: `qa-budget-${month}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  name,
  limit: (categoryLimits[name] ?? 0) * 100,
  month,
}));

const categoryBudgets = ["2026-01", "2026-02", "2026-03"].flatMap(categoryBudgetSnapshot);

type Funding = { accountId: string } | { cardId: string };
type ExpenseSeed = { day: number; category: string; amount: number; note: string; funding: Funding };

const cents = (amount: number) => Math.round(amount * 100);
const dateFor = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;
const stampFor = (date: string, order: number) => `${date}T${String(8 + order % 12).padStart(2, "0")}:${String(order * 7 % 60).padStart(2, "0")}:00.000Z`;

function expenseTransactions(month: string, seeds: ExpenseSeed[]): Transaction[] {
  return seeds.map((seed, index) => {
    const date = dateFor(month, seed.day);
    const timestamp = stampFor(date, index);
    return { id: `qa-${month}-${seed.day}-${index}-${seed.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, type: "expense", amount: cents(seed.amount), date, note: seed.note, category: seed.category, ...seed.funding, createdAt: timestamp, updatedAt: timestamp };
  });
}

function income(month: string, day: number, id: string, amount: number, sourceId: string, sourceName: string, note: string): Transaction {
  const date = dateFor(month, day);
  const timestamp = stampFor(date, 0);
  return { id, type: "income", amount: cents(amount), date, note, incomeSourceId: sourceId, incomeSourceName: sourceName, destinationAccountId: accountIds.salary, createdAt: timestamp, updatedAt: timestamp };
}

function transfer(month: string, day: number, id: string, amount: number, destinationAccountId: string, note: string): Transaction {
  const date = dateFor(month, day);
  const timestamp = stampFor(date, 1);
  return { id, type: "transfer", amount: cents(amount), date, note, sourceAccountId: accountIds.salary, destinationAccountId, createdAt: timestamp, updatedAt: timestamp };
}

function cardPayment(month: string, day: number, id: string, amount: number, receivingCardId: string): Transaction {
  const date = dateFor(month, day);
  const timestamp = stampFor(date, 2);
  return { id, type: "card-payment", amount: cents(amount), date, note: "Credit card payment", payingAccountId: accountIds.salary, receivingCardId, createdAt: timestamp, updatedAt: timestamp };
}

const everyday = { accountId: accountIds.everyday };
const groceriesCard = { cardId: cardIds.groceries };
const everydayCard = { cardId: cardIds.everyday };

const januaryExpenses: ExpenseSeed[] = [
  { day: 3, category: "Rent", amount: 1000, note: "Apartment rent", funding: everyday },
  { day: 4, category: "Furniture / Appliances", amount: 200, note: "Kitchen storage shelf", funding: everydayCard },
  { day: 5, category: "DEWA", amount: 310, note: "DEWA bill", funding: everydayCard },
  { day: 6, category: "Chiller", amount: 180, note: "District cooling bill", funding: everydayCard },
  { day: 7, category: "Gas", amount: 42.5, note: "Gas bill", funding: everydayCard },
  { day: 8, category: "Phone Bill", amount: 185, note: "Virgin Mobile", funding: everydayCard },
  { day: 9, category: "Internet", amount: 350, note: "Home internet", funding: groceriesCard },
  { day: 10, category: "Groceries", amount: 980, note: "Carrefour groceries", funding: groceriesCard },
  { day: 11, category: "Delivery", amount: 150, note: "Talabat deliveries", funding: groceriesCard },
  { day: 12, category: "Dining Out", amount: 320, note: "Dinner with friends", funding: groceriesCard },
  { day: 13, category: "Work Food", amount: 265, note: "Office lunches", funding: everydayCard },
  { day: 14, category: "Daily Miscellaneous", amount: 137, note: "Daily essentials", funding: everydayCard },
  { day: 15, category: "Fuel", amount: 365, note: "ENOC fuel", funding: everyday },
  { day: 16, category: "Taxi", amount: 120, note: "Careem rides", funding: everyday },
  { day: 17, category: "Parking", amount: 90, note: "RTA parking", funding: everydayCard },
  { day: 18, category: "Going Out", amount: 130, note: "Coffee and an evening out", funding: everyday },
  { day: 19, category: "Gym Fees", amount: 190, note: "Gym membership", funding: everyday },
  { day: 20, category: "Netflix", amount: 49, note: "Netflix", funding: everydayCard },
  { day: 20, category: "YouTube Premium", amount: 29, note: "YouTube Premium", funding: everydayCard },
  { day: 21, category: "Amazon Prime", amount: 18, note: "Amazon Prime", funding: everydayCard },
  { day: 21, category: "Google Photos", amount: 9.5, note: "Google Photos", funding: everydayCard },
  { day: 22, category: "Russian Classes", amount: 145, note: "Russian class", funding: everyday },
  { day: 22, category: "Clothing", amount: 150, note: "Work shirt", funding: everyday },
  { day: 23, category: "Gifts", amount: 50, note: "Birthday gift", funding: everydayCard },
  { day: 23, category: "Salon/Barber", amount: 135, note: "Barber", funding: everydayCard },
  { day: 24, category: "Care", amount: 50, note: "Personal care", funding: everyday },
];

const februaryExpenses: ExpenseSeed[] = [
  { day: 3, category: "Rent", amount: 1000, note: "Apartment rent", funding: everyday },
  { day: 5, category: "Furniture / Appliances", amount: 1800, note: "IKEA appliance", funding: everydayCard },
  { day: 6, category: "Furniture / Appliances", amount: 1200, note: "Appliance installation and delivery", funding: everyday },
  { day: 7, category: "DEWA", amount: 350, note: "DEWA bill", funding: groceriesCard },
  { day: 8, category: "Chiller", amount: 200, note: "District cooling bill", funding: groceriesCard },
  { day: 8, category: "Gas", amount: 50, note: "Gas bill", funding: groceriesCard },
  { day: 9, category: "Phone Bill", amount: 200, note: "Virgin Mobile", funding: groceriesCard },
  { day: 10, category: "Internet", amount: 350, note: "Home internet", funding: everydayCard },
  { day: 11, category: "Groceries", amount: 900, note: "Carrefour groceries", funding: groceriesCard },
  { day: 12, category: "Delivery", amount: 200, note: "Talabat deliveries", funding: everydayCard },
  { day: 13, category: "Dining Out", amount: 250, note: "Weekend dinner", funding: everydayCard },
  { day: 14, category: "Work Food", amount: 300, note: "Office lunches", funding: everyday },
  { day: 15, category: "Daily Miscellaneous", amount: 140, note: "Daily essentials", funding: everyday },
  { day: 16, category: "Fuel", amount: 400, note: "ENOC fuel", funding: everyday },
  { day: 17, category: "Taxi", amount: 150, note: "Careem rides", funding: everyday },
  { day: 18, category: "Parking", amount: 100, note: "RTA parking", funding: groceriesCard },
  { day: 19, category: "Going Out", amount: 150, note: "Evening out", funding: everyday },
  { day: 19, category: "Gym Fees", amount: 200, note: "Gym membership", funding: everyday },
  { day: 20, category: "Netflix", amount: 50, note: "Netflix", funding: everyday },
  { day: 20, category: "YouTube Premium", amount: 30, note: "YouTube Premium", funding: everyday },
  { day: 21, category: "Amazon Prime", amount: 20, note: "Amazon Prime", funding: everyday },
  { day: 21, category: "Google Photos", amount: 10, note: "Google Photos", funding: everyday },
  { day: 22, category: "Russian Classes", amount: 150, note: "Russian class", funding: everyday },
  { day: 22, category: "Clothing", amount: 150, note: "Everyday clothing", funding: everyday },
  { day: 23, category: "Gifts", amount: 50, note: "Small gift", funding: everyday },
  { day: 23, category: "Salon/Barber", amount: 150, note: "Barber", funding: everyday },
  { day: 24, category: "Care", amount: 50, note: "Personal care", funding: everyday },
];

const marchExpenses: ExpenseSeed[] = [
  { day: 3, category: "Rent", amount: 1000, note: "Apartment rent", funding: everyday },
  { day: 4, category: "DEWA", amount: 280, note: "DEWA bill", funding: groceriesCard },
  { day: 5, category: "Chiller", amount: 160, note: "District cooling bill", funding: groceriesCard },
  { day: 6, category: "Gas", amount: 40, note: "Gas bill", funding: groceriesCard },
  { day: 7, category: "Phone Bill", amount: 170, note: "Virgin Mobile", funding: groceriesCard },
  { day: 8, category: "Internet", amount: 330, note: "Home internet", funding: everydayCard },
  { day: 9, category: "Groceries", amount: 850, note: "Carrefour groceries", funding: groceriesCard },
  { day: 10, category: "Delivery", amount: 160, note: "Talabat deliveries", funding: everydayCard },
  { day: 11, category: "Dining Out", amount: 230, note: "Dinner out", funding: everydayCard },
  { day: 12, category: "Work Food", amount: 270, note: "Office lunches", funding: everydayCard },
  { day: 13, category: "Daily Miscellaneous", amount: 90, note: "Daily essentials", funding: everydayCard },
  { day: 14, category: "Fuel", amount: 350, note: "ENOC fuel", funding: everydayCard },
  { day: 15, category: "Taxi", amount: 80, note: "Careem ride", funding: everydayCard },
  { day: 16, category: "Parking", amount: 60, note: "RTA parking", funding: everydayCard },
  { day: 17, category: "Going Out", amount: 130, note: "Evening out", funding: everydayCard },
  { day: 18, category: "Gym Fees", amount: 180, note: "Gym membership", funding: everydayCard },
  { day: 19, category: "Netflix", amount: 50, note: "Netflix", funding: everydayCard },
  { day: 19, category: "YouTube Premium", amount: 30, note: "YouTube Premium", funding: everydayCard },
  { day: 20, category: "Amazon Prime", amount: 20, note: "Amazon Prime", funding: everydayCard },
  { day: 20, category: "Google Photos", amount: 10, note: "Google Photos", funding: everydayCard },
  { day: 21, category: "Russian Classes", amount: 150, note: "Russian class", funding: everydayCard },
  { day: 22, category: "Clothing", amount: 100, note: "Work clothing", funding: everydayCard },
  { day: 23, category: "Gifts", amount: 30, note: "Small gift", funding: everydayCard },
  { day: 24, category: "Salon/Barber", amount: 90, note: "Barber", funding: everydayCard },
  { day: 24, category: "Care", amount: 40, note: "Personal care", funding: everydayCard },
];

const transactions: Transaction[] = [
  income("2026-01", 1, "qa-income-jan-salary", 16000, QA_PROFILE_MARKER, "Salary", "January salary"),
  transfer("2026-01", 2, "qa-transfer-jan-everyday", 2500, accountIds.everyday, "Monthly spending transfer"),
  ...expenseTransactions("2026-01", januaryExpenses),
  cardPayment("2026-01", 25, "qa-card-payment-jan-groceries", 1100, cardIds.groceries),
  cardPayment("2026-01", 26, "qa-card-payment-jan-everyday", 1400, cardIds.everyday),
  transfer("2026-01", 28, "qa-transfer-jan-savings", 10400, accountIds.savings, "January savings transfer"),
  income("2026-02", 1, "qa-income-feb-salary", 16000, QA_PROFILE_MARKER, "Salary", "February salary"),
  transfer("2026-02", 2, "qa-transfer-feb-everyday", 4500, accountIds.everyday, "Monthly spending transfer"),
  ...expenseTransactions("2026-02", februaryExpenses),
  cardPayment("2026-02", 25, "qa-card-payment-feb-groceries", 1500, cardIds.groceries),
  cardPayment("2026-02", 26, "qa-card-payment-feb-everyday", 2500, cardIds.everyday),
  transfer("2026-02", 28, "qa-transfer-feb-savings", 7400, accountIds.savings, "February savings transfer"),
  income("2026-03", 1, "qa-income-mar-salary", 16000, QA_PROFILE_MARKER, "Salary", "March salary"),
  income("2026-03", 2, "qa-income-mar-side", 1500, "qa-2026-part-time", "Part Time Wages", "Part-time project payment"),
  transfer("2026-03", 3, "qa-transfer-mar-everyday", 1200, accountIds.everyday, "Monthly spending transfer"),
  ...expenseTransactions("2026-03", marchExpenses),
  cardPayment("2026-03", 25, "qa-card-payment-mar-groceries", 1200, cardIds.groceries),
  cardPayment("2026-03", 26, "qa-card-payment-mar-everyday", 800, cardIds.everyday),
  transfer("2026-03", 28, "qa-transfer-mar-savings", 12600, accountIds.savings, "March savings and February recovery"),
];

export const qaFinancialProfile: FinancialProfile = {
  version: 2,
  currency: "AED",
  incomeSources: [
    { id: QA_PROFILE_MARKER, name: "Salary", amount: cents(16000), day: 1 },
    { id: "qa-2026-part-time", name: "Part Time Wages", amount: cents(1500), day: 2 },
    { id: "qa-2026-last-month-savings", name: "Last Month Savings", amount: 0, day: 1 },
    { id: "qa-2026-company-refunds", name: "Company Refunds", amount: 0, day: 15 },
    { id: "qa-2026-loans", name: "Loans", amount: 0, day: 15 },
    { id: "qa-2026-misc-income", name: "Miscellaneous Income", amount: 0, day: 15 },
  ],
  accounts: [
    { id: accountIds.salary, name: "Emirates NBD Salary Account", type: "current", purpose: "Salary", balance: cents(11600), country: "United Arab Emirates", currency: "AED", lastFour: "4821" },
    { id: accountIds.everyday, name: "ADCB Everyday Spending", type: "current", purpose: "Everyday Expenses", balance: cents(1150), country: "United Arab Emirates", currency: "AED", lastFour: "1937" },
    { id: accountIds.savings, name: "Wio Main Savings", type: "savings", purpose: "Main Savings", balance: cents(1000), country: "United Arab Emirates", currency: "AED", lastFour: "7714" },
    { id: accountIds.backup, name: "Mashreq Backup Account", type: "current", purpose: "Backup", balance: cents(350), country: "United Arab Emirates", currency: "AED", lastFour: "6205" },
    { id: accountIds.spare, name: "Liv Spare Account", type: "current", purpose: "Spare", balance: 0, country: "United Arab Emirates", currency: "AED", lastFour: "8840" },
  ],
  debitCards: [
    { id: "qa-debit-salary", name: "Emirates NBD Salary Debit", purpose: "Salary", country: "United Arab Emirates", currency: "AED", lastFour: "4821", linkedAccountId: accountIds.salary },
    { id: "qa-debit-everyday", name: "ADCB Everyday Debit", purpose: "Everyday", country: "United Arab Emirates", currency: "AED", lastFour: "1937", linkedAccountId: accountIds.everyday },
    { id: "qa-debit-savings", name: "Wio Savings Debit", purpose: "Savings", country: "United Arab Emirates", currency: "AED", lastFour: "7714", linkedAccountId: accountIds.savings },
  ],
  creditCards: [
    { id: cardIds.groceries, name: "Emirates NBD Groceries Card", purpose: "Groceries", limit: cents(10000), owed: 0, dueDay: 5, country: "United Arab Emirates", currency: "AED", lastFour: "3418" },
    { id: cardIds.everyday, name: "ADCB Everyday Card", purpose: "Basic Purchases", limit: cents(15000), owed: 0, dueDay: 12, country: "United Arab Emirates", currency: "AED", lastFour: "9084" },
    { id: cardIds.backup, name: "Mashreq Backup Card", purpose: "Backup", limit: cents(12000), owed: 0, dueDay: 20, country: "United Arab Emirates", currency: "AED", lastFour: "5527" },
    { id: cardIds.reserve, name: "FAB Reserve Card", purpose: "Reserve", limit: cents(20000), owed: 0, dueDay: 27, country: "United Arab Emirates", currency: "AED", lastFour: "1163" },
  ],
  categoryBudgets,
  savingsGoals: [
    { id: "qa-goal-emergency", name: "Emergency Fund", target: cents(50000), saved: cents(24000), contribution: cents(3500), startDate: "2025-01-01", targetDate: "2026-12-01", priority: 1 },
    { id: "qa-goal-vacation", name: "Vacation Fund", target: cents(15000), saved: cents(6500), contribution: cents(1500), startDate: "2026-01-01", targetDate: "2027-01-01", priority: 2 },
    { id: "qa-goal-car", name: "New Car", target: cents(80000), saved: cents(14500), contribution: cents(2000), startDate: "2025-10-01", targetDate: "2027-12-01", priority: 3 },
    { id: "qa-goal-home", name: "Home Deposit", target: cents(100000), saved: cents(28000), contribution: cents(3000), startDate: "2025-01-01", targetDate: "2028-12-01", priority: 4 },
  ],
  onboarding: { currentStep: 5, completed: true },
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-03-31T20:00:00.000Z",
  transactions,
};
