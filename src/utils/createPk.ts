export function createExpensesPk(
  userId: string,
  budgetId?: string,
  subAccountId?: string,
  expenseId?: string
) {
  let pk = `USER#${userId}`;
  if (subAccountId) {
    pk += `SUB#${subAccountId}`;
  }

  if (budgetId) {
    pk += `BUDGET#${budgetId}`;
  }

  if (expenseId) {
    pk += `EXPENSE#${expenseId}`;
  }
  return pk;
}

export const createPk = (userId: string, subAccountId?: string) => {
  let pk = `USER#${userId}`;
  if (subAccountId) {
    pk += `#SUB#${subAccountId}`;
  }
  return pk;
};
