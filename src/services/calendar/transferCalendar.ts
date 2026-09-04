import { createHash, randomBytes } from "node:crypto";
import {
  CalendarTransferAcceptSchema,
  CalendarTransferRequestSchema,
} from "../../domain/models/calendarTransfer";
import { normalizeEmail } from "../../utils/admin";
import { createPk } from "../../utils/createPk";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import type { DbService } from "../shared/dbService";
import { getCalendarEntryItems } from "./getCalendarEntries";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRANSFER_LIFETIME_SECONDS = 48 * 60 * 60;

type TransferRecord = {
  PK: string;
  SK: "REQUEST";
  sourceUserId: string;
  sourceSubAccountId?: string;
  sourceEmail: string;
  recipientEmail: string;
  mode: "copy" | "move";
  conflictPolicy: "merge" | "skip" | "replace";
  dateFrom?: string;
  dateTo?: string;
  entryIds: string[];
  status: "pending" | "accepted";
  createdAt: string;
  expiresAt: number;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

export function normalizeTransferCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashTransferCode(code: string) {
  return createHash("sha256").update(normalizeTransferCode(code)).digest("hex");
}

function transferPk(code: string) {
  return `CALENDAR_TRANSFER#${hashTransferCode(code)}`;
}

function generateTransferCode() {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function displayTransferCode(code: string) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

function parseJson(body: string) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    throw new HttpError("Invalid request body", 400, { cause: error as Error });
  }
}

function isInRange(entry: Record<string, any>, dateFrom?: string, dateTo?: string) {
  return (!dateFrom || entry.date >= dateFrom) && (!dateTo || entry.date <= dateTo);
}

async function getPendingTransfer({
  dbService,
  body,
  recipientEmail,
  now,
}: {
  dbService: DbService;
  body: string;
  recipientEmail: string;
  now: Date;
}) {
  const request = CalendarTransferAcceptSchema.parse(parseJson(body));
  const code = normalizeTransferCode(request.code);
  const records = await dbService.queryItems(
    "PK = :pk AND SK = :sk",
    {
      ":pk": { S: transferPk(code) },
      ":sk": { S: "REQUEST" },
    }
  );
  const transfer = records[0] as TransferRecord | undefined;

  if (!transfer || transfer.status !== "pending") {
    throw new HttpError("Transfer code is invalid or has already been used", 404);
  }
  if (transfer.expiresAt <= Math.floor(now.getTime() / 1000)) {
    throw new HttpError("Transfer code has expired", 410);
  }
  if (normalizeEmail(recipientEmail) !== transfer.recipientEmail) {
    throw new HttpError("This transfer was created for a different account", 403);
  }

  return transfer;
}

export async function createCalendarTransfer({
  dbService,
  body,
  userId,
  sourceEmail,
  sourceSubAccountId,
  now = new Date(),
  code = generateTransferCode(),
}: {
  dbService: DbService;
  body: string;
  userId: string;
  sourceEmail: string;
  sourceSubAccountId?: string;
  now?: Date;
  code?: string;
}) {
  const request = CalendarTransferRequestSchema.parse(parseJson(body));
  const normalizedSourceEmail = normalizeEmail(sourceEmail);
  const recipientEmail = normalizeEmail(request.recipientEmail);

  if (!normalizedSourceEmail) {
    throw new HttpError("Your account email is required", 400);
  }
  if (recipientEmail === normalizedSourceEmail) {
    throw new HttpError("Choose a different recipient account", 400);
  }

  const entries = (
    await getCalendarEntryItems({
      dbService,
      userId,
      subAccountId: sourceSubAccountId,
    })
  ).filter((entry) => isInRange(entry, request.dateFrom, request.dateTo));

  if (!entries.length) {
    throw new HttpError("There are no calendar entries in that date range", 400);
  }

  const normalizedCode = normalizeTransferCode(code);
  const createdAt = now.toISOString();
  const expiresAt = Math.floor(now.getTime() / 1000) + TRANSFER_LIFETIME_SECONDS;
  const record: TransferRecord = {
    PK: transferPk(normalizedCode),
    SK: "REQUEST",
    sourceUserId: userId,
    sourceSubAccountId,
    sourceEmail: normalizedSourceEmail,
    recipientEmail,
    mode: request.mode,
    conflictPolicy: request.conflictPolicy,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    entryIds: entries.map((entry) => entry.id),
    status: "pending",
    createdAt,
    expiresAt,
  };

  await dbService.putItem(record);

  return successResponse(
    {
      code: displayTransferCode(normalizedCode),
      recipientEmail,
      mode: record.mode,
      conflictPolicy: record.conflictPolicy,
      entryCount: record.entryIds.length,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    },
    201
  );
}

export async function acceptCalendarTransfer({
  dbService,
  userDbService,
  body,
  userId,
  recipientEmail,
  now = new Date(),
}: {
  dbService: DbService;
  userDbService: DbService;
  body: string;
  userId: string;
  recipientEmail: string;
  now?: Date;
}) {
  const transfer = await getPendingTransfer({
    dbService,
    body,
    recipientEmail,
    now,
  });
  if (transfer.sourceUserId === userId) {
    throw new HttpError("You cannot accept your own calendar transfer", 400);
  }

  const [sourceEntries, initialDestinationEntries] = await Promise.all([
    getCalendarEntryItems({
      dbService,
      userId: transfer.sourceUserId,
      subAccountId: transfer.sourceSubAccountId,
    }),
    getCalendarEntryItems({ dbService, userId }),
  ]);
  const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));
  const destinationEntries = [...initialDestinationEntries];
  const transferEntryIds = new Set(transfer.entryIds);
  const preexistingDestinationEntries = initialDestinationEntries.filter(
    (entry) =>
      !(
        entry.transferredFromUserId === transfer.sourceUserId &&
        transferEntryIds.has(entry.id)
      )
  );
  const originalDestinationDates = new Set(
    preexistingDestinationEntries.map((entry) => entry.date)
  );
  const replacedDates = new Set<string>();
  const sourceEntriesToDelete: Record<string, any>[] = [];
  let copiedCount = 0;
  let skippedCount = 0;
  let missingCount = 0;

  for (const entryId of transfer.entryIds) {
    const source = sourceById.get(entryId);
    const existingCopy = destinationEntries.find((entry) => entry.id === entryId);

    if (existingCopy) {
      copiedCount += 1;
      if (source) sourceEntriesToDelete.push(source);
      continue;
    }
    if (!source) {
      missingCount += 1;
      continue;
    }
    if (
      transfer.conflictPolicy === "skip" &&
      originalDestinationDates.has(source.date)
    ) {
      skippedCount += 1;
      continue;
    }

    if (
      transfer.conflictPolicy === "replace" &&
      originalDestinationDates.has(source.date) &&
      !replacedDates.has(source.date)
    ) {
      const conflicts = preexistingDestinationEntries.filter(
        (entry) => entry.date === source.date
      );
      for (const conflict of conflicts) {
        await dbService.deleteItem({
          PK: createPk(userId),
          SK: `CALENDAR#${conflict.id}`,
        });
        const conflictIndex = destinationEntries.findIndex(
          (entry) => entry.id === conflict.id
        );
        if (conflictIndex >= 0) destinationEntries.splice(conflictIndex, 1);
      }
      replacedDates.add(source.date);
    }

    const transferredEntry = {
      ...source,
      PK: createPk(userId),
      SK: `CALENDAR#${source.id}`,
      userId,
      subAccountId: undefined,
      transferredFromUserId: transfer.sourceUserId,
      transferredAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await dbService.putItem(transferredEntry);
    destinationEntries.push(transferredEntry);
    sourceEntriesToDelete.push(source);
    copiedCount += 1;
  }

  if (transfer.mode === "move") {
    for (const source of sourceEntriesToDelete) {
      await dbService.deleteItem({
        PK: createPk(transfer.sourceUserId, transfer.sourceSubAccountId),
        SK: `CALENDAR#${source.id}`,
      });
    }
  }

  await userDbService.updateItem(
    { PK: createPk(userId), SK: `PROFILE#${userId}` },
    "SET #calendarEnabled = :calendarEnabled, #updatedAt = :updatedAt",
    { "#calendarEnabled": "calendarEnabled", "#updatedAt": "updatedAt" },
    { ":calendarEnabled": true, ":updatedAt": now.toISOString() }
  );

  await dbService.updateItem(
    { PK: transfer.PK, SK: transfer.SK },
    "SET #status = :status, #acceptedAt = :acceptedAt, #acceptedByUserId = :acceptedByUserId",
    {
      "#status": "status",
      "#acceptedAt": "acceptedAt",
      "#acceptedByUserId": "acceptedByUserId",
    },
    {
      ":status": "accepted",
      ":acceptedAt": now.toISOString(),
      ":acceptedByUserId": userId,
    }
  );

  return successResponse({
    message: `Calendar ${transfer.mode === "move" ? "moved" : "copied"} successfully`,
    mode: transfer.mode,
    copiedCount,
    skippedCount,
    missingCount,
  });
}

export async function previewCalendarTransfer({
  dbService,
  body,
  recipientEmail,
  now = new Date(),
}: {
  dbService: DbService;
  body: string;
  recipientEmail: string;
  now?: Date;
}) {
  const transfer = await getPendingTransfer({
    dbService,
    body,
    recipientEmail,
    now,
  });

  return successResponse({
    sourceEmail: transfer.sourceEmail,
    mode: transfer.mode,
    conflictPolicy: transfer.conflictPolicy,
    entryCount: transfer.entryIds.length,
    dateFrom: transfer.dateFrom,
    dateTo: transfer.dateTo,
    expiresAt: new Date(transfer.expiresAt * 1000).toISOString(),
  });
}
