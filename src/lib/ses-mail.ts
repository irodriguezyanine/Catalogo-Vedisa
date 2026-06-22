import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

export function getSesClient(): SESClient | null {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) return null;
  return new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
}

function encodeSubjectUtf8(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function foldBase64(base64: string): string {
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? base64;
}

export async function sendEmailWithPdfAttachment(input: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachmentName: string;
  attachmentBytes: Uint8Array;
}): Promise<void> {
  const ses = getSesClient();
  if (!ses) {
    throw new Error("AWS SES no configurado (faltan credenciales).");
  }

  const boundary = `vedisa_mixed_${Date.now()}`;
  const altBoundary = `vedisa_alt_${Date.now()}`;
  const attachmentBase64 = Buffer.from(input.attachmentBytes).toString("base64");

  const raw = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeSubjectUtf8(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${input.attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.attachmentName}"`,
    "",
    foldBase64(attachmentBase64),
    "",
    `--${boundary}--`,
  ].join("\r\n");

  await ses.send(
    new SendRawEmailCommand({
      Source: input.from,
      Destinations: input.to,
      RawMessage: { Data: Buffer.from(raw) },
    }),
  );
}
