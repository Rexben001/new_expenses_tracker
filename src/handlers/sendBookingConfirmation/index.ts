import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBStreamHandler } from "aws-lambda";

const ses = new SESv2Client({});

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== "INSERT" || !record.dynamodb?.NewImage) continue;
    const entry = unmarshall(record.dynamodb.NewImage as never) as Record<string, any>;
    if (entry.source !== "prettybydollzzz-web") continue;

    const client = entry.clients?.[0];
    if (!client?.email) continue;
    const style = client.hairStyle ?? {};
    const subject = `PrettybyDollzzz booking ${entry.confirmationCode}`;
    const details = [
      `Booking reference: ${entry.confirmationCode}`,
      `Name: ${client.name}`,
      `Hair style: ${entry.hairStyleName}`,
      `Style: ${style.style}`,
      `Size: ${style.size}`,
      `Length: ${style.length}`,
      `Date: ${entry.date}`,
      `Time: ${entry.startTime}`,
      `Phone: ${client.phone}`,
      client.notes ? `Notes: ${client.notes}` : "",
      style.additionalDetails ? `Style details: ${style.additionalDetails}` : "",
    ].filter(Boolean).join("\n");

   
const response = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": process.env.BREVO_API_KEY!,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    sender: {
      name: "Hair Salon",
      email: process.env.BOOKING_EMAIL_FROM!,
    },
    to: [
      {
        email: client.email,
      },
    ],
    subject,
    textContent: `Your appointment is booked.

${details}

Hair is not included. A €20 non-refundable deposit is required.`,
  }),
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(`Brevo email failed (${response.status}): ${error}`);
}

const result = await response.json();
console.log("Brevo message accepted:", result.messageId);

  }
};
