import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBStreamHandler } from "aws-lambda";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function detailRow(label: string, value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  return `<tr><td style="padding:10px 0;color:#7b1d67;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 0;color:#3a143c;font-size:14px;font-weight:700;text-align:right;vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function bookingManageUrls(entry: Record<string, any>) {
  const manageBase = `${process.env.PUBLIC_SITE_URL ?? "https://prettybydollzzz.netlify.app/"}#manage=`;
  return {
    cancelUrl: `${manageBase}${encodeURIComponent(entry.manageToken)}&action=cancel`,
    rescheduleUrl: `${manageBase}${encodeURIComponent(entry.manageToken)}&action=reschedule`,
  };
}

function bookingEmailHtml(entry: Record<string, any>, client: Record<string, any>, style: Record<string, any>) {
  const isRescheduled = Boolean(entry.rescheduledFrom);
  const heading = isRescheduled ? "Appointment rescheduled." : "You’re booked.";
  const intro = isRescheduled
    ? "Your new appointment time has been confirmed."
    : "Your appointment has been added to the PrettybyDollzzz calendar.";
  const total = client.price !== undefined ? `€${client.price}` : "";
  const extra = client.extraName
    ? `${client.extraName}${client.extraPrice ? ` (+€${client.extraPrice})` : ""}`
    : "";
  const { cancelUrl, rescheduleUrl } = bookingManageUrls(entry);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#fff3fa;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#3a143c;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${heading} Reference ${escapeHtml(entry.confirmationCode)}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff3fa;"><tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fffafd;border:1px solid rgba(58,20,60,.18);">
      <tr><td style="padding:30px 34px;background:#3a143c;color:#fff3fa;text-align:center;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:.04em;">PrettybyDollzzz</div>
        <div style="margin-top:8px;color:#f8b8da;font-size:11px;letter-spacing:.18em;text-transform:uppercase;">Almere Poort · Your crown, made personal</div>
      </td></tr>
      <tr><td style="padding:38px 34px 20px;text-align:center;">
        <div style="width:56px;height:56px;margin:0 auto 22px;border-radius:50%;background:#b32677;color:white;font-size:28px;line-height:56px;">✓</div>
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:40px;font-weight:400;line-height:1.1;color:#3a143c;">${heading}</h1>
        <p style="margin:14px 0 0;color:#5c285d;font-size:15px;line-height:1.6;">Hi ${escapeHtml(client.name)}, ${intro}</p>
      </td></tr>
      <tr><td style="padding:10px 34px 30px;">
        <div style="padding:16px 18px;background:#fde8f4;border-left:4px solid #b32677;text-align:center;">
          <div style="color:#7b1d67;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Booking reference</div>
          <div style="margin-top:5px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#3a143c;">${escapeHtml(entry.confirmationCode)}</div>
        </div>
      </td></tr>
      <tr><td style="padding:0 34px 34px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(58,20,60,.18);border-bottom:1px solid rgba(58,20,60,.18);">
          ${detailRow("Hair style", entry.hairStyleName)}
          ${detailRow("Size", style.size)}
          ${detailRow("Length", style.length)}
          ${detailRow("Extra", extra)}
          ${detailRow("Date", entry.date)}
          ${detailRow("Time", entry.startTime)}
          ${detailRow("Total", total)}
        </table>
      </td></tr>
      <tr><td style="padding:28px 34px;background:#fff3fa;">
        <h2 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:400;">Before your appointment</h2>
        <p style="margin:0;color:#5c285d;font-size:13px;line-height:1.7;">Please arrive with washed, fully detangled and completely dry hair. Do not apply oils, gels or leave-in products unless advised. Hair is not included.</p>
      </td></tr>
      <tr><td style="padding:0 34px 32px;background:#fff3fa;text-align:center;">
        <a href="${escapeHtml(rescheduleUrl)}" style="display:inline-block;margin:4px;padding:12px 18px;background:#b32677;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">Reschedule appointment</a>
        <a href="${escapeHtml(cancelUrl)}" style="display:inline-block;margin:4px;padding:11px 18px;border:1px solid #7b1d67;color:#7b1d67;text-decoration:none;font-size:13px;font-weight:700;">Cancel appointment</a>
      </td></tr>
      <tr><td style="padding:24px 34px;background:#3a143c;color:#f8b8da;text-align:center;font-size:11px;line-height:1.6;">PrettybyDollzzz · Almere Poort<br><span style="color:#fff3fa;">I use Red One Wax for a neat, polished finish.</span></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function cancellationEmailHtml(entry: Record<string, any>, client: Record<string, any>) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Appointment cancelled</title></head>
<body style="margin:0;padding:0;background:#fff3fa;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#3a143c;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 14px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffafd;border:1px solid rgba(58,20,60,.18);">
<tr><td style="padding:30px 34px;background:#3a143c;color:#fff3fa;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:25px;">PrettybyDollzzz</td></tr>
<tr><td style="padding:44px 34px;text-align:center;"><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:40px;font-weight:400;">Appointment cancelled.</h1><p style="margin:16px 0 0;color:#5c285d;line-height:1.7;">Hi ${escapeHtml(client.name)}, your appointment on ${escapeHtml(entry.date)} at ${escapeHtml(entry.startTime)} has been cancelled and the timeslot has been released.</p><div style="margin-top:26px;padding:15px;background:#fde8f4;color:#7b1d67;font-size:13px;">Reference: <strong>${escapeHtml(entry.confirmationCode)}</strong></div></td></tr>
<tr><td style="padding:24px 34px;background:#3a143c;color:#f8b8da;text-align:center;font-size:11px;">PrettybyDollzzz · Almere Poort</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(payload: Record<string, any>) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Prettybydollzzz", email: process.env.BOOKING_EMAIL_FROM! },
      bcc: process.env.BOOKING_EMAIL_FROM ? [{ email: process.env.BOOKING_EMAIL_FROM }] : undefined,
      ...payload,
    }),
  });
  if (!response.ok) throw new Error(`Brevo email failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  console.log("Brevo message accepted:", result.messageId);
}

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    if (!record.dynamodb?.NewImage) continue;
    const entry = unmarshall(record.dynamodb.NewImage as never) as Record<string, any>;
    if (entry.source !== "prettybydollzzz-web") continue;

    const client = entry.clients?.[0];
    if (!client?.email) continue;
    if (record.eventName === "MODIFY") {
      const previous = record.dynamodb.OldImage
        ? unmarshall(record.dynamodb.OldImage as never) as Record<string, any>
        : undefined;
      if (entry.status === "cancelled" && previous?.status === "booked") {
        await sendEmail({
          to: [{ email: client.email }],
          subject: `PrettybyDollzzz appointment cancelled ${entry.confirmationCode}`,
          htmlContent: cancellationEmailHtml(entry, client),
          textContent: `Hi ${client.name},\n\nYour appointment on ${entry.date} at ${entry.startTime} has been cancelled.\nReference: ${entry.confirmationCode}`,
        });
      }
      continue;
    }
    if (record.eventName !== "INSERT") continue;
    const style = client.hairStyle ?? {};
    const { cancelUrl, rescheduleUrl } = bookingManageUrls(entry);
    const subject = entry.rescheduledFrom
      ? `PrettybyDollzzz appointment rescheduled ${entry.confirmationCode}`
      : `PrettybyDollzzz booking ${entry.confirmationCode}`;
    const details = [
      `Booking reference: ${entry.confirmationCode}`,
      `Name: ${client.name}`,
      `Hair style: ${entry.hairStyleName}`,
      `Style: ${style.style}`,
      `Size: ${style.size}`,
      `Length: ${style.length}`,
      client.extraName ? `Extra: ${client.extraName} (+€${client.extraPrice})` : "",
      client.price !== undefined ? `Total: €${client.price}` : "",
      `Date: ${entry.date}`,
      `Time: ${entry.startTime}`,
      `Phone: ${client.phone}`,
      client.notes ? `Notes: ${client.notes}` : "",
      style.additionalDetails ? `Style details: ${style.additionalDetails}` : "",
    ].filter(Boolean).join("\n");


    await sendEmail({
        to: [
          {
            email: client.email,
          },
        ],
        subject,
        htmlContent: bookingEmailHtml(entry, client, style),
        textContent: `Your appointment is booked.

${details}

Hair is not included.

Reschedule: ${rescheduleUrl}
Cancel: ${cancelUrl}`,
    });
  }
};
