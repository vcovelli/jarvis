export type AuthMailKind = "password-reset" | "email-verification";

type AuthMail = {
  kind: AuthMailKind;
  to: string;
  url: string;
  expiresAt: Date;
};

export type MailDeliveryResult = { delivered: boolean; transport: "webhook" | "none"; error?: string };

export function buildPublicAuthUrl(pathname: string, token: string) {
  const base = process.env.NEXTAUTH_URL?.trim();
  if (!base) throw new Error("NEXTAUTH_URL is required to build authentication links.");
  const url = new URL(pathname, base);
  url.searchParams.set("token", token);
  return url.toString();
}

export function exposeDevelopmentAuthUrl(url: string) {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_EXPOSE_TOKENS?.toLowerCase() === "true"
    ? url
    : undefined;
}

export async function deliverAuthMail(mail: AuthMail): Promise<MailDeliveryResult> {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!webhookUrl || !from) return { delivered: false, transport: "none" };

  const subject = mail.kind === "password-reset" ? "Reset your Jarvis password" : "Verify your Jarvis email";
  const action = mail.kind === "password-reset" ? "Reset password" : "Verify email";
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EMAIL_WEBHOOK_BEARER_TOKEN
          ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_BEARER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: mail.to,
        subject,
        text: `${action}: ${mail.url}\nThis link expires at ${mail.expiresAt.toISOString()}.`,
        html: `<p><a href="${escapeHtml(mail.url)}">${action}</a></p><p>This link expires at ${mail.expiresAt.toISOString()}.</p>`,
        kind: mail.kind,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { delivered: false, transport: "webhook", error: `mail relay returned ${response.status}` };
    return { delivered: true, transport: "webhook" };
  } catch {
    return { delivered: false, transport: "webhook", error: "mail relay request failed" };
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
