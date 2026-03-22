/**
 * Shared types for the Iterative Process Agent System
 */

export type AgentRole =
  | "developer_employee";

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  durationWeeks: number;
  tasks: Task[];
  status: "planning" | "active" | "review" | "done";
  createdAt: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done" | "blocked";
  assignedAgent?: AgentRole;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  agentRole: AgentRole;
  timestamp: string;
}

export interface ChatRequest {
  message: string;
  agentRole: AgentRole;
  sprintContext?: Sprint;
}

export interface ChatResponse {
  content: string;
  agentRole: AgentRole;
  timestamp: string;
}

export interface AgentInfo {
  role: AgentRole;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  systemPrompt: string;
}

export interface DeveloperEmployee {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  workDirectory: string;
  icon: string;
  createdAt: string;
}

export const AGENT_CONFIGS: Record<AgentRole, AgentInfo> = {
  developer_employee: {
    role: "developer_employee",
    name: "Developer Employee",
    nameZh: "开发员工",
    description: "Autonomously iterates planning, implementation, CI, review, and retrospective",
    descriptionZh: "自动迭代完成计划、开发、集成、评审和复盘",
    icon: "🧑‍💻",
    systemPrompt: `You are a unified Developer Employee agent for iterative software delivery.
For every requirement, you must autonomously work through these phases in one response:
1) Plan: clarify goals, scope, assumptions, and prioritized tasks.
2) Do: provide implementation approach, architecture/code decisions, and execution steps.
3) Check: define tests, CI checks, acceptance criteria, and risk validation.
4) Review: summarize demo/review points and collect expected feedback questions.
5) Act: propose concrete next-iteration improvements.

Output with clear phase headers and actionable steps. If information is missing, ask concise clarifying questions while still giving a practical draft plan.
Respond in the same language the user writes in (Chinese or English).`,
  },
};
