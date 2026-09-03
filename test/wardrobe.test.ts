import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { DbService } from "../src/services/shared/dbService";
import {
  MAX_WARDROBE_IMAGE_BYTES,
  makeWardrobeImageStore,
  wardrobeImageKey,
  type WardrobeImageStore,
} from "../src/services/wardrobe/imageStore";
import {
  createWardrobeItem,
  createWardrobeUploadUrl,
  deleteWardrobeItem,
  getWardrobeItems,
  getWardrobePlan,
  putWardrobePlan,
  updateWardrobeItem,
} from "../src/services/wardrobe/wardrobeService";

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

const ITEM_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_ITEM_ID = "123e4567-e89b-42d3-a456-426614174001";
const SUB_ACCOUNT_ID = "123e4567-e89b-42d3-a456-426614174099";
const USER_ID = "user-1";
const IMAGE_KEY = `users/${USER_ID}/primary/${ITEM_ID}.png`;

const payload = {
  id: ITEM_ID,
  imageKey: IMAGE_KEY,
  name: "Blue shirt",
  category: "shirt" as const,
  colorFamily: "blue" as const,
  colorHex: "#224f9f",
  colorTone: "dark" as const,
  favorite: false,
};

function db(values: Partial<DbService> = {}) {
  return {
    getItem: jest.fn(),
    putItem: jest.fn().mockResolvedValue(undefined),
    queryItems: jest.fn().mockResolvedValue([]),
    updateItem: jest.fn(),
    deleteItem: jest.fn().mockResolvedValue(undefined),
    deleteItemsByPrefix: jest.fn(),
    scanItems: jest.fn(),
    ...values,
  } as jest.Mocked<DbService>;
}

function images(values: Partial<WardrobeImageStore> = {}) {
  return {
    createUploadUrl: jest.fn().mockResolvedValue({
      itemId: ITEM_ID,
      imageKey: IMAGE_KEY,
      uploadUrl: "https://upload.example",
      expiresIn: 900,
      contentType: "image/png",
    }),
    assertImageReady: jest.fn().mockResolvedValue(undefined),
    createImageUrl: jest.fn().mockResolvedValue("https://image.example"),
    deleteImage: jest.fn().mockResolvedValue(undefined),
    ...values,
  } as jest.Mocked<WardrobeImageStore>;
}

function body(response: { body: string }) {
  return JSON.parse(response.body);
}

function weekDays(
  first: Partial<{
    itemIds: string[];
    lockedItemIds: string[];
    favorite: boolean;
  }> = {}
) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date("2026-09-07T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return {
      date: date.toISOString().slice(0, 10),
      itemIds: offset === 0 ? first.itemIds ?? [] : [],
      lockedItemIds: offset === 0 ? first.lockedItemIds ?? [] : [],
      favorite: offset === 0 ? first.favorite ?? false : false,
    };
  });
}

describe("wardrobe image store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSignedUrl as jest.MockedFunction<typeof getSignedUrl>).mockResolvedValue(
      "https://signed.example"
    );
  });

  test("builds account-owned PNG keys", () => {
    expect(
      wardrobeImageKey({
        userId: USER_ID,
        scope: SUB_ACCOUNT_ID,
        itemId: ITEM_ID,
      })
    ).toBe(`users/${USER_ID}/${SUB_ACCOUNT_ID}/${ITEM_ID}.png`);
  });

  test("creates a PNG upload URL with a server-generated ID and key", async () => {
    const store = makeWardrobeImageStore({
      bucketName: "wardrobe-bucket",
      expiresIn: 900,
      s3Client: { send: jest.fn() } as any,
    });
    const result = await store.createUploadUrl({
      userId: USER_ID,
      scope: "primary",
    });

    expect(result).toMatchObject({
      imageKey: expect.stringMatching(
        new RegExp(`^users/${USER_ID}/primary/[0-9a-f-]{36}\\.png$`)
      ),
      uploadUrl: "https://signed.example",
      expiresIn: 900,
      contentType: "image/png",
    });
    expect(result.imageKey).toContain(result.itemId);
    const putCommand = (getSignedUrl as jest.Mock).mock.calls[0][1];
    expect(putCommand.input).toMatchObject({
      Bucket: "wardrobe-bucket",
      Key: result.imageKey,
      ContentType: "image/png",
    });
  });

  test("accepts only an existing, non-empty PNG within the size limit", async () => {
    const send = jest.fn().mockResolvedValue({
      ContentLength: 1024,
      ContentType: "image/png",
    });
    const store = makeWardrobeImageStore({
      bucketName: "wardrobe-bucket",
      s3Client: { send } as any,
    });

    await expect(store.assertImageReady(IMAGE_KEY)).resolves.toBeUndefined();
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "wardrobe-bucket",
      Key: IMAGE_KEY,
    });

    send.mockResolvedValueOnce({
      ContentLength: MAX_WARDROBE_IMAGE_BYTES + 1,
      ContentType: "image/png",
    });
    await expect(store.assertImageReady(IMAGE_KEY)).rejects.toMatchObject({
      status: 413,
    });

    send.mockResolvedValueOnce({ ContentLength: 1024, ContentType: "image/jpeg" });
    await expect(store.assertImageReady(IMAGE_KEY)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("wardrobe service", () => {
  test("requests a primary-account upload URL", async () => {
    const imageStore = images();
    const response = await createWardrobeUploadUrl({
      body: JSON.stringify({ fileName: "blue-shirt.png", contentType: "image/png" }),
      imageStore,
      userId: USER_ID,
    });

    expect(response.statusCode).toBe(200);
    expect(body(response)).toMatchObject({ itemId: ITEM_ID, imageKey: IMAGE_KEY });
    expect(imageStore.createUploadUrl).toHaveBeenCalledWith({
      userId: USER_ID,
      scope: "primary",
    });
  });

  test("rejects invalid upload content types and sub-account IDs", async () => {
    const imageStore = images();
    await expect(
      createWardrobeUploadUrl({
        body: JSON.stringify({ fileName: "shirt.jpg", contentType: "image/jpeg" }),
        imageStore,
        userId: USER_ID,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createWardrobeUploadUrl({
        body: JSON.stringify({ fileName: "shirt.png", contentType: "image/png" }),
        imageStore,
        userId: USER_ID,
        subAccountId: "../another-user",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(imageStore.createUploadUrl).not.toHaveBeenCalled();
  });

  test("creates an account-scoped item and returns a signed image URL", async () => {
    const dbService = db();
    const imageStore = images();
    const response = await createWardrobeItem({
      body: JSON.stringify(payload),
      dbService,
      imageStore,
      userId: USER_ID,
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: `USER#${USER_ID}`,
        SK: `WARDROBE_ITEM#${ITEM_ID}`,
        ...payload,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
    expect(imageStore.assertImageReady).toHaveBeenCalledWith(IMAGE_KEY);
    expect(body(response).item).toMatchObject({
      ...payload,
      imageUrl: "https://image.example",
    });
    expect(body(response).item).not.toHaveProperty("PK");
    expect(body(response).item).not.toHaveProperty("SK");
  });

  test("rejects a forged image key before writing metadata", async () => {
    const dbService = db();
    await expect(
      createWardrobeItem({
        body: JSON.stringify({
          ...payload,
          imageKey: `users/another-user/primary/${ITEM_ID}.png`,
        }),
        dbService,
        imageStore: images(),
        userId: USER_ID,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(dbService.putItem).not.toHaveBeenCalled();
  });

  test("lists only item records and adds fresh signed URLs", async () => {
    const dbService = db({
      queryItems: jest.fn().mockResolvedValue([
        {
          PK: `USER#${USER_ID}`,
          SK: `WARDROBE_ITEM#${ITEM_ID}`,
          ...payload,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]),
    });
    const response = await getWardrobeItems({
      dbService,
      imageStore: images(),
      userId: USER_ID,
    });

    expect(dbService.queryItems).toHaveBeenCalledWith(
      "PK = :pk AND begins_with(SK, :prefix)",
      {
        ":pk": { S: `USER#${USER_ID}` },
        ":prefix": { S: "WARDROBE_ITEM#" },
      }
    );
    expect(body(response)).toEqual([
      expect.objectContaining({ id: ITEM_ID, imageUrl: "https://image.example" }),
    ]);
  });

  test("updates editable metadata after confirming item ownership", async () => {
    const dbService = db({
      queryItems: jest.fn().mockResolvedValue([payload]),
      updateItem: jest.fn().mockResolvedValue({
        ...payload,
        favorite: true,
        updatedAt: "2026-09-03T10:00:00.000Z",
      }),
    });
    const response = await updateWardrobeItem({
      body: JSON.stringify({ favorite: true }),
      dbService,
      imageStore: images(),
      userId: USER_ID,
      wardrobeItemId: ITEM_ID,
    });

    expect(dbService.updateItem).toHaveBeenCalledWith(
      { PK: `USER#${USER_ID}`, SK: `WARDROBE_ITEM#${ITEM_ID}` },
      expect.stringContaining("#favorite = :favorite"),
      expect.objectContaining({ "#favorite": "favorite" }),
      expect.objectContaining({ ":favorite": true })
    );
    expect(body(response).item.favorite).toBe(true);
  });

  test("deletes the stored S3 key before deleting metadata", async () => {
    const dbService = db({
      queryItems: jest.fn().mockResolvedValue([payload]),
    });
    const imageStore = images();
    const response = await deleteWardrobeItem({
      dbService,
      imageStore,
      userId: USER_ID,
      wardrobeItemId: ITEM_ID,
    });

    expect(imageStore.deleteImage).toHaveBeenCalledWith(IMAGE_KEY);
    expect(dbService.deleteItem).toHaveBeenCalledWith({
      PK: `USER#${USER_ID}`,
      SK: `WARDROBE_ITEM#${ITEM_ID}`,
    });
    expect(imageStore.deleteImage.mock.invocationCallOrder[0]).toBeLessThan(
      dbService.deleteItem.mock.invocationCallOrder[0]
    );
    expect(body(response)).toEqual({ deleted: true, id: ITEM_ID });
  });

  test("removes a deleted item from saved outfits and locks", async () => {
    const savedPlan = {
      PK: `USER#${USER_ID}`,
      SK: "WARDROBE_PLAN#2026-09-07",
      weekStart: "2026-09-07",
      generation: 2,
      days: [
        {
          date: "2026-09-07",
          itemIds: [ITEM_ID, OTHER_ITEM_ID],
          lockedItemIds: [ITEM_ID],
          favorite: true,
        },
      ],
    };
    const dbService = db({
      queryItems: jest
        .fn()
        .mockResolvedValueOnce([payload])
        .mockResolvedValueOnce([savedPlan]),
      updateItem: jest.fn().mockResolvedValue(undefined),
    });

    await deleteWardrobeItem({
      dbService,
      imageStore: images(),
      userId: USER_ID,
      wardrobeItemId: ITEM_ID,
    });

    expect(dbService.updateItem).toHaveBeenCalledWith(
      {
        PK: `USER#${USER_ID}`,
        SK: "WARDROBE_PLAN#2026-09-07",
      },
      "SET #days = :days, #updatedAt = :updatedAt",
      { "#days": "days", "#updatedAt": "updatedAt" },
      expect.objectContaining({
        ":days": [
          expect.objectContaining({
            itemIds: [OTHER_ITEM_ID],
            lockedItemIds: [],
            favorite: true,
          }),
        ],
      })
    );
  });

  test("returns null when a weekly plan does not exist", async () => {
    const response = await getWardrobePlan({
      dbService: db(),
      userId: USER_ID,
      weekStart: "2026-09-07",
    });
    expect(response.statusCode).toBe(200);
    expect(body(response)).toBeNull();
  });

  test("creates a validated weekly plan", async () => {
    const dbService = db({
      queryItems: jest
        .fn()
        .mockResolvedValueOnce([payload])
        .mockResolvedValueOnce([]),
    });
    const plan = {
      weekStart: "2026-09-07",
      generation: 1,
      days: weekDays({
        itemIds: [ITEM_ID],
        lockedItemIds: [ITEM_ID],
        favorite: true,
      }),
    };
    const response = await putWardrobePlan({
      body: JSON.stringify(plan),
      dbService,
      userId: USER_ID,
      weekStart: plan.weekStart,
    });

    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: `USER#${USER_ID}`,
        SK: "WARDROBE_PLAN#2026-09-07",
        ...plan,
      })
    );
    expect(body(response).plan).toMatchObject(plan);
  });

  test("persists a new generation when updating a weekly plan", async () => {
    const existing = {
      PK: `USER#${USER_ID}`,
      SK: "WARDROBE_PLAN#2026-09-07",
      weekStart: "2026-09-07",
      generation: 1,
      days: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const dbService = db({
      queryItems: jest.fn().mockResolvedValue([existing]),
      updateItem: jest.fn().mockResolvedValue({
        ...existing,
        generation: 2,
        updatedAt: "2026-09-03T00:00:00.000Z",
      }),
    });
    const response = await putWardrobePlan({
      body: JSON.stringify({
        weekStart: "2026-09-07",
        generation: 2,
        days: weekDays(),
      }),
      dbService,
      userId: USER_ID,
      weekStart: "2026-09-07",
    });

    expect(dbService.updateItem).toHaveBeenCalledWith(
      {
        PK: `USER#${USER_ID}`,
        SK: "WARDROBE_PLAN#2026-09-07",
      },
      expect.stringContaining("#generation = :generation"),
      expect.objectContaining({ "#generation": "generation" }),
      expect.objectContaining({ ":generation": 2 })
    );
    expect(body(response).plan.generation).toBe(2);
  });

  test("rejects unknown plan items and locked items outside an outfit", async () => {
    const dbService = db();
    await expect(
      putWardrobePlan({
        body: JSON.stringify({
          weekStart: "2026-09-07",
          generation: 1,
          days: weekDays({ itemIds: [OTHER_ITEM_ID] }),
        }),
        dbService,
        userId: USER_ID,
        weekStart: "2026-09-07",
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      putWardrobePlan({
        body: JSON.stringify({
          weekStart: "2026-09-07",
          generation: 1,
          days: weekDays({ lockedItemIds: [ITEM_ID] }),
        }),
        dbService,
        userId: USER_ID,
        weekStart: "2026-09-07",
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
