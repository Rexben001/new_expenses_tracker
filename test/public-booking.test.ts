import type { DbService } from "../src/services/shared/dbService";
import {
  createPublicBooking,
  getPublicBookingAvailability,
} from "../src/services/calendar/publicBooking";

const userId = "e2b5c4a4-1051-705e-8904-c843af6f3cbe";

function makeDb(initial: Record<string, any>[] = []) {
  const items = new Map(initial.map((item) => [`${item.PK}|${item.SK}`, item]));
  const dbService: DbService = {
    getItem: jest.fn(),
    putItem: jest.fn(async (item) => {
      const key = `${item.PK}|${item.SK}`;
      if (items.has(key)) {
        const error = new Error("exists");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      items.set(key, item);
    }),
    queryItems: jest.fn(async () => Array.from(items.values())),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    deleteItemsByPrefix: jest.fn(),
    scanItems: jest.fn(),
  };
  return { dbService, items };
}

function body(response: { body: string }) {
  return JSON.parse(response.body);
}

function available(date = "2026-10-27") {
  return {
    PK: `USER#${userId}`,
    SK: `CALENDAR#availability-${date}`,
    id: `availability-${date}`,
    userId,
    date,
    status: "available",
    clients: [],
    updatedAt: "2026-10-20T10:00:00.000Z",
  };
}

describe("public calendar booking", () => {
  test("returns future available dates, open slots, and backend service catalog", async () => {
    const { dbService } = makeDb([
      available(),
      {
        ...available(),
        SK: "CALENDAR#existing-booking",
        id: "existing-booking",
        status: "booked",
        clients: [{ name: "Private client", email: "private@example.com", startTime: "11:30" }],
      },
      available("2026-10-20"),
      available("2027-01-25"),
    ]);

    const response = await getPublicBookingAvailability({
      dbService,
      userId,
      today: new Date("2026-10-24T12:00:00.000Z"),
    });
    const result = body(response);

    expect(result.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "boho-braids", style: "boho" }),
    ]));
    expect(result.availability).toEqual([{ date: "2026-10-27", slots: ["10:00", "13:00", "15:00", "16:30", "18:00"] }]);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });

  test("creates a booked calendar entry for the selected slot", async () => {
    const { dbService, items } = makeDb([available()]);
    const response = await createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        serviceId: "boho-braids",
        hairStyle: {
          style: "boho",
          size: "small",
          length: "waist",
          additionalDetails: "Copper curls",
        },
        client: {
          name: "Ada Client",
          email: "ada@example.com",
          phone: "+31612345678",
          notes: "Waist length",
        },
      }),
    });
    const result = body(response);

    expect(response.statusCode).toBe(201);
    expect(result.confirmationCode).toMatch(/^PBD-[A-F0-9]{8}$/);
    expect(Array.from(items.values())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: "2026-10-27",
        status: "booked",
        startTime: "10:00",
        clients: [expect.objectContaining({
          name: "Ada Client",
          startTime: "10:00",
          hairStyle: {
            style: "boho",
            size: "small",
            length: "waist",
            additionalDetails: "Copper curls",
          },
        })],
      }),
    ]));
  });

  test("rejects a slot already present in calendar", async () => {
    const { dbService } = makeDb([
      available(),
      {
        ...available(),
        SK: "CALENDAR#booked",
        id: "booked",
        status: "booked",
        startTime: "10:00",
      },
    ]);

    await expect(createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        serviceId: "boho-braids",
        hairStyle: { style: "boho", size: "small", length: "waist" },
        client: { name: "Ada", email: "ada@example.com", phone: "+31612345678" },
      }),
    })).rejects.toMatchObject({ status: 409 });
  });

  test("requires client-provided hair style details", async () => {
    const { dbService } = makeDb([available()]);
    await expect(createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        serviceId: "boho-braids",
        client: { name: "Ada", email: "ada@example.com", phone: "+31612345678" },
      }),
    })).rejects.toMatchObject({ status: 400 });
  });
});
