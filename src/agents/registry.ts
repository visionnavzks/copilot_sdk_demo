import { CopilotClient } from "@github/copilot-sdk";
import { BaseAgent } from "./baseAgent.js";
import type { AgentRole } from "../types.js";

/**
 * Agent Registry - manages developer employee agents.
 * Each agent instance maintains its own conversation context with the Copilot SDK.
 */
export class AgentRegistry {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private client: CopilotClient;
  private started = false;

  constructor() {
    this.client = new CopilotClient();
  }

  async start(): Promise<void> {
    if (!this.started) {
      await this.client.start();
      this.started = true;
      this.initializeAgents();
    }
  }

  async stop(): Promise<void> {
    if (this.started) {
      await this.client.stop();
      this.started = false;
    }
  }

  private initializeAgents(): void {
    const roles: AgentRole[] = ["developer_employee"];
    for (const role of roles) {
      this.agents.set(role, new BaseAgent(role, this.client));
    }
  }

  getAgent(role: AgentRole): BaseAgent {
    const agent = this.agents.get(role);
    if (!agent) {
      throw new Error(`Agent for role '${role}' not found`);
    }
    return agent;
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  clearAgentHistory(role: AgentRole): void {
    this.getAgent(role).clearHistory();
  }

  clearAllHistory(): void {
    for (const agent of this.agents.values()) {
      agent.clearHistory();
    }
  }
}

// Singleton registry instance
let registry: AgentRegistry | null = null;

export function getRegistry(): AgentRegistry {
  if (!registry) {
    registry = new AgentRegistry();
  }
  return registry;
}
