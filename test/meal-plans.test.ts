import { createMeal, getMealPlan, setSchedule, updateMeal } from "../src/services/mealPlans/mealPlanService";
import type { DbService } from "../src/services/shared/dbService";

const db = (values: Partial<DbService> = {}) => ({
  getItem: jest.fn().mockRejectedValue(new Error("not found")), putItem: jest.fn(), queryItems: jest.fn().mockResolvedValue([]),
  updateItem: jest.fn(), deleteItem: jest.fn(), deleteItemsByPrefix: jest.fn(), scanItems: jest.fn(),
  ...values,
}) as jest.Mocked<DbService>;

const body = (response: { body: string }) => JSON.parse(response.body);

describe("meal plan service", () => {
  test("returns Nigerian default meals and dated schedule data", async () => {
    const response = await getMealPlan({ planDb: db(), inventoryDb: db(), userId: "user-1" });
    const result = body(response);
    expect(result.meals.map((meal: { name: string }) => meal.name)).toEqual(expect.arrayContaining(["Jollof rice", "Egusi soup", "Moi moi"]));
    expect(result.schedule).toEqual([]);
  });

  test("warns when scheduling would leave linked ingredient at minimum stock", async () => {
    const planDb = db({ putItem: jest.fn().mockResolvedValue(undefined) });
    const inventoryDb = db({ queryItems: jest.fn().mockResolvedValue([{ id: "rice-id", name: "Rice", quantity: 3, minimumQuantity: 1, unit: "cups" }]) });
    const response = await setSchedule({ planDb, inventoryDb, userId: "user-1", date: "2026-08-24", mealType: "lunch", body: JSON.stringify({ mealId: "default-jollof-rice" }) });
    const result = body(response);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ ingredient: "Rice", severity: "low" })]));
    expect(planDb.putItem).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-08-24", day: "monday", mealType: "lunch" }));
  });

  test("warns for missing and insufficient ingredients", async () => {
    const planDb = db({ putItem: jest.fn().mockResolvedValue(undefined) });
    const inventoryDb = db({ queryItems: jest.fn().mockResolvedValue([{ id: "rice-id", name: "Rice", quantity: 1, minimumQuantity: 0, unit: "cups" }]) });
    const result = body(await setSchedule({ planDb, inventoryDb, userId: "user-1", date: "2026-08-30", mealType: "dinner", body: JSON.stringify({ mealId: "default-jollof-rice" }) }));
    expect(result.warnings.some((warning: { severity: string }) => warning.severity === "insufficient")).toBe(true);
    expect(result.warnings.some((warning: { severity: string }) => warning.severity === "missing")).toBe(true);
  });

  test("updates a custom meal", async () => {
    const planDb = db({
      getItem: jest.fn().mockResolvedValue({ id: "meal-1", recordType: "meal" }),
      updateItem: jest.fn().mockResolvedValue({
        id: "meal-1",
        recordType: "meal",
        name: "Updated stew",
        ingredients: [{ name: "Tomato", quantity: 4, unit: "pieces" }],
      }),
    });
    const response = await updateMeal({
      planDb,
      inventoryDb: db(),
      userId: "user-1",
      mealId: "meal-1",
      body: JSON.stringify({
        name: "Updated stew",
        ingredients: [{ name: "Tomato", quantity: 4, unit: "pieces" }],
      }),
    });

    expect(body(response).item.name).toBe("Updated stew");
    expect(planDb.updateItem).toHaveBeenCalled();
  });

  test("returns validation details for invalid meal updates", async () => {
    await expect(updateMeal({
      planDb: db(),
      inventoryDb: db(),
      userId: "user-1",
      mealId: "meal-1",
      body: JSON.stringify({ name: "", ingredients: [] }),
    })).rejects.toMatchObject({
      message: "Invalid request body",
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ path: "name" })]),
    });
  });

  test("creates an account-specific override when editing a default meal", async () => {
    const planDb = db({
      getItem: jest.fn().mockRejectedValue(new Error("not found")),
      putItem: jest.fn().mockResolvedValue(undefined),
    });
    const response = await updateMeal({
      planDb,
      inventoryDb: db(),
      userId: "user-1",
      mealId: "default-jollof-rice",
      body: JSON.stringify({
        name: "Jollof rice",
        ingredients: [
          { name: "Rice", quantity: 2, unit: "cups" },
          { name: "Thyme", quantity: 1, unit: "teaspoons" },
        ],
      }),
    });

    expect(body(response).item).toMatchObject({
      id: "default-jollof-rice",
      recordType: "mealOverride",
    });
    expect(planDb.putItem).toHaveBeenCalledWith(expect.objectContaining({
      SK: "MEAL_OVERRIDE#default-jollof-rice",
    }));
  });

  test("merges saved default overrides into the returned meal catalog", async () => {
    const planDb = db({
      queryItems: jest.fn().mockResolvedValue([{
        PK: "USER#user-1",
        SK: "MEAL_OVERRIDE#default-jollof-rice",
        id: "default-jollof-rice",
        recordType: "mealOverride",
        name: "My jollof",
        ingredients: [{ name: "Rice", quantity: 3, unit: "cups" }],
      }]),
    });
    const result = body(await getMealPlan({ planDb, inventoryDb: db(), userId: "user-1" }));

    expect(result.meals.find((meal: { id: string }) => meal.id === "default-jollof-rice")).toMatchObject({
      name: "My jollof",
      ingredients: [{ name: "Rice", quantity: 3, unit: "cups" }],
    });
    expect(result.meals.filter((meal: { id: string }) => meal.id === "default-jollof-rice")).toHaveLength(1);
  });

  test("creates and links a quantity-one tracker item for a new ingredient", async () => {
    const planDb = db({ putItem: jest.fn().mockResolvedValue(undefined) });
    const inventoryDb = db({
      queryItems: jest.fn().mockResolvedValue([]),
      putItem: jest.fn().mockResolvedValue(undefined),
    });
    await createMeal({
      planDb,
      inventoryDb,
      userId: "user-1",
      body: JSON.stringify({
        name: "Pepper soup",
        ingredients: [{ name: "Uziza", quantity: 2, unit: "tablespoons" }],
      }),
    });

    expect(inventoryDb.putItem).toHaveBeenCalledWith(expect.objectContaining({
      name: "Uziza",
      quantity: 1,
      minimumQuantity: 1,
      unit: "tablespoons",
      category: "ingredient",
    }));
    const trackerItem = inventoryDb.putItem.mock.calls[0][0];
    expect(planDb.putItem).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: [expect.objectContaining({ foodItemId: trackerItem.id })],
    }));
  });
});
