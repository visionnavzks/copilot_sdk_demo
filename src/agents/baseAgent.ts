import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import type { AgentRole, AgentInfo } from "../types.js";
import { AGENT_CONFIGS } from "../types.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Base agent class that wraps the Copilot SDK session using CustomAgentConfig.
 * Each agent specializes in one phase of the iterative development process.
 */
export class BaseAgent {
  protected agentInfo: AgentInfo;
  protected client: CopilotClient;
  protected conversationHistory: ConversationMessage[] = [];

  constructor(role: AgentRole, client: CopilotClient) {
    this.agentInfo = AGENT_CONFIGS[role];
    this.client = client;
  }

  get role(): AgentRole {
    return this.agentInfo.role;
  }

  get info(): AgentInfo {
    return this.agentInfo;
  }

  /**
   * Send a message to this agent and stream the response via callbacks.
   * Each call creates a new session with the agent's custom system prompt.
   */
  async chat(
    userMessage: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    additionalContext?: string,
  ): Promise<void> {
    let session: CopilotSession | null = null;
    try {
      // Use the SDK's built-in customAgents support to configure the agent's role
      session = await this.client.createSession({
        model: "gpt-4.1",
        streaming: true,
        onPermissionRequest: approveAll,
        customAgents: [
          {
            name: this.agentInfo.role,
            displayName: this.agentInfo.name,
            description: this.agentInfo.description,
            prompt: this.agentInfo.systemPrompt,
          },
        ],
        agent: this.agentInfo.role,
      });

      let fullResponse = "";

      session.on("assistant.message_delta", (event) => {
        const chunk = event.data.deltaContent ?? "";
        fullResponse += chunk;
        onChunk(chunk);
      });

      session.on("session.idle", () => {
        this.conversationHistory.push({ role: "user", content: userMessage });
        this.conversationHistory.push({
          role: "assistant",
          content: fullResponse,
        });
        onDone();
        session?.disconnect().catch(() => {});
      });

      const contextPrefix = additionalContext
        ? `[Context: ${additionalContext}]\n\n`
        : "";
      const historyPrefix = this.buildHistoryContext();
      const fullPrompt = `${contextPrefix}${historyPrefix}${userMessage}`;

      await session.sendAndWait({ prompt: fullPrompt });
    } catch (err) {
      session?.disconnect().catch(() => {});
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Send a message and return the complete response as a string (non-streaming).
   */
  async chatSync(
    userMessage: string,
    additionalContext?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = "";
      this.chat(
        userMessage,
        (chunk) => { fullResponse += chunk; },
        () => resolve(fullResponse),
        reject,
        additionalContext,
      );
    });
  }

  /**
   * Clear conversation history for this agent.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  private buildHistoryContext(): string {
    if (this.conversationHistory.length === 0) return "";
    const recent = this.conversationHistory.slice(-6);
    const parts = recent.map(
      (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
    );
    return `[Previous conversation:\n${parts.join("\n")}\n]\n\n`;
  }
}
