import { deleteShoppingItem, getShoppingItems } from "../src/services/shopping/shoppingService";
import type { DbService } from "../src/services/shared/dbService";

const db = (values: Partial<DbService> = {}) => ({
  getItem: jest.fn(), putItem: jest.fn(), queryItems: jest.fn().mockResolvedValue([]),
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
});
