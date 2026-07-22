import type { APIGatewayEvent, Context } from "aws-lambda";
import { makeHandler } from "../src/handlers/handleFoodItems/handler";
import { createFoodItem } from "../src/services/foodItems/createFoodItem";
import { deleteFoodItem } from "../src/services/foodItems/deleteFoodItem";
import { getFoodItems } from "../src/services/foodItems/getFoodItems";
import { getFoodStats } from "../src/services/foodItems/getFoodStats";
import { updateFoodItem } from "../src/services/foodItems/updateFoodItem";
import type { DbService } from "../src/services/shared/dbService";

jest.mock("../src/utils/logger", () => ({
  createInvocationLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function makeDbService(items: Record<string, any>[] = []) {
  return {
    putItem: jest.fn().mockResolvedValue(undefined),
    queryItems: jest.fn().mockResolvedValue(items),
    updateItem: jest.fn().mockResolvedValue({
      id: "food-1",
      name: "Rice",
      quantity: 1,
      updatedAt: "2026-07-19T10:00:00.000Z",
    }),
    deleteItem: jest.fn().mockResolvedValue(undefined),
  } as unknown as DbService;
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

const validBody = JSON.stringify({
  name: "Rice",
  category: "food",
  quantity: 2,
  unit: "kg",
  minimumQuantity: 1,
  expiryDate: "2026-12-01",
  location: "Pantry",
  notes: "Basmati",
  buy: false,
});

describe("food item service", () => {
  test("creates account-scoped food items", async () => {
    const dbService = makeDbService();
    const response = await createFoodItem({
      dbService,
      body: validBody,
      userId: "user-1",
      subAccountId: "kitchen-1",
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: "USER#user-1#SUB#kitchen-1",
        SK: expect.stringMatching(/^FOOD_ITEM#/),
        name: "Rice",
        quantity: 2,
      })
    );
  });

  test("stores cooked food details and serving quantities", async () => {
    const dbService = makeDbService();
    const response = await createFoodItem({
      dbService,
      userId: "user-1",
      body: JSON.stringify({
        ...JSON.parse(validBody),
        name: "Chicken soup",
        category: "soup",
        unit: "servings",
        cookedDate: "2026-07-19",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "soup",
        cookedDate: "2026-07-19",
        unit: "servings",
      })
    );
  });

  test("stores fruit and vegetable purchase dates", async () => {
    const dbService = makeDbService();
    const response = await createFoodItem({
      dbService,
      userId: "user-1",
      body: JSON.stringify({
        ...JSON.parse(validBody),
        name: "Apples",
        category: "fruit",
        boughtDate: "2026-07-20",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        boughtDate: "2026-07-20",
        category: "fruit",
      })
    );
  });

  test("accepts custom food categories and locations", async () => {
    const dbService = makeDbService();
    const response = await createFoodItem({
      dbService,
      userId: "user-1",
      body: JSON.stringify({
        ...JSON.parse(validBody),
        category: "Bakery",
        location: "Garage pantry",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "Bakery",
        location: "Garage pantry",
      })
    );
  });

  test("stores fruit purchase dates", async () => {
    const dbService = makeDbService();
    await createFoodItem({
      dbService,
      userId: "user-1",
      body: JSON.stringify({
        ...JSON.parse(validBody),
        name: "Apples",
        category: "fruit",
        boughtDate: "2026-07-16",
      }),
    });

    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        boughtDate: "2026-07-16",
        category: "fruit",
      })
    );
  });

  test("rejects invalid quantities", async () => {
    const dbService = makeDbService();

    await expect(
      createFoodItem({
        dbService,
        body: JSON.stringify({ ...JSON.parse(validBody), quantity: -1 }),
        userId: "user-1",
      })
    ).rejects.toMatchObject({ message: "Invalid request body", status: 400 });
    expect(dbService.putItem).not.toHaveBeenCalled();
  });

  test("lists food items under food sort keys", async () => {
    const dbService = makeDbService([]);
    const response = await getFoodItems({ dbService, userId: "user-1" });

    expect(response.statusCode).toBe(200);
    expect(parseBody(response)).toEqual([]);
    expect(dbService.queryItems).toHaveBeenCalledWith(
      "PK = :pk AND begins_with(SK, :skPrefix)",
      expect.objectContaining({ ":skPrefix": { S: "FOOD_ITEM#" } })
    );
  });

  test("hides finished and wasted items from active inventory", async () => {
    const dbService = makeDbService([
      { id: "active", lifecycleStatus: "active", updatedAt: "2026-07-19" },
      { id: "legacy", updatedAt: "2026-07-18" },
      { id: "finished", lifecycleStatus: "finished", updatedAt: "2026-07-17" },
      { id: "wasted", lifecycleStatus: "wasted", updatedAt: "2026-07-16" },
    ]);

    const response = await getFoodItems({ dbService, userId: "user-1" });
    expect(parseBody(response).map((item: { id: string }) => item.id)).toEqual([
      "active",
      "legacy",
    ]);
  });

  test("calculates current-month savings and waste stats", async () => {
    const dbService = makeDbService([
      {
        category: "cooked",
        completedAt: "2026-07-10T10:00:00.000Z",
        lifecycleStatus: "finished",
        estimatedValue: 8.25,
        estimatedWeightKg: 1.2,
        quantity: 2,
        unit: "servings",
      },
      {
        category: "fruit",
        completedAt: "2026-07-11T10:00:00.000Z",
        lifecycleStatus: "wasted",
        estimatedValue: 3,
        estimatedWeightKg: 0.4,
        quantity: 1,
        unit: "packs",
      },
      {
        category: "soup",
        completedAt: "2026-06-30T10:00:00.000Z",
        lifecycleStatus: "finished",
        estimatedValue: 20,
        estimatedWeightKg: 2,
        quantity: 3,
        unit: "servings",
      },
      {
        category: "fruit",
        completedAt: "2026-07-19T09:00:00.000Z",
        lifecycleStatus: "finished",
        estimatedValue: 2,
        quantity: 1,
        unit: "packs",
      },
    ]);

    const response = await getFoodStats({
      dbService,
      userId: "user-1",
      now: new Date("2026-07-19T12:00:00.000Z"),
    });

    expect(parseBody(response)).toEqual({
      period: "2026-07",
      finishedCount: 2,
      wastedCount: 1,
      savedWeightKg: 1.2,
      wastedWeightKg: 0.4,
      estimatedSavings: 10.25,
      consumption: {
        day: {
          records: 1,
          totalQuantity: 1,
          quantitiesByUnit: { packs: 1 },
        },
        week: {
          records: 1,
          totalQuantity: 1,
          quantitiesByUnit: { packs: 1 },
        },
        month: {
          records: 2,
          totalQuantity: 3,
          quantitiesByUnit: { servings: 2, packs: 1 },
        },
        byCategory: [
          { category: "cooked", count: 1 },
          { category: "fruit", count: 1 },
        ],
      },
    });
  });

  test("updates and deletes food items by account key", async () => {
    const dbService = makeDbService();

    const updateResponse = await updateFoodItem({
      dbService,
      body: JSON.stringify({
        quantity: 1,
        buy: true,
        opened: true,
        lifecycleStatus: "finished",
        completedAt: "2026-07-19T10:00:00.000Z",
      }),
      userId: "user-1",
      foodItemId: "food-1",
    });
    const deleteResponse = await deleteFoodItem({
      dbService,
      userId: "user-1",
      foodItemId: "food-1",
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(dbService.updateItem).toHaveBeenCalledWith(
      { PK: "USER#user-1", SK: "FOOD_ITEM#food-1" },
      expect.stringContaining("#quantity = :quantity"),
      expect.anything(),
      expect.objectContaining({
        ":buy": true,
        ":quantity": 1,
        ":opened": true,
        ":lifecycleStatus": "finished",
      })
    );
    expect(deleteResponse.statusCode).toBe(200);
    expect(dbService.deleteItem).toHaveBeenCalledWith({
      PK: "USER#user-1",
      SK: "FOOD_ITEM#food-1",
    });
  });
});

describe("food item handler", () => {
  test("rejects unsupported methods", async () => {
    const handler = makeHandler({ dbService: makeDbService() });
    const response = await handler(
      {
        body: "",
        httpMethod: "PATCH",
        path: "/food-items",
        pathParameters: null,
        queryStringParameters: null,
        requestContext: {
          authorizer: { claims: { sub: "user-1" } },
        },
      } as unknown as APIGatewayEvent,
      {} as Context
    );

    expect(response.statusCode).toBe(405);
    expect(parseBody(response)).toEqual({
      message: "Method not allowed",
      statusCode: 405,
    });
  });
});
