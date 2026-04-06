import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailParams {
  to: string;
  fromName: string;
  replyTo: string;
  subject: string;
  body: string;
}

export async function sendFamilyEmail({
  to,
  fromName,
  replyTo,
  subject,
  body,
}: SendEmailParams): Promise<{ id: string }> {
  const html = buildEmailHtml(body, fromName);

  const { data, error } = await resend.emails.send({
    from: `${fromName} <updates@${process.env.RESEND_DOMAIN || "carenote.app"}>`,
    replyTo,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data!.id };
}

function buildEmailHtml(body: string, facilityName: string): string {
  const paragraphs = body
    .split("\n\n")
    .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff;">
  <div style="border-bottom: 2px solid #e5e5e5; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; font-size: 18px; color: #1a1a1a;">${facilityName}</h2>
  </div>
  ${paragraphs}
  <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #666;">
    <p style="margin: 0;">This update was sent by ${facilityName} using CareNote.</p>
  </div>
</body>
</html>`;
}
