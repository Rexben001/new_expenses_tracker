import { Budget } from "../domain/models/budget";
import { Expense } from "../domain/models/expense";

export function sortItemByRecent<T extends Expense[] | Budget[]>(
  item: T
): Array<T[number]> {
  return [...item].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
