import type { Transaction } from "./financial-types";

export type TransactionFilters = {
  type: string;
  title: string;
  category: string;
  account: string;
  date: string;
};

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
  details: (item: Transaction) => { title: string; category: string; account: string },
) {
  const title = filters.title.trim().toLocaleLowerCase();
  return transactions.filter((item) => {
    const detail = details(item);
    return (filters.type === "all" || item.type === filters.type)
      && (!title || detail.title.toLocaleLowerCase().includes(title))
      && (!filters.category || detail.category === filters.category)
      && (!filters.account || detail.account === filters.account)
      && (!filters.date || item.date === filters.date);
  });
}
