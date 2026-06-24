import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GmailPushPayload {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface GmailReplyData {
  emailAddress: string;
  historyId: string;
}

interface ReplyEventRow {
  id: string;
  gmail_address: string;
  history_id: string;
  received_at: Date;
}

async function ensureReplyEventTable(): Promise<void> {
  const db = buildDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS sdr_gmail_reply_events (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gmail_address TEXT NOT NULL,
      history_id   TEXT NOT NULL,
      raw_payload  JSONB NOT NULL,
      received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

function verifyGmailWebhookToken(req: Request): boolean {
  const expectedToken = process.env.GMAIL_WEBHOOK_SECRET;
  if (!expectedToken) return true;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  return token === expectedToken;
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const normalized = pad ? padded + "=".repeat(4 - pad) : padded;
  return Buffer.from(normalized, "base64").toString("utf8");
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyGmailWebhookToken(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: GmailPushPayload;
  try {
    body = (await request.json()) as GmailPushPayload;
  } catch {
    return new NextResponse("Bad request: invalid JSON", { status: 400 });
  }

  const rawData = body.message?.data;
  if (!rawData) {
    return NextResponse.json({ ok: true, skipped: "no message data" });
  }

  let replyData: GmailReplyData;
  try {
    const decoded = decodeBase64Url(rawData);
    replyData = JSON.parse(decoded) as GmailReplyData;
  } catch {
    return new NextResponse("Bad request: could not decode message data", { status: 400 });
  }

  if (!replyData.emailAddress || !replyData.historyId) {
    return NextResponse.json({ ok: true, skipped: "missing emailAddress or historyId" });
  }

  try {
    await ensureReplyEventTable();

    const db = buildDb();
    const rows = await db.query<ReplyEventRow>(
      `SELECT id FROM sdr_gmail_reply_events
       WHERE gmail_address = $1 AND history_id = $2
       LIMIT 1`,
      replyData.emailAddress,
      replyData.historyId
    );

    if (rows.length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }

    await db.execute(
      `INSERT INTO sdr_gmail_reply_events (gmail_address, history_id, raw_payload)
       VALUES ($1, $2, $3)`,
      replyData.emailAddress,
      replyData.historyId,
      JSON.stringify(body)
    );

    console.log(
      JSON.stringify({
        event: "sdr.gmail_reply_received",
        gmail_address: replyData.emailAddress,
        history_id: replyData.historyId,
        message_id: body.message?.messageId ?? null,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "sdr.gmail_reply_error",
        error: String(err),
      })
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "Gmail reply webhook active" });
}
