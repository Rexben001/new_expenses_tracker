import type { DbService } from "../src/services/shared/dbService";
import {
  createPublicBooking,
  getPublicBookingAvailability,
  managePublicBooking,
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
    incrementCounter: jest.fn(async (key, initialValue) => {
      const mapKey = `${key.PK}|${key.SK}`;
      const current = items.get(mapKey)?.value ?? initialValue;
      const value = current + 1;
      items.set(mapKey, { ...key, value });
      return value;
    }),
    queryItems: jest.fn(async () => Array.from(items.values())),
    updateItem: jest.fn(async (key, _expression, _names, values) => {
      const item = items.get(`${key.PK}|${key.SK}`);
      if (!item) throw new Error("missing");
      item.status = values[":status"];
      item.updatedAt = values[":updatedAt"];
      if (values[":rescheduledTo"]) item.rescheduledTo = values[":rescheduledTo"];
      delete item.manageToken;
      return item;
    }),
    deleteItem: jest.fn(async (key) => {
      items.delete(`${key.PK}|${key.SK}`);
    }),
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
  test("returns future available dates, open slots, hair styles, and extras", async () => {
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

    expect(result.hairStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "boho-braids", style: "boho", pricing: expect.any(Object) }),
    ]));
    expect(result.extras).toEqual(expect.arrayContaining([
      { id: "curls-at-tip", name: "Curls at the tip", price: 5 },
    ]));
    expect(result.availability).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-10-24" }),
      expect.objectContaining({ date: "2026-10-25" }),
      { date: "2026-10-27", slots: ["10:00", "15:00", "16:30"] },
    ]));
    expect(result.availability).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2027-01-25" }),
    ]));
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
        hairStyleId: "boho-braids",
        hairStyle: {
          style: "boho",
          size: "smedium",
          length: "waist",
          additionalDetails: "Copper curls",
        },
        extraId: "curls-at-tip",
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
    expect(result.confirmationCode).toBe("PBD-2026C45");
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
            size: "smedium",
            length: "waist",
            additionalDetails: "Copper curls",
          },
          price: 95,
          basePrice: 90,
          extraName: "Curls at the tip",
          extraPrice: 5,
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
        hairStyleId: "boho-braids",
        hairStyle: { style: "boho", size: "smedium", length: "waist" },
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
        hairStyleId: "boho-braids",
        client: { name: "Ada", email: "ada@example.com", phone: "+31612345678" },
      }),
    })).rejects.toMatchObject({ status: 400 });
  });

  test("rejects the removed small size", async () => {
    const { dbService } = makeDb([available()]);
    await expect(createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        hairStyleId: "boho-braids",
        hairStyle: { style: "boho", size: "small", length: "waist" },
        client: { name: "Ada", email: "ada@example.com", phone: "+31612345678" },
      }),
    })).rejects.toMatchObject({ status: 400 });
  });

  test("rejects invalid email and malformed phone numbers", async () => {
    const { dbService } = makeDb([available()]);
    await expect(createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        hairStyleId: "boho-braids",
        hairStyle: { style: "boho", size: "medium", length: "waist" },
        client: { name: "Ada", email: "not-an-email", phone: "abc" },
      }),
    })).rejects.toMatchObject({ status: 400 });
  });

  test("normalizes a Dutch mobile number for WhatsApp", async () => {
    const { dbService, items } = makeDb([available()]);
    await createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        date: "2026-10-27",
        time: "10:00",
        hairStyleId: "boho-braids",
        hairStyle: { style: "boho", size: "medium", length: "waist" },
        client: { name: "Ada", email: "ADA@EXAMPLE.COM", phone: "06 1234 5678" },
      }),
    });
    expect(Array.from(items.values())).toEqual(expect.arrayContaining([
      expect.objectContaining({ clients: [expect.objectContaining({ email: "ada@example.com", phone: "+31612345678" })] }),
    ]));
  });

  test("allows fixed-price styles without size or length", async () => {
    const { dbService, items } = makeDb([available()]);
    await createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "33333333-3333-4333-8333-333333333333",
        date: "2026-10-27",
        time: "10:00",
        hairStyleId: "crochet-full-head",
        hairStyle: { style: "crochet" },
        client: { name: "Ada", email: "ada@example.com", phone: "0612345678" },
      }),
    });
    expect(Array.from(items.values())).toEqual(expect.arrayContaining([
      expect.objectContaining({ hairStyleName: "Crochet — Full Head", totalPrice: 50 }),
    ]));
  });

  test("accepts international WhatsApp numbers and requires 8 or 10 Stitch Braids", async () => {
    const { dbService, items } = makeDb([available()]);
    await createPublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-24T12:00:00.000Z"),
      body: JSON.stringify({
        requestId: "44444444-4444-4444-8444-444444444444",
        date: "2026-10-27",
        time: "10:00",
        hairStyleId: "stitch-braids",
        hairStyle: { style: "stitch braids", size: "8" },
        client: { name: "Ada", email: "ada@example.com", phone: "+44 7700 900123" },
      }),
    });
    expect(Array.from(items.values())).toEqual(expect.arrayContaining([
      expect.objectContaining({ clients: [expect.objectContaining({ phone: "+447700900123", hairStyle: expect.objectContaining({ size: "8" }) })] }),
    ]));
  });

  test("blocks slots before and after an appointment using both style durations", async () => {
    const { dbService } = makeDb([
      {
        ...available("2026-10-31"),
        SK: "CALENDAR#booked-duration",
        id: "booked-duration",
        status: "booked",
        clients: [{ startTime: "12:00", hairStyle: { style: "boho" } }],
      },
    ]);

    const response = await getPublicBookingAvailability({
      dbService,
      userId,
      hairStyleId: "boho-braids",
      today: new Date("2026-10-30T12:00:00.000Z"),
    });

    expect(body(response).availability).toEqual(expect.arrayContaining([
      { date: "2026-10-31", slots: ["09:00", "15:00"] },
    ]));
  });

  test("blocks 09:00 after a legacy 08:00 appointment with missing duration", async () => {
    const { dbService } = makeDb([{
      ...available("2026-10-31"),
      SK: "CALENDAR#legacy-8am",
      id: "legacy-8am",
      status: "booked",
      clients: [{ startTime: "08:00", hairStyle: { style: "Legacy custom style" } }],
    }]);
    const response = await getPublicBookingAvailability({
      dbService,
      userId,
      hairStyleId: "knotless-styles",
      today: new Date("2026-10-30T12:00:00.000Z"),
    });
    const date = body(response).availability.find((item: any) => item.date === "2026-10-31");
    expect(date?.slots).not.toContain("09:00");
  });

  test("loads and cancels a booking through its private management token", async () => {
    const manageToken = "22222222-2222-4222-8222-222222222222";
    const booking = {
      PK: `USER#${userId}`,
      SK: "CALENDAR#managed-booking",
      id: "managed-booking",
      date: "2026-10-31",
      status: "booked",
      startTime: "12:00",
      hairStyleName: "Boho Braids",
      durationMinutes: 120,
      confirmationCode: "PBD-MANAGED1",
      manageToken,
      clients: [{ startTime: "12:00", hairStyle: { style: "boho" } }],
    };
    const { dbService, items } = makeDb([booking]);
    const details = body(await managePublicBooking({
      dbService, userId, now: new Date("2026-10-25T12:00:00.000Z"),
      body: JSON.stringify({ action: "details", manageToken }),
    }));
    expect(details.booking).toEqual(expect.objectContaining({ confirmationCode: "PBD-MANAGED1", hairStyleId: "boho-braids" }));

    const cancelled = body(await managePublicBooking({
      dbService, userId, now: new Date("2026-10-25T12:00:00.000Z"),
      body: JSON.stringify({ action: "cancel", manageToken }),
    }));
    expect(cancelled.cancelled).toBe(true);
    expect(items.get(`${booking.PK}|${booking.SK}`)).toBeUndefined();
    await expect(managePublicBooking({
      dbService, userId,
      body: JSON.stringify({ action: "details", manageToken }),
    })).rejects.toMatchObject({ status: 404 });
  });

  test("rejects cancellation inside the 24-hour Amsterdam window", async () => {
    const manageToken = "55555555-5555-4555-8555-555555555555";
    const booking = {
      PK: `USER#${userId}`,
      SK: "CALENDAR#late-cancel",
      id: "late-cancel",
      date: "2026-10-31",
      status: "booked",
      startTime: "12:00",
      hairStyleName: "Boho Braids",
      confirmationCode: "PBD-2026C55",
      manageToken,
      clients: [{ startTime: "12:00", hairStyle: { style: "boho" } }],
    };
    const { dbService, items } = makeDb([booking]);
    await expect(managePublicBooking({
      dbService,
      userId,
      now: new Date("2026-10-30T12:30:00.000Z"),
      body: JSON.stringify({ action: "cancel", manageToken }),
    })).rejects.toMatchObject({ status: 409 });
    expect(items.get(`${booking.PK}|${booking.SK}`)).toBeDefined();
  });
});
