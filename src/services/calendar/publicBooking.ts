import { createHash, randomUUID } from "node:crypto";
import { addMonths } from "date-fns";
import { z } from "zod";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import type { DbService } from "../shared/dbService";

const HairStyleCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  style: z.string(),
  duration: z.number().int().positive().nullable(),
  price: z.number().nonnegative(),
  priceLabel: z.string(),
  pricing: z.record(z.string(), z.record(z.string(), z.number().nonnegative())).optional(),
});

export type PublicHairStyle = z.infer<typeof HairStyleCardSchema>;

export const publicHairStyles: PublicHairStyle[] = [
  { id: "knotless-styles", name: "Knotless / French Curl / Kinky / Marly", category: "Braids", style: "knotless", duration: 60, price: 45, priceLabel: "from €45", pricing: {
    large: { shoulder: 45, bra: 55, waist: 65 },
    medium: { shoulder: 50, bra: 60, waist: 75 },
    smedium: { shoulder: 55, bra: 65, waist: 80 },
  } },
  { id: "boho-braids", name: "Boho Braids", category: "Braids", style: "boho", duration: 120, price: 55, priceLabel: "from €55", pricing: {
    large: { shoulder: 55, bra: 65, waist: 75 },
    medium: { shoulder: 60, bra: 70, waist: 85 },
    smedium: { shoulder: 65, bra: 75, waist: 90 },
  } },
  { id: "crochet-full-head", name: "Crochet — Full Head", category: "Crochet", style: "crochet", duration: 200, price: 50, priceLabel: "€50" },
  { id: "crochet-360", name: "Crochet 360 (Single)", category: "Crochet", style: "crochet 360", duration: 240, price: 60, priceLabel: "€60" },
  { id: "sew-in-leave-out", name: "Sew-in Leave Out", category: "Weave", style: "sew-in leave out", duration: 360, price: 50, priceLabel: "€50" },
  { id: "jayda-wayda", name: "Jayda Wayda", category: "Style", style: "jayda wayda", duration: 120, price: 55, priceLabel: "€55" },
  { id: "stitch-braids", name: "Stitch Braids (8–10)", category: "Braids", style: "stitch braids", duration: 60, price: 40, priceLabel: "€40" },
];

export const publicBookingExtras = [
  { id: "curls-at-tip", name: "Curls at the tip", price: 5 },
  { id: "blending-of-colors", name: "Blending of colors", price: 5 },
  { id: "extra-length-below-waist", name: "Extra length below waist", price: 10 },
] as const;

const BookingRequestSchema = z.object({
  requestId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hairStyleId: z.string().min(1).max(80),
  hairStyle: z.object({
    style: z.string().trim().min(1).max(80),
    size: z.enum(["smedium", "medium", "large"]),
    length: z.enum(["shoulder", "bra", "waist"]),
    additionalDetails: z.string().trim().max(500).optional(),
  }),
  extraId: z.enum(["curls-at-tip", "blending-of-colors", "extra-length-below-waist"]).optional(),
  client: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(40)
      .refine((value) => /^(?:\+31|0031|0)6\d{8}$/.test(value.replace(/[\s()-]/g, "")), {
        message: "Enter a valid Dutch mobile WhatsApp number",
      })
      .transform((value) => {
        const compact = value.replace(/[\s()-]/g, "");
        if (compact.startsWith("06")) return `+31${compact.slice(1)}`;
        if (compact.startsWith("0031")) return `+${compact.slice(2)}`;
        return compact;
      }),
    notes: z.string().trim().max(1000).optional().default(""),
  }),
  website: z.string().max(0).optional(),
});

const ManageBookingRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("details"), manageToken: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), manageToken: z.string().uuid() }),
  z.object({
    action: z.literal("reschedule"),
    manageToken: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
]);

type CalendarRecord = {
  id?: string;
  date?: string;
  status?: "available" | "booked" | "unavailable" | "cancelled" | "rescheduled";
  clients?: Array<{ startTime?: string; hairStyle?: { style?: string } }>;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  hairStyleName?: string;
  manageToken?: string;
  confirmationCode?: string;
  PK?: string;
  SK?: string;
};

export async function getPublicBookingAvailability({
  dbService,
  userId,
  hairStyleId,
  today = new Date(),
}: {
  dbService: DbService;
  userId: string;
  hairStyleId?: string;
  today?: Date;
}) {
  const entries = await getCalendarRecords(dbService, userId);
  const selectedStyle = hairStyleId
    ? publicHairStyles.find(({ id }) => id === hairStyleId)
    : undefined;
  if (hairStyleId && !selectedStyle) throw new HttpError("Selected hair style is unavailable", 400);
  return successResponse({
    hairStyles: publicHairStyles,
    extras: publicBookingExtras,
    availability: buildAvailability(entries, today, selectedStyle?.duration ?? 60),
  });
}

export async function createPublicBooking({
  dbService,
  userId,
  body,
  now = new Date(),
}: {
  dbService: DbService;
  userId: string;
  body: string;
  now?: Date;
}) {
  const request = parseBookingRequest(body);
  const selectedStyle = publicHairStyles.find(({ id }) => id === request.hairStyleId);
  if (!selectedStyle || request.hairStyle.style !== selectedStyle.style) {
    throw new HttpError("Selected hair style is unavailable", 400);
  }
  const selectedExtra = request.extraId
    ? publicBookingExtras.find(({ id }) => id === request.extraId)
    : undefined;
  const basePrice = selectedStyle.pricing?.[request.hairStyle.size]?.[request.hairStyle.length]
    ?? selectedStyle.price;
  const totalPrice = basePrice + (selectedExtra?.price ?? 0);

  const entries = await getCalendarRecords(dbService, userId);
  const availability = buildAvailability(entries, now, selectedStyle.duration ?? 60);
  const date = availability.find((item) => item.date === request.date);
  if (!date?.slots.includes(request.time)) {
    throw new HttpError("This appointment is no longer available", 409);
  }

  const id = slotId(userId, request.date, request.time);
  const confirmationCode = `PBD-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const manageToken = randomUUID();
  const timestamp = now.toISOString();
  const item = {
    PK: createPk(userId),
    SK: `CALENDAR#${id}`,
    id,
    userId,
    date: request.date,
    status: "booked",
    startTime: request.time,
    clients: [{
      id: request.requestId,
      name: request.client.name,
      email: request.client.email,
      phone: request.client.phone,
      startTime: request.time,
      price: totalPrice,
      basePrice,
      extraId: selectedExtra?.id,
      extraName: selectedExtra?.name,
      extraPrice: selectedExtra?.price,
      notes: request.client.notes || undefined,
      hairStyle: request.hairStyle,
    }],
    notes: `PrettybyDollzzz website booking ${confirmationCode}`,
    source: "prettybydollzzz-web",
    confirmationCode,
    manageToken,
    hairStyleName: selectedStyle.name,
    totalPrice,
    durationMinutes: selectedStyle.duration,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await dbService.putItem(item);
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      throw new HttpError("This appointment was just booked. Choose another time.", 409);
    }
    throw error;
  }

  return successResponse({
    confirmationCode,
    booking: formatDbItem(item),
  }, 201);
}

export async function managePublicBooking({
  dbService,
  userId,
  body,
  now = new Date(),
}: {
  dbService: DbService;
  userId: string;
  body: string;
  now?: Date;
}) {
  let request: z.infer<typeof ManageBookingRequestSchema>;
  try {
    request = ManageBookingRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    throw new HttpError("Invalid booking management request", 400, { cause: error as Error });
  }
  const entries = await getCalendarRecords(dbService, userId);
  const booking = entries.find((entry) => entry.manageToken === request.manageToken);
  if (!booking || booking.status !== "booked" || !booking.PK || !booking.SK) {
    throw new HttpError("This booking link is invalid or no longer active", 404);
  }
  const selectedStyle = publicHairStyles.find(({ name }) => name === booking.hairStyleName);
  if (!selectedStyle) throw new HttpError("The booked hair style is no longer available", 409);

  if (request.action === "details") {
    return successResponse({
      booking: {
        confirmationCode: booking.confirmationCode,
        hairStyleId: selectedStyle.id,
        hairStyleName: selectedStyle.name,
        date: booking.date,
        time: booking.startTime,
      },
      availability: buildAvailability(entries, now, selectedStyle.duration ?? 60),
    });
  }

  const timestamp = now.toISOString();
  if (request.action === "cancel") {
    await dbService.updateItem(
      { PK: booking.PK, SK: booking.SK },
      "SET #status = :status, updatedAt = :updatedAt REMOVE manageToken",
      { "#status": "status" },
      { ":status": "cancelled", ":updatedAt": timestamp },
    );
    return successResponse({ cancelled: true, confirmationCode: booking.confirmationCode });
  }

  const availability = buildAvailability(entries, now, selectedStyle.duration ?? 60);
  const availableDate = availability.find(({ date }) => date === request.date);
  if (!availableDate?.slots.includes(request.time)) {
    throw new HttpError("This appointment is no longer available", 409);
  }
  const newId = slotId(userId, request.date, request.time);
  const newConfirmationCode = `PBD-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const nextBooking = {
    ...booking,
    SK: `CALENDAR#${newId}`,
    id: newId,
    date: request.date,
    startTime: request.time,
    confirmationCode: newConfirmationCode,
    clients: (booking.clients ?? []).map((client) => ({ ...client, startTime: request.time })),
    rescheduledFrom: booking.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await dbService.putItem(nextBooking);
  await dbService.updateItem(
    { PK: booking.PK, SK: booking.SK },
    "SET #status = :status, rescheduledTo = :rescheduledTo, updatedAt = :updatedAt REMOVE manageToken",
    { "#status": "status" },
    { ":status": "rescheduled", ":rescheduledTo": newId, ":updatedAt": timestamp },
  );
  return successResponse({
    rescheduled: true,
    confirmationCode: newConfirmationCode,
    booking: { date: request.date, time: request.time, hairStyleName: selectedStyle.name },
  });
}

async function getCalendarRecords(dbService: DbService, userId: string) {
  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    { ":pk": { S: createPk(userId) }, ":skPrefix": { S: "CALENDAR#" } },
  ) as Promise<CalendarRecord[]>;
}

function buildAvailability(
  entries: CalendarRecord[],
  today = new Date(),
  requestedDuration = 60,
) {
  const from = toAmsterdamDateKey(today);
  const to = toDateKey(addMonths(new Date(`${from}T12:00:00.000Z`), 3));
  const dates = new Map<string, CalendarRecord[]>();
  const cursor = new Date(`${from}T12:00:00.000Z`);
  const finalDate = new Date(`${to}T12:00:00.000Z`);
  while (cursor <= finalDate) {
    if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
      dates.set(toDateKey(cursor), []);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const entry of entries) {
    if (!entry.date || entry.date < from || entry.date > to) continue;
    dates.set(entry.date, [...(dates.get(entry.date) ?? []), entry]);
  }

  return Array.from(dates.entries())
    .filter(([date, records]) =>
      (isWeekend(date) || records.some(({ status }) => status === "available")) &&
      !records.some(({ status }) => status === "unavailable")
    )
    .map(([date, records]) => {
      const availableRecords = records.filter(({ status }) => status === "available");
      const bookedIntervals = records.flatMap((record) => {
        if (record.status === "cancelled" || record.status === "rescheduled") return [];
        const entryStart = record.status === "booked" ? record.startTime : undefined;
        const entryDuration = record.durationMinutes ?? durationForStyle(record.hairStyleName) ?? durationForStyle(record.clients?.[0]?.hairStyle?.style) ?? 60;
        const entryInterval = entryStart
          ? [{ start: timeToMinutes(entryStart), end: record.endTime ? timeToMinutes(record.endTime) : timeToMinutes(entryStart) + entryDuration }]
          : [];
        const clientIntervals = (record.clients ?? []).flatMap((client) => {
          if (!client.startTime) return [];
          const duration = durationForStyle(client.hairStyle?.style) ?? record.durationMinutes ?? 60;
          const start = timeToMinutes(client.startTime);
          return [{ start, end: start + duration }];
        });
        return [...entryInterval, ...clientIntervals];
      });
      const windows = availableRecords.filter((record) => record.startTime || record.endTime);
      const slots = defaultSlots(date).filter((slot) => {
        const start = timeToMinutes(slot);
        const end = start + requestedDuration;
        if (bookedIntervals.some((booked) => start < booked.end && end > booked.start)) return false;
        if (!windows.length) return end <= timeToMinutes("18:00");
        return windows.some((window) => {
          const windowStart = timeToMinutes(window.startTime ?? "00:00");
          const windowEnd = timeToMinutes(window.endTime ?? "23:59");
          return start >= windowStart && end <= windowEnd;
        });
      });
      return { date, slots };
    })
    .filter(({ slots }) => slots.length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function defaultSlots(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 6) return ["09:00", "10:30", "12:00", "13:30", "15:00"];
  if (day === 2 || day === 4) return ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00"];
  return ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
}

function durationForStyle(style?: string) {
  if (!style) return undefined;
  return publicHairStyles.find((item) => item.style === style || item.name === style)?.duration ?? undefined;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function parseBookingRequest(body: string) {
  try {
    return BookingRequestSchema.parse(JSON.parse(body));
  } catch (error) {
    throw new HttpError("Invalid booking details", 400, { cause: error as Error });
  }
}

function slotId(userId: string, date: string, time: string) {
  const hash = createHash("sha256").update(`${userId}|${date}|${time}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toAmsterdamDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export const publicBookingInternals = { buildAvailability, defaultSlots, slotId };
