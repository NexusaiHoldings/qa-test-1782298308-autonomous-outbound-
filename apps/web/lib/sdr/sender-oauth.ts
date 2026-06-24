import crypto from "node:crypto";
import { buildDb } from "@/lib/db";

export interface SenderConnection {
  id: string;
  userId: string;
  provider: "gmail" | "outlook";
  email: string;
  connectedAt: Date;
  tokenExpiresAt: Date | null;
}

export interface SenderHealthMetrics {
  dailyQuotaRemaining: number;
  spfStatus: "pass" | "fail" | "unknown";
  dkimStatus: "pass" | "fail" | "unknown";
}

interface TokenRow {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  created_at: Date;
}

interface HealthRow {
  daily_quota_remaining: number;
  spf_status: string;
  dkim_status: string;
}

interface RefreshRow {
  id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
}

function getEncryptionKey(): Buffer {
  const key = process.env.SENDER_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("SENDER_TOKEN_ENCRYPTION_KEY env var is not set");
  return Buffer.from(key, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function ensureSenderSchema(): Promise<void> {
  const db = buildDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS sdr_sender_connections (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL,
      provider              TEXT NOT NULL,
      email                 TEXT NOT NULL,
      access_token_enc      TEXT NOT NULL,
      refresh_token_enc     TEXT,
      token_expires_at      TIMESTAMPTZ,
      daily_quota_remaining INT  NOT NULL DEFAULT 500,
      spf_status            TEXT NOT NULL DEFAULT 'unknown',
      dkim_status           TEXT NOT NULL DEFAULT 'unknown',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, provider)
    )`
  );
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getGmailOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_OAUTH_CLIENT_ID ?? "",
    redirect_uri: process.env.GMAIL_OAUTH_REDIRECT_URI ?? "",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getOutlookOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_OAUTH_CLIENT_ID ?? "",
    redirect_uri: process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? "",
    response_type: "code",
    scope: "https://graph.microsoft.com/Mail.Send offline_access User.Read",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeGmailCode(code: string, userId: string): Promise<void> {
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GMAIL_OAUTH_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenResp.ok) {
    const detail = await tokenResp.text().catch(() => "");
    throw new Error(`Gmail token exchange failed (${tokenResp.status}): ${detail.slice(0, 300)}`);
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResp.ok) throw new Error("Failed to fetch Gmail user info");
  const userInfo = (await userResp.json()) as { email: string };

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const db = buildDb();
  await db.execute(
    `INSERT INTO sdr_sender_connections
       (user_id, provider, email, access_token_enc, refresh_token_enc, token_expires_at)
     VALUES ($1, 'gmail', $2, $3, $4, $5)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       email             = EXCLUDED.email,
       access_token_enc  = EXCLUDED.access_token_enc,
       refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, sdr_sender_connections.refresh_token_enc),
       token_expires_at  = EXCLUDED.token_expires_at,
       updated_at        = NOW()`,
    userId,
    userInfo.email,
    encryptToken(tokens.access_token),
    tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    expiresAt
  );
}

export async function exchangeOutlookCode(code: string, userId: string): Promise<void> {
  const tokenResp = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.OUTLOOK_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.OUTLOOK_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? "",
        grant_type: "authorization_code",
      }).toString(),
    }
  );

  if (!tokenResp.ok) {
    const detail = await tokenResp.text().catch(() => "");
    throw new Error(`Outlook token exchange failed (${tokenResp.status}): ${detail.slice(0, 300)}`);
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const userResp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResp.ok) throw new Error("Failed to fetch Outlook user info");
  const userInfo = (await userResp.json()) as {
    mail?: string;
    userPrincipalName?: string;
  };
  const email = userInfo.mail ?? userInfo.userPrincipalName ?? "unknown@outlook.com";

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const db = buildDb();
  await db.execute(
    `INSERT INTO sdr_sender_connections
       (user_id, provider, email, access_token_enc, refresh_token_enc, token_expires_at)
     VALUES ($1, 'outlook', $2, $3, $4, $5)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       email             = EXCLUDED.email,
       access_token_enc  = EXCLUDED.access_token_enc,
       refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, sdr_sender_connections.refresh_token_enc),
       token_expires_at  = EXCLUDED.token_expires_at,
       updated_at        = NOW()`,
    userId,
    email,
    encryptToken(tokens.access_token),
    tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    expiresAt
  );
}

export async function getSenderConnection(userId: string): Promise<SenderConnection | null> {
  const db = buildDb();
  const rows = await db.query<TokenRow>(
    `SELECT id, user_id, provider, email, access_token_enc, refresh_token_enc,
            token_expires_at, created_at
     FROM sdr_sender_connections
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    userId
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as "gmail" | "outlook",
    email: row.email,
    connectedAt: row.created_at,
    tokenExpiresAt: row.token_expires_at,
  };
}

export async function getSenderHealth(userId: string): Promise<SenderHealthMetrics | null> {
  const db = buildDb();
  const rows = await db.query<HealthRow>(
    `SELECT daily_quota_remaining, spf_status, dkim_status
     FROM sdr_sender_connections
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    userId
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    dailyQuotaRemaining: row.daily_quota_remaining,
    spfStatus: row.spf_status as "pass" | "fail" | "unknown",
    dkimStatus: row.dkim_status as "pass" | "fail" | "unknown",
  };
}

export async function disconnectSenderById(
  connectionId: string,
  userId: string
): Promise<void> {
  const db = buildDb();
  await db.execute(
    `DELETE FROM sdr_sender_connections WHERE id = $1 AND user_id = $2`,
    connectionId,
    userId
  );
}

export async function getAccessToken(
  userId: string,
  provider: "gmail" | "outlook"
): Promise<string | null> {
  const db = buildDb();
  const rows = await db.query<RefreshRow>(
    `SELECT id, access_token_enc, refresh_token_enc, token_expires_at
     FROM sdr_sender_connections
     WHERE user_id = $1 AND provider = $2
     LIMIT 1`,
    userId,
    provider
  );
  if (!rows.length) return null;
  const row = rows[0];

  const now = new Date();
  const bufferMs = 5 * 60 * 1000;
  if (row.token_expires_at && row.token_expires_at.getTime() - now.getTime() > bufferMs) {
    return decryptToken(row.access_token_enc);
  }

  if (!row.refresh_token_enc) return null;
  const refreshToken = decryptToken(row.refresh_token_enc);

  if (provider === "gmail") {
    return refreshGmailAccessToken(row.id, refreshToken);
  }
  return refreshOutlookAccessToken(row.id, refreshToken);
}

async function refreshGmailAccessToken(
  connectionId: string,
  refreshToken: string
): Promise<string | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!resp.ok) return null;

  const tokens = (await resp.json()) as { access_token: string; expires_in?: number };
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const db = buildDb();
  await db.execute(
    `UPDATE sdr_sender_connections
     SET access_token_enc = $1, token_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    encryptToken(tokens.access_token),
    expiresAt,
    connectionId
  );
  return tokens.access_token;
}

async function refreshOutlookAccessToken(
  connectionId: string,
  refreshToken: string
): Promise<string | null> {
  const resp = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.OUTLOOK_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.OUTLOOK_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? "",
        grant_type: "refresh_token",
      }).toString(),
    }
  );
  if (!resp.ok) return null;

  const tokens = (await resp.json()) as { access_token: string; expires_in?: number };
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const db = buildDb();
  await db.execute(
    `UPDATE sdr_sender_connections
     SET access_token_enc = $1, token_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    encryptToken(tokens.access_token),
    expiresAt,
    connectionId
  );
  return tokens.access_token;
}
