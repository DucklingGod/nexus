import { useState } from "react";
import { useSettings } from "../SettingsContext";

export default function ConnectorsTab() {
  const {
    connectors,
    tgToken, setTgToken, hasTg,
    dcToken, setDcToken, hasDc,
    slackAppToken, setSlackAppToken, slackBotToken, setSlackBotToken, hasSlack,
    matrixHomeserver, setMatrixHomeserver, matrixToken, setMatrixToken, hasMatrix,
    emailImapHost, setEmailImapHost, emailSmtpHost, setEmailSmtpHost,
    emailUser, setEmailUser, emailPass, setEmailPass, hasEmail,
    saveConnectorToken, deleteConnectorToken, connectPlatform, disconnectPlatform,
    gatewayRunning, gatewayPid, gatewayLoading, startGateway, stopGateway,
    showMsg,
  } = useSettings();
  const [gatewayPlatform, setGatewayPlatform] = useState("telegram");

  async function saveSlack() {
    if (!slackAppToken.trim() || !slackBotToken.trim()) { showMsg("Both tokens are required"); return; }
    await saveConnectorToken("slack", JSON.stringify({ appToken: slackAppToken.trim(), botToken: slackBotToken.trim() }));
  }

  async function saveMatrix() {
    if (!matrixHomeserver.trim() || !matrixToken.trim()) { showMsg("Homeserver URL and token are required"); return; }
    await saveConnectorToken("matrix", JSON.stringify({ homeserverUrl: matrixHomeserver.trim(), accessToken: matrixToken.trim() }));
  }

  async function saveEmail() {
    if (!emailImapHost.trim() || !emailSmtpHost.trim() || !emailUser.trim() || !emailPass.trim()) { showMsg("All email fields are required"); return; }
    await saveConnectorToken("email", JSON.stringify({ imapHost: emailImapHost.trim(), smtpHost: emailSmtpHost.trim(), user: emailUser.trim(), pass: emailPass.trim() }));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-nexus-muted">Let your agent reply on chat platforms while Nexus is running (Live mode — no server needed). Bot tokens are stored in your OS keychain; remote messages use safe tools only (no terminal/code/file-write).</p>
      {([
        { id: "telegram", label: "Telegram", token: tgToken, setToken: setTgToken, has: hasTg, ph: "123456789:ABCdef...", hint: "Create a bot with @BotFather in Telegram → copy the token → Save → Connect, then message your bot." },
        { id: "discord", label: "Discord", token: dcToken, setToken: setDcToken, has: hasDc, ph: "Bot token", hint: "Discord Developer Portal → your app → Bot → Reset/Copy Token. Enable the MESSAGE CONTENT intent, invite the bot to a server, then @mention it or DM it." },
      ] as const).map(c => {
        const status = connectors.find(s => s.platform === c.id);
        const running = status?.running;
        return (
          <div key={c.id} className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-nexus-fg">{c.label}</span>
              <span className={`flex items-center gap-1.5 text-[11px] ${running ? "text-green-400" : "text-nexus-muted"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-400" : "bg-nexus-muted/50"}`} />
                {status?.status ?? "not connected"}
              </span>
            </div>
            <div className="flex gap-2">
              <input type="password" value={c.token} onChange={e => c.setToken(e.target.value)}
                placeholder={c.has ? "✓ token saved — enter to replace" : c.ph}
                className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <button onClick={() => saveConnectorToken(c.id, c.token)} disabled={!c.token.trim()}
                className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Save</button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {running ? (
                <button onClick={() => disconnectPlatform(c.id)} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface">Disconnect</button>
              ) : (
                <button onClick={() => connectPlatform(c.id)} disabled={!c.has}
                  className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Connect</button>
              )}
              {c.has && <button onClick={() => deleteConnectorToken(c.id)} className="text-xs text-nexus-muted/60 hover:text-red-400">Remove token</button>}
            </div>
            <p className="mt-2 text-[11px] text-nexus-muted">{c.hint}</p>
          </div>
        );
      })}

      {/* Slack */}
      {(() => {
        const status = connectors.find(s => s.platform === "slack");
        const running = status?.running;
        return (
          <div className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-nexus-fg">Slack</span>
              <span className={`flex items-center gap-1.5 text-[11px] ${running ? "text-green-400" : "text-nexus-muted"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-400" : "bg-nexus-muted/50"}`} />
                {status?.status ?? "not connected"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <input type="password" value={slackAppToken} onChange={e => setSlackAppToken(e.target.value)}
                placeholder={hasSlack ? "✓ saved — enter to replace app-level token" : "App-level token (xapp-…)"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <div className="flex gap-2">
                <input type="password" value={slackBotToken} onChange={e => setSlackBotToken(e.target.value)}
                  placeholder={hasSlack ? "✓ saved — enter to replace bot token" : "Bot token (xoxb-…)"}
                  className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={saveSlack} disabled={!slackAppToken.trim() || !slackBotToken.trim()}
                  className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Save</button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {running ? (
                <button onClick={() => disconnectPlatform("slack")} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface">Disconnect</button>
              ) : (
                <button onClick={() => connectPlatform("slack")} disabled={!hasSlack}
                  className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Connect</button>
              )}
              {hasSlack && <button onClick={() => deleteConnectorToken("slack")} className="text-xs text-nexus-muted/60 hover:text-red-400">Remove</button>}
            </div>
            <p className="mt-2 text-[11px] text-nexus-muted">Create a Slack app with Socket Mode enabled (api.slack.com/apps) → generate an app-level token with the <code className="text-nexus-gold-light">connections:write</code> scope → install the app to get a bot token (<code className="text-nexus-gold-light">chat:write</code>, <code className="text-nexus-gold-light">reactions:write</code>, <code className="text-nexus-gold-light">im:history</code>, <code className="text-nexus-gold-light">app_mentions:read</code>).</p>
          </div>
        );
      })()}

      {/* Matrix */}
      {(() => {
        const status = connectors.find(s => s.platform === "matrix");
        const running = status?.running;
        return (
          <div className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-nexus-fg">Matrix</span>
              <span className={`flex items-center gap-1.5 text-[11px] ${running ? "text-green-400" : "text-nexus-muted"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-400" : "bg-nexus-muted/50"}`} />
                {status?.status ?? "not connected"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <input value={matrixHomeserver} onChange={e => setMatrixHomeserver(e.target.value)}
                placeholder={hasMatrix ? "✓ saved — enter to replace homeserver URL" : "Homeserver URL (https://matrix.org)"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <div className="flex gap-2">
                <input type="password" value={matrixToken} onChange={e => setMatrixToken(e.target.value)}
                  placeholder={hasMatrix ? "✓ saved — enter to replace access token" : "Access token"}
                  className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={saveMatrix} disabled={!matrixHomeserver.trim() || !matrixToken.trim()}
                  className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Save</button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {running ? (
                <button onClick={() => disconnectPlatform("matrix")} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface">Disconnect</button>
              ) : (
                <button onClick={() => connectPlatform("matrix")} disabled={!hasMatrix}
                  className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Connect</button>
              )}
              {hasMatrix && <button onClick={() => deleteConnectorToken("matrix")} className="text-xs text-nexus-muted/60 hover:text-red-400">Remove</button>}
            </div>
            <p className="mt-2 text-[11px] text-nexus-muted">Create a dedicated bot account on your homeserver, then get its access token (via /login or your homeserver's admin tools). The bot auto-joins rooms it's invited to.</p>
          </div>
        );
      })()}

      {/* Email */}
      {(() => {
        const status = connectors.find(s => s.platform === "email");
        const running = status?.running;
        return (
          <div className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-nexus-fg">Email</span>
              <span className={`flex items-center gap-1.5 text-[11px] ${running ? "text-green-400" : "text-nexus-muted"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-400" : "bg-nexus-muted/50"}`} />
                {status?.status ?? "not connected"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={emailImapHost} onChange={e => setEmailImapHost(e.target.value)}
                placeholder={hasEmail ? "✓ saved — IMAP host" : "IMAP host (imap.gmail.com)"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <input value={emailSmtpHost} onChange={e => setEmailSmtpHost(e.target.value)}
                placeholder={hasEmail ? "✓ saved — SMTP host" : "SMTP host (smtp.gmail.com)"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <input value={emailUser} onChange={e => setEmailUser(e.target.value)}
                placeholder={hasEmail ? "✓ saved — address" : "Email address"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <input type="password" value={emailPass} onChange={e => setEmailPass(e.target.value)}
                placeholder={hasEmail ? "✓ saved — app password" : "App password"}
                className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button onClick={saveEmail} disabled={!emailImapHost.trim() || !emailSmtpHost.trim() || !emailUser.trim() || !emailPass.trim()}
                className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Save</button>
              {running ? (
                <button onClick={() => disconnectPlatform("email")} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface">Disconnect</button>
              ) : (
                <button onClick={() => connectPlatform("email")} disabled={!hasEmail}
                  className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Connect</button>
              )}
              {hasEmail && <button onClick={() => deleteConnectorToken("email")} className="text-xs text-nexus-muted/60 hover:text-red-400">Remove</button>}
            </div>
            <p className="mt-2 text-[11px] text-nexus-muted">Uses an app password, not your real password (Gmail/Outlook: generate one in your account's security settings). Polls the inbox every ~20s and replies from the same address.</p>
          </div>
        );
      })()}

      {/* Gateway — background process that survives app close */}
      <div className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-nexus-fg">Gateway Mode</span>
            <span className="rounded bg-nexus-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-nexus-accent">Background</span>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] ${gatewayRunning ? "text-green-400" : "text-nexus-muted"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${gatewayRunning ? "bg-green-400" : "bg-nexus-muted/50"}`} />
            {gatewayRunning ? `running (PID ${gatewayPid})` : "stopped"}
          </span>
        </div>
        <p className="mb-3 text-xs text-nexus-muted">
          Runs a connector as a background process that survives app close. Pick a platform, then start the gateway.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={gatewayPlatform}
            onChange={e => setGatewayPlatform(e.target.value)}
            disabled={gatewayRunning || gatewayLoading}
            className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg outline-none focus:border-nexus-accent disabled:opacity-50"
          >
            <option value="telegram">Telegram</option>
            <option value="discord">Discord</option>
            <option value="slack">Slack</option>
          </select>
          {gatewayRunning ? (
            <button
              onClick={stopGateway}
              disabled={gatewayLoading}
              className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface disabled:opacity-50"
            >
              {gatewayLoading ? "Stopping…" : "Stop Gateway"}
            </button>
          ) : (
            <button
              onClick={() => startGateway(gatewayPlatform)}
              disabled={gatewayLoading}
              className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
            >
              {gatewayLoading ? "Starting…" : "Start Gateway"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-nexus-muted">
          The gateway is a standalone process that keeps running even after you close Nexus. Stop it manually here, or kill the process (PID shown above).
        </p>
      </div>
    </div>
  );
}
