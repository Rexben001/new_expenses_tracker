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

    await ses.send(new SendEmailCommand({
      FromEmailAddress: process.env.BOOKING_EMAIL_FROM!,
      Destination: {
        ToAddresses: [client.email],
        BccAddresses: [process.env.BOOKING_OWNER_EMAIL!],
      },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: {
              Data: `Your appointment is booked.\n\n${details}\n\nHair is not included. A €20 non-refundable deposit is required.`,
              Charset: "UTF-8",
            },
          },
        },
      },
    }));
  }
};
