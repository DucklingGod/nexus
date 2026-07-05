import { describe, it, expect } from "vitest";
import { parseSlackCreds } from "./slack.ts";
import { parseMatrixCreds } from "./matrix.ts";
import { parseEmailCreds } from "./email.ts";

describe("parseSlackCreds", () => {
  it("parses a valid blob", () => {
    expect(parseSlackCreds(JSON.stringify({ appToken: "xapp-1", botToken: "xoxb-1" })))
      .toEqual({ appToken: "xapp-1", botToken: "xoxb-1" });
  });
  it("throws when a field is missing", () => {
    expect(() => parseSlackCreds(JSON.stringify({ appToken: "xapp-1" }))).toThrow(/appToken\/botToken/);
  });
  it("throws on invalid JSON", () => {
    expect(() => parseSlackCreds("not json")).toThrow();
  });
});

describe("parseMatrixCreds", () => {
  it("parses a valid blob and strips a trailing slash", () => {
    expect(parseMatrixCreds(JSON.stringify({ homeserverUrl: "https://matrix.org/", accessToken: "tok" })))
      .toEqual({ homeserverUrl: "https://matrix.org", accessToken: "tok" });
  });
  it("throws when a field is missing", () => {
    expect(() => parseMatrixCreds(JSON.stringify({ homeserverUrl: "https://matrix.org" }))).toThrow(/homeserverUrl\/accessToken/);
  });
});

describe("parseEmailCreds", () => {
  it("parses a valid blob", () => {
    const creds = parseEmailCreds(JSON.stringify({ imapHost: "imap.example.com", smtpHost: "smtp.example.com", user: "a@example.com", pass: "p" }));
    expect(creds).toEqual({ imapHost: "imap.example.com", imapPort: undefined, smtpHost: "smtp.example.com", smtpPort: undefined, user: "a@example.com", pass: "p" });
  });
  it("throws when a required field is missing", () => {
    expect(() => parseEmailCreds(JSON.stringify({ imapHost: "imap.example.com" }))).toThrow(/imapHost\/smtpHost\/user\/pass/);
  });
});
