// Email connector — polls an IMAP inbox for unread messages and replies over
// SMTP (works from a desktop with no public URL — same "Live mode" model as
// the other connectors). Uses imapflow (IMAP client) + mailparser (MIME
// decoding — real-world email is multipart/HTML/encoded, not worth hand-
// rolling) + nodemailer (SMTP send).
//
// Credentials are a JSON blob: host/port/user/pass for both IMAP and SMTP.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage } from "./session.ts";

export interface EmailCreds {
  imapHost: string; imapPort?: number;
  smtpHost: string; smtpPort?: number;
  user: string; pass: string;
}

/** Parse the stored credential blob; throws a clear error if it's malformed. */
export function parseEmailCreds(raw: string): EmailCreds {
  const parsed = JSON.parse(raw) as Partial<EmailCreds>;
  if (!parsed.imapHost || !parsed.smtpHost || !parsed.user || !parsed.pass) {
    throw new Error("Email credentials missing imapHost/smtpHost/user/pass");
  }
  return { imapHost: parsed.imapHost, imapPort: parsed.imapPort, smtpHost: parsed.smtpHost, smtpPort: parsed.smtpPort, user: parsed.user, pass: parsed.pass };
}

const POLL_MS = 20_000;

export function startEmail(token: string, config: ConnectorConfig, log: (msg: string) => void): () => void {
  let running = true;
  let creds: EmailCreds;
  try {
    creds = parseEmailCreds(token);
  } catch (e) {
    log(e instanceof Error ? e.message : "invalid email credentials");
    return () => {};
  }

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort ?? 587,
    secure: (creds.smtpPort ?? 587) === 465,
    auth: { user: creds.user, pass: creds.pass },
  });

  async function pollOnce(): Promise<void> {
    const client = new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort ?? 993,
      secure: (creds.imapPort ?? 993) !== 143,
      auth: { user: creds.user, pass: creds.pass },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) return;
        for (const uid of uids) {
          if (!running) break;
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          const senderAddress = from?.address;
          if (!senderAddress) continue;
          const senderName = from?.name || senderAddress;
          const text = (parsed.text ?? "").trim();
          if (!text) continue;
          const subject = (parsed.subject ?? "").trim();
          log(`message from ${senderAddress}`);

          // Mark seen first so a crash mid-reply doesn't reprocess it forever.
          await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true }).catch(() => {});

          let reply: string;
          try {
            reply = await handleConnectorMessage("email", senderAddress, senderName, text, config);
          } catch {
            reply = "Sorry, I hit an error handling that.";
          }
          const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject || "your message"}`;
          await transporter.sendMail({ from: creds.user, to: senderAddress, subject: replySubject, text: reply }).catch(() => {});
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }

  (async () => {
    try {
      await transporter.verify();
      log(`connected as ${creds.user} — polling every ${POLL_MS / 1000}s`);
    } catch (e) {
      log(`SMTP verify failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    while (running) {
      try {
        await pollOnce();
      } catch (e) {
        log(`poll error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    log("stopped");
  })();

  return () => { running = false; };
}
