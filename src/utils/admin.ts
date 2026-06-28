import type { APIGatewayEvent } from "aws-lambda";
import { HttpError } from "./http-error";

export const DEFAULT_ADMIN_EMAILS = [
  "rexben.rb@gmail.com",
  "hello@benjaminajewole.com",
  "dollyrexben@gmail.com",
  "tmgbolade.96@gmail.com",
];

export function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function getAdminEmails() {
  const source = process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS.join(",");
  return new Set(
    source
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isAdminEmail(email: unknown) {
  return getAdminEmails().has(normalizeEmail(email));
}

export function assertAdmin(event: APIGatewayEvent) {
  const email = event.requestContext?.authorizer?.claims?.email;
  if (!isAdminEmail(email)) {
    throw new HttpError("Admin access required", 403);
  }
}
