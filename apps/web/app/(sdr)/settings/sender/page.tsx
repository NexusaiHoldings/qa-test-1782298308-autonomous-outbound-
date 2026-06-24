import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { handleSession } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import {
  ensureSenderSchema,
  generateOAuthState,
  getGmailOAuthUrl,
  getOutlookOAuthUrl,
  exchangeGmailCode,
  exchangeOutlookCode,
  getSenderConnection,
  getSenderHealth,
  disconnectSenderById,
  type SenderConnection,
  type SenderHealthMetrics,
} from "@/lib/sdr/sender-oauth";

async function getSession(): Promise<{ userId: string; email: string } | null> {
  const cookieStore = cookies();
  const token = cookieStore.get("session_token")?.value;
  if (!token) return null;

  const result = await handleSession({
    authorizationHeader: `Bearer ${token}`,
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  if (result.status !== 200 || typeof result.body === "string") return null;
  const body = result.body as { user_id: string; email: string };
  return { userId: body.user_id, email: body.email };
}

function StatusBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 10px",
          borderRadius: "9999px",
          background: "#dcfce7",
          color: "#166534",
          fontWeight: 600,
          fontSize: "0.82rem",
        }}
      >
        ✓ Pass
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 10px",
        borderRadius: "9999px",
        background: "#fee2e2",
        color: "#991b1b",
        fontWeight: 600,
        fontSize: "0.82rem",
      }}
    >
      ✗ Fail
    </span>
  );
}

function UnknownBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 10px",
        borderRadius: "9999px",
        background: "#f3f4f6",
        color: "#6b7280",
        fontWeight: 600,
        fontSize: "0.82rem",
      }}
    >
      — Unknown
    </span>
  );
}

function ConnectedCard({
  connection,
  health,
}: {
  connection: SenderConnection;
  health: SenderHealthMetrics | null;
}) {
  return (
    <div
      className="card"
      style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.08)", maxWidth: "520px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <span style={{ fontSize: "2rem" }}>
          {connection.provider === "gmail" ? "📧" : "📨"}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1rem" }}>{connection.email}</div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "4px",
              padding: "2px 10px",
              borderRadius: "9999px",
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            ✓ Connected
            {connection.provider === "gmail" ? " · Gmail" : " · Outlook"}
          </div>
        </div>
      </div>

      <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

      <h3 style={{ marginBottom: "12px", fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
        Sender Health
      </h3>

      <table style={{ width: "100%", fontSize: "0.9rem", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "6px 0", color: "#6b7280" }}>Daily quota remaining</td>
            <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>
              {health ? health.dailyQuotaRemaining.toLocaleString() : "—"}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "6px 0", color: "#6b7280" }}>SPF</td>
            <td style={{ padding: "6px 0", textAlign: "right" }}>
              {health ? (
                health.spfStatus === "unknown" ? (
                  <UnknownBadge />
                ) : (
                  <StatusBadge ok={health.spfStatus === "pass"} />
                )
              ) : (
                <UnknownBadge />
              )}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "6px 0", color: "#6b7280" }}>DKIM</td>
            <td style={{ padding: "6px 0", textAlign: "right" }}>
              {health ? (
                health.dkimStatus === "unknown" ? (
                  <UnknownBadge />
                ) : (
                  <StatusBadge ok={health.dkimStatus === "pass"} />
                )
              ) : (
                <UnknownBadge />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

      <form
        action={async (formData: FormData) => {
          "use server";
          const cid = formData.get("connectionId") as string;
          const uid = formData.get("userId") as string;
          if (cid && uid) {
            await disconnectSenderById(cid, uid);
          }
          redirect("/sdr/settings/sender");
        }}
      >
        <input type="hidden" name="connectionId" value={connection.id} />
        <input type="hidden" name="userId" value={connection.userId} />
        <button
          type="submit"
          className="btn secondary"
          style={{ fontSize: "0.88rem" }}
        >
          Disconnect
        </button>
      </form>
    </div>
  );
}

export default async function SenderSettingsPage({
  searchParams,
}: {
  searchParams: { code?: string; state?: string; error?: string };
}) {
  await ensureSenderSchema();

  const cookieStore = cookies();

  // Handle OAuth callback (provider is encoded at end of state: "<hex>:gmail" or "<hex>:outlook")
  if (searchParams.code && searchParams.state) {
    const storedState = cookieStore.get("oauth_state")?.value;

    if (storedState && storedState === searchParams.state) {
      const session = await getSession();
      if (session) {
        const parts = searchParams.state.split(":");
        const provider = parts[parts.length - 1];
        try {
          if (provider === "outlook") {
            await exchangeOutlookCode(searchParams.code, session.userId);
          } else {
            await exchangeGmailCode(searchParams.code, session.userId);
          }
        } catch (err) {
          console.error("[sdr/sender] OAuth exchange error:", err);
        }
      }
    }
    redirect("/sdr/settings/sender");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const connection = await getSenderConnection(session.userId);
  const health = connection ? await getSenderHealth(session.userId) : null;

  return (
    <main>
      <h1>Sender Account</h1>
      <p>
        Connect your Gmail or Outlook account to send outreach emails directly
        from your own inbox — keeping your sender reputation and deliverability
        under your control.
      </p>

      {searchParams.error && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: "20px",
            borderRadius: "6px",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: "0.9rem",
          }}
        >
          OAuth error: {searchParams.error}. Please try connecting again.
        </div>
      )}

      {connection ? (
        <ConnectedCard connection={connection} health={health} />
      ) : (
        <div className="empty" style={{ maxWidth: "480px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📥</div>
          <h2 style={{ marginBottom: "8px" }}>Connect your inbox to start sending</h2>
          <p className="muted" style={{ marginBottom: "20px" }}>
            Authenticate with Gmail or Outlook (send-only scope) so your
            outreach goes out from your own address.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <form
              action={async () => {
                "use server";
                const randomPart = generateOAuthState();
                const state = `${randomPart}:gmail`;
                cookies().set("oauth_state", state, {
                  httpOnly: true,
                  secure: true,
                  sameSite: "lax",
                  maxAge: 300,
                  path: "/",
                });
                redirect(getGmailOAuthUrl(state));
              }}
            >
              <button type="submit" className="btn" style={{ minWidth: "160px" }}>
                Connect Gmail
              </button>
            </form>

            <form
              action={async () => {
                "use server";
                const randomPart = generateOAuthState();
                const state = `${randomPart}:outlook`;
                cookies().set("oauth_state", state, {
                  httpOnly: true,
                  secure: true,
                  sameSite: "lax",
                  maxAge: 300,
                  path: "/",
                });
                redirect(getOutlookOAuthUrl(state));
              }}
            >
              <button
                type="submit"
                className="btn secondary"
                style={{ minWidth: "160px" }}
              >
                Connect Outlook
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
