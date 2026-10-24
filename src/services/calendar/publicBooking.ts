import { createHash, randomUUID } from "node:crypto";
import { addMonths } from "date-fns";
import { z } from "zod";
import { createPk } from "../../utils/createPk";
import { formatDbItem } from "../../utils/format-item";
import { HttpError } from "../../utils/http-error";
import { successResponse } from "../../utils/response";
import type { DbService } from "../shared/dbService";

const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  style: z.string(),
  duration: z.number().int().positive().nullable(),
  price: z.number().nonnegative(),
  priceLabel: z.string(),
});

export type PublicBookingService = z.infer<typeof ServiceSchema>;

export const publicBookingServices: PublicBookingService[] = [
  { id: "knotless-styles", name: "Knotless / French Curl / Kinky / Marly", category: "Braids", style: "knotless", duration: null, price: 45, priceLabel: "from €45" },
  { id: "boho-braids", name: "Boho Braids", category: "Braids", style: "boho", duration: null, price: 55, priceLabel: "from €55" },
  { id: "crochet-full-head", name: "Crochet — Full Head", category: "Crochet", style: "crochet", duration: null, price: 50, priceLabel: "€50" },
  { id: "crochet-360", name: "Crochet 360 (Single)", category: "Crochet", style: "crochet 360", duration: null, price: 60, priceLabel: "€60" },
  { id: "sew-in-leave-out", name: "Sew-in Leave Out", category: "Weave", style: "sew-in leave out", duration: null, price: 50, priceLabel: "€50" },
  { id: "jayda-wayda", name: "Jayda Wayda", category: "Style", style: "jayda wayda", duration: null, price: 55, priceLabel: "€55" },
  { id: "stitch-braids", name: "Stitch Braids (8–10)", category: "Braids", style: "stitch braids", duration: null, price: 40, priceLabel: "€40" },
];

const BookingRequestSchema = z.object({
  requestId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceId: z.string().min(1).max(80),
  hairStyle: z.object({
    style: z.string().trim().min(1).max(80),
    size: z.enum(["small", "smedium", "medium", "large"]),
    length: z.string().trim().min(1).max(50),
    additionalDetails: z.string().trim().max(500).optional(),
  }),
  client: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(5).max(40),
    notes: z.string().trim().max(1000).optional().default(""),
  }),
  website: z.string().max(0).optional(),
});

type CalendarRecord = {
  id?: string;
  date?: string;
  status?: "available" | "booked" | "unavailable";
  clients?: Array<{ startTime?: string }>;
  startTime?: string;
  endTime?: string;
};

export async function getPublicBookingAvailability({
  dbService,
  userId,
  today = new Date(),
}: {
  dbService: DbService;
  userId: string;
  today?: Date;
}) {
  const entries = await getCalendarRecords(dbService, userId);
  return successResponse({
    services: publicBookingServices,
    availability: buildAvailability(entries, today),
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
  const service = publicBookingServices.find(({ id }) => id === request.serviceId);
  if (!service) throw new HttpError("Selected service is unavailable", 400);
  if (!publicBookingServices.some(({ style }) => style === request.hairStyle.style)) {
    throw new HttpError("Selected hair style is unavailable", 400);
  }

  const entries = await getCalendarRecords(dbService, userId);
  const availability = buildAvailability(entries, now);
  const date = availability.find((item) => item.date === request.date);
  if (!date?.slots.includes(request.time)) {
    throw new HttpError("This appointment is no longer available", 409);
  }

  const id = slotId(userId, request.date, request.time);
  const confirmationCode = `PBD-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
      price: service.price,
      notes: request.client.notes || undefined,
      hairStyle: request.hairStyle,
    }],
    notes: `PrettybyDollzzz website booking ${confirmationCode}`,
    source: "prettybydollzzz-web",
    confirmationCode,
    serviceName: service.name,
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

async function getCalendarRecords(dbService: DbService, userId: string) {
  return dbService.queryItems(
    "PK = :pk AND begins_with(SK, :skPrefix)",
    { ":pk": { S: createPk(userId) }, ":skPrefix": { S: "CALENDAR#" } },
  ) as Promise<CalendarRecord[]>;
}

function buildAvailability(entries: CalendarRecord[], today = new Date()) {
  const from = toDateKey(today);
  const to = toDateKey(addMonths(new Date(`${from}T12:00:00.000Z`), 3));
  const dates = new Map<string, CalendarRecord[]>();
  for (const entry of entries) {
    if (!entry.date || entry.date < from || entry.date > to) continue;
    dates.set(entry.date, [...(dates.get(entry.date) ?? []), entry]);
  }

  return Array.from(dates.entries())
    .filter(([, records]) =>
      records.some(({ status }) => status === "available") &&
      !records.some(({ status }) => status === "unavailable")
    )
    .map(([date, records]) => {
      const availableRecords = records.filter(({ status }) => status === "available");
      const bookedTimes = new Set(
        records.flatMap((record) => [
          ...(record.status === "booked" && record.startTime ? [record.startTime] : []),
          ...(record.clients ?? []).flatMap((client) => client.startTime ? [client.startTime] : []),
        ]),
      );
      const windows = availableRecords.filter((record) => record.startTime || record.endTime);
      const slots = defaultSlots(date).filter((slot) => {
        if (bookedTimes.has(slot)) return false;
        if (!windows.length) return true;
        return windows.some((window) =>
          (!window.startTime || slot >= window.startTime) &&
          (!window.endTime || slot < window.endTime)
        );
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

export const publicBookingInternals = { buildAvailability, defaultSlots, slotId };
