import type { DbService } from "../src/services/shared/dbService";
import {
  acceptCalendarTransfer,
  createCalendarTransfer,
  hashTransferCode,
  previewCalendarTransfer,
} from "../src/services/calendar/transferCalendar";

function makeMemoryDb(initial: Record<string, any>[] = []) {
  const items = new Map<string, Record<string, any>>();
  const keyOf = (item: Record<string, any>) => `${item.PK}|${item.SK}`;
  const attr = (value: any) => value?.S ?? value;
  initial.forEach((item) => items.set(keyOf(item), { ...item }));

  const dbService: DbService = {
    getItem: jest.fn(async (key) => {
      const item = items.get(keyOf(key));
      if (!item) throw new Error("not found");
      return { ...item };
    }),
    putItem: jest.fn(async (item) => {
      const key = keyOf(item);
      if (items.has(key)) {
        const error = new Error("exists");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      items.set(key, { ...item });
    }),
    queryItems: jest.fn(async (_expression, values) => {
      const pk = attr(values[":pk"]);
      const sk = values[":sk"] ? attr(values[":sk"]) : undefined;
      const prefix = values[":skPrefix"]
        ? attr(values[":skPrefix"])
        : undefined;
      return Array.from(items.values())
        .filter((item) => {
          if (item.PK !== pk) return false;
          if (sk) return item.SK === sk;
          if (prefix) return item.SK.startsWith(prefix);
          return true;
        })
        .map((item) => ({ ...item }));
    }),
    updateItem: jest.fn(
      async (key, _expression, names, values) => {
        const current = items.get(keyOf(key));
        if (!current) throw new Error("not found");
        const updated = { ...current };
        Object.entries(names).forEach(([alias, name]) => {
          const valueAlias = `:${alias.slice(1)}`;
          updated[name] = values[valueAlias];
        });
        items.set(keyOf(key), updated);
        return { ...updated };
      }
    ),
    deleteItem: jest.fn(async (key) => {
      if (!items.delete(keyOf(key))) throw new Error("not found");
    }),
    deleteItemsByPrefix: jest.fn(),
    scanItems: jest.fn(),
  };

  return { dbService, items };
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

const sourceUserId = "11111111-1111-4111-8111-111111111111";
const recipientUserId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const code = "ABCD2345EFGH";
const now = new Date("2026-09-04T12:00:00.000Z");

function sourceEntry(overrides: Record<string, any> = {}) {
  return {
    PK: `USER#${sourceUserId}`,
    SK: `CALENDAR#${entryId}`,
    id: entryId,
    userId: sourceUserId,
    date: "2026-09-10",
    status: "booked",
    clients: [{ id: "client-1", name: "Ada", startTime: "10:00" }],
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

async function createRequest(
  dbService: DbService,
  overrides: Record<string, any> = {}
) {
  return createCalendarTransfer({
    dbService,
    userId: sourceUserId,
    sourceEmail: "sender@example.com",
    body: JSON.stringify({
      recipientEmail: "recipient@example.com",
      mode: "move",
      conflictPolicy: "merge",
      ...overrides,
    }),
    code,
    now,
  });
}

describe("calendar transfers", () => {
  test("creates a hashed, expiring transfer request for a calendar snapshot", async () => {
    const { dbService, items } = makeMemoryDb([sourceEntry()]);

    const response = await createRequest(dbService);
    const body = parseBody(response);

    expect(response.statusCode).toBe(201);
    expect(body).toEqual(
      expect.objectContaining({
        code: "ABCD-2345-EFGH",
        entryCount: 1,
        mode: "move",
        recipientEmail: "recipient@example.com",
      })
    );
    const record = items.get(
      `CALENDAR_TRANSFER#${hashTransferCode(code)}|REQUEST`
    );
    expect(record).toEqual(
      expect.objectContaining({
        status: "pending",
        entryIds: [entryId],
        expiresAt: Math.floor(now.getTime() / 1000) + 48 * 60 * 60,
      })
    );
    expect(JSON.stringify(record)).not.toContain(code);
  });

  test("moves entries, grants the recipient access, and consumes the code", async () => {
    const { dbService, items } = makeMemoryDb([sourceEntry()]);
    const { dbService: userDbService, items: users } = makeMemoryDb([
      {
        PK: `USER#${recipientUserId}`,
        SK: `PROFILE#${recipientUserId}`,
        email: "recipient@example.com",
      },
    ]);
    await createRequest(dbService);

    const response = await acceptCalendarTransfer({
      dbService,
      userDbService,
      body: JSON.stringify({ code: "ABCD-2345-EFGH" }),
      userId: recipientUserId,
      recipientEmail: "Recipient@Example.com",
      now: new Date("2026-09-04T13:00:00.000Z"),
    });

    expect(parseBody(response)).toEqual(
      expect.objectContaining({ mode: "move", copiedCount: 1 })
    );
    expect(items.has(`USER#${sourceUserId}|CALENDAR#${entryId}`)).toBe(false);
    expect(
      items.get(`USER#${recipientUserId}|CALENDAR#${entryId}`)
    ).toEqual(
      expect.objectContaining({
        userId: recipientUserId,
        date: "2026-09-10",
        clients: expect.arrayContaining([expect.objectContaining({ name: "Ada" })]),
      })
    );
    expect(
      users.get(`USER#${recipientUserId}|PROFILE#${recipientUserId}`)
        ?.calendarEnabled
    ).toBe(true);

    await expect(
      acceptCalendarTransfer({
        dbService,
        userDbService,
        body: JSON.stringify({ code }),
        userId: recipientUserId,
        recipientEmail: "recipient@example.com",
        now,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  test("previews transfer details without consuming the code", async () => {
    const { dbService, items } = makeMemoryDb([sourceEntry()]);
    await createRequest(dbService, { conflictPolicy: "replace" });

    const response = await previewCalendarTransfer({
      dbService,
      body: JSON.stringify({ code }),
      recipientEmail: "recipient@example.com",
      now,
    });

    expect(parseBody(response)).toEqual(
      expect.objectContaining({
        sourceEmail: "sender@example.com",
        mode: "move",
        conflictPolicy: "replace",
        entryCount: 1,
      })
    );
    expect(
      items.get(`CALENDAR_TRANSFER#${hashTransferCode(code)}|REQUEST`)?.status
    ).toBe("pending");
  });

  test("does not expose a transfer to another signed-in email", async () => {
    const { dbService, items } = makeMemoryDb([sourceEntry()]);
    const { dbService: userDbService } = makeMemoryDb();
    await createRequest(dbService);

    await expect(
      acceptCalendarTransfer({
        dbService,
        userDbService,
        body: JSON.stringify({ code }),
        userId: recipientUserId,
        recipientEmail: "attacker@example.com",
        now,
      })
    ).rejects.toMatchObject({ status: 403 });

    expect(items.has(`USER#${sourceUserId}|CALENDAR#${entryId}`)).toBe(true);
    expect(items.has(`USER#${recipientUserId}|CALENDAR#${entryId}`)).toBe(false);
  });

  test("skips source dates that already exist at the destination", async () => {
    const destinationId = "44444444-4444-4444-8444-444444444444";
    const { dbService, items } = makeMemoryDb([
      sourceEntry(),
      {
        ...sourceEntry({
          PK: `USER#${recipientUserId}`,
          SK: `CALENDAR#${destinationId}`,
          id: destinationId,
          userId: recipientUserId,
        }),
      },
    ]);
    const { dbService: userDbService } = makeMemoryDb([
      {
        PK: `USER#${recipientUserId}`,
        SK: `PROFILE#${recipientUserId}`,
      },
    ]);
    await createRequest(dbService, { conflictPolicy: "skip" });

    const response = await acceptCalendarTransfer({
      dbService,
      userDbService,
      body: JSON.stringify({ code }),
      userId: recipientUserId,
      recipientEmail: "recipient@example.com",
      now,
    });

    expect(parseBody(response)).toEqual(
      expect.objectContaining({ copiedCount: 0, skippedCount: 1 })
    );
    expect(items.has(`USER#${sourceUserId}|CALENDAR#${entryId}`)).toBe(true);
  });

  test("safely resumes a partially completed replace transfer", async () => {
    const secondEntryId = "55555555-5555-4555-8555-555555555555";
    const oldDestinationId = "66666666-6666-4666-8666-666666666666";
    const secondSource = sourceEntry({
      SK: `CALENDAR#${secondEntryId}`,
      id: secondEntryId,
    });
    const { dbService, items } = makeMemoryDb([sourceEntry(), secondSource]);
    const { dbService: userDbService } = makeMemoryDb([
      {
        PK: `USER#${recipientUserId}`,
        SK: `PROFILE#${recipientUserId}`,
      },
    ]);
    await createRequest(dbService, { conflictPolicy: "replace" });
    await dbService.putItem({
      ...sourceEntry(),
      PK: `USER#${recipientUserId}`,
      SK: `CALENDAR#${entryId}`,
      userId: recipientUserId,
      transferredFromUserId: sourceUserId,
    });
    await dbService.putItem({
      ...sourceEntry(),
      PK: `USER#${recipientUserId}`,
      SK: `CALENDAR#${oldDestinationId}`,
      id: oldDestinationId,
      userId: recipientUserId,
    });

    await acceptCalendarTransfer({
      dbService,
      userDbService,
      body: JSON.stringify({ code }),
      userId: recipientUserId,
      recipientEmail: "recipient@example.com",
      now,
    });

    expect(items.has(`USER#${recipientUserId}|CALENDAR#${entryId}`)).toBe(true);
    expect(
      items.has(`USER#${recipientUserId}|CALENDAR#${secondEntryId}`)
    ).toBe(true);
    expect(
      items.has(`USER#${recipientUserId}|CALENDAR#${oldDestinationId}`)
    ).toBe(false);
    expect(items.has(`USER#${sourceUserId}|CALENDAR#${entryId}`)).toBe(false);
    expect(
      items.has(`USER#${sourceUserId}|CALENDAR#${secondEntryId}`)
    ).toBe(false);
  });
});
