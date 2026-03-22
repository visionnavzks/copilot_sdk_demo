import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import { getRegistry } from "./agents/registry.js";
import type { AgentRole, Sprint, Task } from "./types.js";
import { AGENT_CONFIGS } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// -------------------------------------------------------------------
// Rate limiting
// -------------------------------------------------------------------
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please wait a moment." },
});

app.use(cors());
app.use(express.json());
app.use(generalLimiter);
app.use(express.static(path.join(__dirname, "../public")));

// -------------------------------------------------------------------
// In-memory state (suitable for demo; swap with a DB for production)
// -------------------------------------------------------------------
const sprints: Map<string, Sprint> = new Map();
let sprintCounter = 0;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// -------------------------------------------------------------------
// Health check
// -------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------------
// Agents endpoint – return agent metadata for the UI
// -------------------------------------------------------------------
app.get("/api/agents", (_req, res) => {
  const agents = Object.values(AGENT_CONFIGS).map(({ role, name, nameZh, description, descriptionZh, icon }) => ({
    role,
    name,
    nameZh,
    description,
    descriptionZh,
    icon,
  }));
  res.json(agents);
});

// -------------------------------------------------------------------
// Chat endpoint – Server-Sent Events streaming response
// -------------------------------------------------------------------
app.post("/api/chat", chatLimiter, async (req, res) => {
  const { message, agentRole, sprintContext } = req.body as {
    message: string;
    agentRole: AgentRole;
    sprintContext?: Sprint;
  };

  if (!message || !agentRole) {
    res.status(400).json({ error: "message and agentRole are required" });
    return;
  }

  if (!AGENT_CONFIGS[agentRole]) {
    res.status(400).json({ error: `Unknown agentRole: ${agentRole}` });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const registry = getRegistry();

  try {
    await registry.start();

    const agent = registry.getAgent(agentRole);
    const contextStr = sprintContext
      ? `Current sprint: ${sprintContext.name} - Goal: ${sprintContext.goal}. Tasks: ${sprintContext.tasks.map((t) => t.title).join(", ")}`
      : undefined;

    await agent.chat(
      message,
      (chunk) => {
        sendEvent("chunk", { content: chunk });
      },
      () => {
        sendEvent("done", { agentRole, timestamp: new Date().toISOString() });
        res.end();
      },
      (err) => {
        sendEvent("error", { message: err.message });
        res.end();
      },
      contextStr,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendEvent("error", { message });
    res.end();
  }
});

// -------------------------------------------------------------------
// Sprint CRUD endpoints
// -------------------------------------------------------------------
app.get("/api/sprints", (_req, res) => {
  res.json(Array.from(sprints.values()));
});

app.post("/api/sprints", (req, res) => {
  const { name, goal, durationWeeks } = req.body as {
    name: string;
    goal: string;
    durationWeeks: number;
  };

  if (!name || !goal) {
    res.status(400).json({ error: "name and goal are required" });
    return;
  }

  const sprint: Sprint = {
    id: generateId(),
    name: name || `Sprint ${++sprintCounter}`,
    goal,
    durationWeeks: durationWeeks ?? 2,
    tasks: [],
    status: "planning",
    createdAt: new Date().toISOString(),
  };

  sprints.set(sprint.id, sprint);
  res.status(201).json(sprint);
});

app.get("/api/sprints/:id", (req, res) => {
  const sprint = sprints.get(req.params.id);
  if (!sprint) {
    res.status(404).json({ error: "Sprint not found" });
    return;
  }
  res.json(sprint);
});

app.patch("/api/sprints/:id", (req, res) => {
  const sprint = sprints.get(req.params.id);
  if (!sprint) {
    res.status(404).json({ error: "Sprint not found" });
    return;
  }

  const allowed = ["name", "goal", "durationWeeks", "status"] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      (sprint as unknown as Record<string, unknown>)[key] = req.body[key];
    }
  }

  if (req.body.status === "done") {
    sprint.completedAt = new Date().toISOString();
  }

  res.json(sprint);
});

// -------------------------------------------------------------------
// Task CRUD endpoints (nested under sprints)
// -------------------------------------------------------------------
app.post("/api/sprints/:id/tasks", (req, res) => {
  const sprint = sprints.get(req.params.id);
  if (!sprint) {
    res.status(404).json({ error: "Sprint not found" });
    return;
  }

  const { title, description, priority } = req.body as {
    title: string;
    description: string;
    priority: Task["priority"];
  };

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const task: Task = {
    id: generateId(),
    title,
    description: description ?? "",
    priority: priority ?? "medium",
    status: "todo",
  };

  sprint.tasks.push(task);
  res.status(201).json(task);
});

app.patch("/api/sprints/:id/tasks/:taskId", (req, res) => {
  const sprint = sprints.get(req.params.id);
  if (!sprint) {
    res.status(404).json({ error: "Sprint not found" });
    return;
  }

  const task = sprint.tasks.find((t) => t.id === req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const allowed = ["title", "description", "priority", "status", "assignedAgent"] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      (task as unknown as Record<string, unknown>)[key] = req.body[key];
    }
  }

  res.json(task);
});

app.delete("/api/sprints/:id/tasks/:taskId", (req, res) => {
  const sprint = sprints.get(req.params.id);
  if (!sprint) {
    res.status(404).json({ error: "Sprint not found" });
    return;
  }

  const idx = sprint.tasks.findIndex((t) => t.id === req.params.taskId);
  if (idx === -1) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  sprint.tasks.splice(idx, 1);
  res.status(204).end();
});

// -------------------------------------------------------------------
// Clear agent conversation history
// -------------------------------------------------------------------
app.delete("/api/agents/:role/history", (req, res) => {
  const role = req.params.role as AgentRole;
  if (!AGENT_CONFIGS[role]) {
    res.status(400).json({ error: "Unknown agent role" });
    return;
  }

  try {
    const registry = getRegistry();
    registry.clearAgentHistory(role);
    res.json({ success: true });
  } catch {
    // Registry not started yet – nothing to clear
    res.json({ success: true });
  }
});

// -------------------------------------------------------------------
// Serve SPA fallback
// -------------------------------------------------------------------
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// -------------------------------------------------------------------
// Start server
// -------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Iterative Process Agent System running at http://localhost:${PORT}\n`);
  console.log("Agents available:");
  for (const cfg of Object.values(AGENT_CONFIGS)) {
    console.log(`  ${cfg.icon} ${cfg.name} (${cfg.nameZh})`);
  }
  console.log();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  const registry = getRegistry();
  await registry.stop();
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  const registry = getRegistry();
  await registry.stop();
  server.close(() => process.exit(0));
});

export default app;
