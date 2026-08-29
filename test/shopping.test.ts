import { deleteShoppingItem, getShoppingItems, purchaseShoppingItem } from "../src/services/shopping/shoppingService";
import type { DbService } from "../src/services/shared/dbService";

const db = (values: Partial<DbService> = {}) => ({
  getItem: jest.fn().mockRejectedValue(new Error("not found")), putItem: jest.fn(), queryItems: jest.fn().mockResolvedValue([]),
  updateItem: jest.fn(), deleteItem: jest.fn(), deleteItemsByPrefix: jest.fn(), scanItems: jest.fn(),
  ...values,
}) as jest.Mocked<DbService>;
const body = (response: { body: string }) => JSON.parse(response.body);

describe("shopping service", () => {
  test("automatically imports food items marked to buy", async () => {
    const inventoryDb = db({ queryItems: jest.fn().mockResolvedValue([
      { id: "rice-1", name: "Rice", quantity: 0, minimumQuantity: 2, unit: "bags", buy: true, lifecycleStatus: "active" },
      { id: "beans-1", name: "Beans", quantity: 2, minimumQuantity: 1, unit: "bags", buy: false },
    ]) });
    const result = body(await getShoppingItems({ shoppingDb: db(), inventoryDb, userId: "user-1" }));
    expect(result).toEqual([expect.objectContaining({ id: "food-rice-1", name: "Rice", quantity: 2, source: "foodTracker" })]);
  });

  test("removing imported food clears its tracker buy flag", async () => {
    const inventoryDb = db({ updateItem: jest.fn().mockResolvedValue({}) });
    await deleteShoppingItem({ shoppingDb: db(), inventoryDb, userId: "user-1", shoppingItemId: "food-rice-1" });
    expect(inventoryDb.updateItem).toHaveBeenCalledWith(
      { PK: "USER#user-1", SK: "FOOD_ITEM#rice-1" },
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ ":buy": false })
    );
  });

  test("keeps unbought custom quantity active and records bought quantity", async () => {
    const shoppingDb = db({
      getItem: jest.fn().mockResolvedValue({ id: "soap-1", name: "Soap", quantity: 10, unit: "pieces", category: "Household", source: "custom", status: "active" }),
      updateItem: jest.fn().mockResolvedValue({ id: "soap-1", name: "Soap", quantity: 4, unit: "pieces", category: "Household", source: "custom", status: "active" }),
      putItem: jest.fn().mockResolvedValue(undefined),
    });
    const result = body(await purchaseShoppingItem({ shoppingDb, inventoryDb: db(), userId: "user-1", shoppingItemId: "soap-1", body: JSON.stringify({ quantity: 6 }) }));
    expect(result.remaining.quantity).toBe(4);
    expect(result.item).toMatchObject({ purchasedQuantity: 6, status: "purchased" });
  });

  test("keeps partial food remainder and adds bought quantity to inventory", async () => {
    const shoppingDb = db({ putItem: jest.fn().mockResolvedValue(undefined) });
    const inventoryDb = db({
      getItem: jest.fn().mockResolvedValue({ id: "rice-1", name: "Rice", quantity: 2, minimumQuantity: 10, unit: "bags", buy: true }),
      updateItem: jest.fn().mockResolvedValue({}),
    });
    const result = body(await purchaseShoppingItem({ shoppingDb, inventoryDb, userId: "user-1", shoppingItemId: "food-rice-1", body: JSON.stringify({ quantity: 6 }) }));
    expect(result.remaining.quantity).toBe(4);
    expect(inventoryDb.updateItem).toHaveBeenCalledWith(expect.any(Object), expect.any(String), expect.any(Object), expect.objectContaining({ ":quantity": 8, ":buy": true }));
  });
});
