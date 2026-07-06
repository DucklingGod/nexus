// Connector sessions — persist each platform chat as a conversation so it shows
// up in the app's left panel (grouped by source) and the bot stays contextual.
//
// One conversation per chat, keyed deterministically: `tg-<chatId>` / `dc-<channelId>`.

import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../providers/types.ts";
import { getConversation, createConversation, addMessage, getMessages, deleteConversation } from "../memory/episodic.ts";
import { notify } from "../ipc/notify.ts";
import { runConnectorAgent, type ConnectorConfig } from "./agent.ts";

const HISTORY_LIMIT = 20;

// Short conversation-id prefix per platform (keeps ids compact + collision-free
// across sources). Add an entry here when wiring up a new connector.
const PREFIX: Record<string, string> = {
  telegram: "tg",
  discord: "dc",
  slack: "sk",
  email: "em",
  matrix: "mx",
};

/** Result from handleConnectorMessage — includes text reply + any file attachments. */
export interface ConnectorResult {
  text: string;
  attachments: string[];
}

/**
 * Handle one incoming message: persist it, run the agent over recent history,
 * persist the reply, and notify the UI to refresh. Returns the reply text + attachments.
 */
export async function handleConnectorMessage(
  platform: string,
  chatKey: string,
  title: string,
  userText: string,
  config: ConnectorConfig,
  images?: { data: string; mediaType: string }[],
): Promise<ConnectorResult> {
  const convId = `${PREFIX[platform] ?? platform}-${chatKey}`;
  if (!getConversation(convId)) {
    createConversation(convId, (title || `${platform} chat`).slice(0, 60), config.id, config.model, platform);
  }

  // Build user message with optional images
  const userMsg: ChatMessage = { role: "user", content: userText };
  if (images && images.length > 0) {
    userMsg.images = images;
  }

  addMessage(randomUUID(), convId, "user", userText);
  notify("conversation.updated", { id: convId, source: platform });

  const history: ChatMessage[] = getMessages(convId)
    .slice(-HISTORY_LIMIT)
    .map((r) => ({ role: r.role, content: r.content }));

  // Replace the last message with image data if available
  if (images && images.length > 0 && history.length > 0) {
    history[history.length - 1] = userMsg;
  }

  const result = await runConnectorAgent(config, history, platform);

  addMessage(randomUUID(), convId, "assistant", result.text);
  notify("conversation.updated", { id: convId, source: platform });

  // Auto-extract memory after substantial conversations
  try {
    const { autoExtract, isAutoExtractEnabled } = await import("../context/autoExtract.ts");
    if (isAutoExtractEnabled()) {
      const fullHistory = getMessages(convId).map(r => ({ role: r.role, content: r.content }));
      if (fullHistory.length >= 4) {
        void autoExtract(config, fullHistory, config.model).catch(() => {});
      }
    }
  } catch { /* ignore — autoExtract is optional */ }

  return result;
}

/**
 * Clear a conversation's history (for /clear command).
 * Deletes the conversation so a fresh one starts on next message.
 */
export function clearConversation(chatKey: string): void {
  try {
    deleteConversation(chatKey);
  } catch { /* ignore */ }
}
