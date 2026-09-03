import type { APIGatewayEvent, Context } from "aws-lambda";
import { makeHandler } from "../src/handlers/handleWardrobe/handler";
import type { DbService } from "../src/services/shared/dbService";
import type { WardrobeImageStore } from "../src/services/wardrobe/imageStore";
import {
  createWardrobeItem,
  createWardrobeUploadUrl,
  deleteWardrobeItem,
  getWardrobeItems,
  getWardrobePlan,
  putWardrobePlan,
  updateWardrobeItem,
} from "../src/services/wardrobe/wardrobeService";

jest.mock("../src/utils/logger", () => ({
  createInvocationLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

jest.mock("../src/services/wardrobe/wardrobeService", () => ({
  createWardrobeItem: jest.fn(),
  createWardrobeUploadUrl: jest.fn(),
  deleteWardrobeItem: jest.fn(),
  getWardrobeItems: jest.fn(),
  getWardrobePlan: jest.fn(),
  putWardrobePlan: jest.fn(),
  updateWardrobeItem: jest.fn(),
}));

const okResponse = {
  statusCode: 200,
  headers: {},
  body: JSON.stringify({ ok: true }),
};
const dbService = {} as DbService;
const imageStore = {} as WardrobeImageStore;
const context = {} as Context;

const services = [
  createWardrobeItem,
  createWardrobeUploadUrl,
  deleteWardrobeItem,
  getWardrobeItems,
  getWardrobePlan,
  putWardrobePlan,
  updateWardrobeItem,
] as jest.MockedFunction<any>[];

function event({
  method,
  path,
  pathParameters = {},
}: {
  method: string;
  path: string;
  pathParameters?: Record<string, string>;
}) {
  return {
    body: JSON.stringify({ test: true }),
    httpMethod: method,
    path,
    pathParameters,
    queryStringParameters: { subId: "123e4567-e89b-42d3-a456-426614174099" },
    requestContext: {
      authorizer: { claims: { sub: "user-1" } },
    },
  } as unknown as APIGatewayEvent;
}

describe("wardrobe handler", () => {
  const handler = makeHandler({ dbService, imageStore });

  beforeEach(() => {
    jest.clearAllMocks();
    services.forEach((service) => service.mockResolvedValue(okResponse));
  });

  test.each([
    ["POST", "/wardrobe/upload-url", {}, createWardrobeUploadUrl],
    ["GET", "/wardrobe/items", {}, getWardrobeItems],
    ["POST", "/wardrobe/items", {}, createWardrobeItem],
    [
      "PUT",
      "/wardrobe/items/item-1",
      { wardrobeItemId: "item-1" },
      updateWardrobeItem,
    ],
    [
      "DELETE",
      "/wardrobe/items/item-1",
      { wardrobeItemId: "item-1" },
      deleteWardrobeItem,
    ],
    [
      "GET",
      "/wardrobe/plans/2026-09-07",
      { weekStart: "2026-09-07" },
      getWardrobePlan,
    ],
    [
      "PUT",
      "/wardrobe/plans/2026-09-07",
      { weekStart: "2026-09-07" },
      putWardrobePlan,
    ],
  ])("routes %s %s", async (method, path, pathParameters, service) => {
    const response = await handler(
      event({ method, path, pathParameters }),
      context
    );

    expect(response).toBe(okResponse);
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        subAccountId: "123e4567-e89b-42d3-a456-426614174099",
      })
    );
  });

  test("returns 405 for unsupported requests", async () => {
    const response = await handler(
      event({ method: "PATCH", path: "/wardrobe/items" }),
      context
    );

    expect(response.statusCode).toBe(405);
    expect(services.every((service) => service.mock.calls.length === 0)).toBe(
      true
    );
  });
});
