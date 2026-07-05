// Connector sessions — persist each platform chat as a conversation so it shows
// up in the app's left panel (grouped by source) and the bot stays contextual.
//
// One conversation per chat, keyed deterministically: `tg-<chatId>` / `dc-<channelId>`.

import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../providers/types.ts";
import { getConversation, createConversation, addMessage, getMessages } from "../memory/episodic.ts";
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

/**
 * Handle one incoming message: persist it, run the agent over recent history,
 * persist the reply, and notify the UI to refresh. Returns the reply text.
 */
export async function handleConnectorMessage(
  platform: string,
  chatKey: string,
  title: string,
  userText: string,
  config: ConnectorConfig,
): Promise<string> {
  const convId = `${PREFIX[platform] ?? platform}-${chatKey}`;
  if (!getConversation(convId)) {
    createConversation(convId, (title || `${platform} chat`).slice(0, 60), config.id, config.model, platform);
  }

  addMessage(randomUUID(), convId, "user", userText);
  notify("conversation.updated", { id: convId, source: platform });

  const history: ChatMessage[] = getMessages(convId)
    .slice(-HISTORY_LIMIT)
    .map((r) => ({ role: r.role, content: r.content }));

  const reply = await runConnectorAgent(config, history, platform);

  addMessage(randomUUID(), convId, "assistant", reply);
  notify("conversation.updated", { id: convId, source: platform });
  return reply;
}
