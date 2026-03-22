# 迭代流程代理系统 (Iterative Process Agent System)

A multi-agent web application powered by the [GitHub Copilot SDK](https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md) that guides software teams through Agile/Scrum iterative development cycles.

![Screenshot](https://github.com/user-attachments/assets/c1e513c7-b747-421a-8ce5-00700c80f942)

## Overview

This app implements the **PDCA (Plan-Do-Check-Act)** iterative development cycle using a multi-agent architecture. Each specialized agent handles a specific phase of the sprint:

| Agent | Phase | Role |
|-------|-------|------|
| 📋 **Sprint Planning Agent** (迭代计划代理) | Plan | Break down tasks, set priorities, define sprint goals |
| 💻 **Implementation Agent** (执行开发代理) | Do | Architecture, code quality, TDD guidance |
| 🔄 **CI & Daily Standup Agent** (持续集成与站会代理) | Do/Check | Facilitate standups, CI/CD pipeline, blockers |
| 🎯 **Review & Demo Agent** (评审演示代理) | Check | Sprint demos, stakeholder feedback |
| 🔍 **Retrospective Agent** (回顾复盘代理) | Act | Process improvement, team retrospectives |
| 🎭 **Orchestrator Agent** (总协调代理) | All | Coordinates the full iterative cycle |

## Features

- **Multi-agent chat** — each agent maintains its own conversation context using the Copilot SDK's `customAgents` API
- **Streaming responses** — real-time SSE streaming from the Copilot API
- **Sprint kanban board** — create sprints and manage tasks across Todo / In Progress / Done / Blocked columns
- **PDCA progress wheel** — visual indicator of the current iteration phase
- **Quick prompts** — contextual suggestions per agent
- **Bilingual** — UI in Chinese with English agent names; agents respond in the user's language

## Prerequisites

- **Node.js** 18+
- **GitHub Copilot CLI** installed and authenticated:
  ```bash
  # Install
  gh extension install github/gh-copilot

  # Authenticate
  gh auth login
  gh copilot --version
  ```

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm start
# or with hot-reload:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (TypeScript via tsx) |
| `npm run dev` | Start with `--watch` for hot-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run compiled JS from `dist/` |
| `npm run typecheck` | Type-check without emitting |

## Project Structure

```
copilot_sdk_demo/
├── src/
│   ├── server.ts           # Express server with REST & SSE endpoints
│   ├── types.ts            # Shared types & agent configuration
│   └── agents/
│       ├── baseAgent.ts    # Base agent (wraps Copilot SDK session)
│       └── registry.ts     # Agent registry & CopilotClient singleton
├── public/
│   ├── index.html          # Single-page app shell
│   ├── styles.css          # Dark theme styles
│   └── app.js              # Frontend logic (vanilla JS)
├── package.json
└── tsconfig.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/agents` | List all agents |
| `POST` | `/api/chat` | Chat (SSE streaming) |
| `GET` | `/api/sprints` | List sprints |
| `POST` | `/api/sprints` | Create sprint |
| `PATCH` | `/api/sprints/:id` | Update sprint status |
| `POST` | `/api/sprints/:id/tasks` | Add task |
| `PATCH` | `/api/sprints/:id/tasks/:taskId` | Update task |
| `DELETE` | `/api/sprints/:id/tasks/:taskId` | Delete task |
| `DELETE` | `/api/agents/:role/history` | Clear agent conversation history |

## Iterative Process (PDCA)

```
P (Plan)  →  Sprint Planning Agent
            "帮我规划第一个迭代周期"

D (Do)    →  Implementation Agent + CI Agent
            "这个功能应该用哪种架构模式？"
            "帮我主持今天的站会"

C (Check) →  Review & Demo Agent
            "帮我准备 Demo 演示脚本"

A (Act)   →  Retrospective Agent
            "帮我主持一个回顾会议"
```

> **Tip**: Start with the Orchestrator Agent and describe your project. It will guide you through planning your first sprint!
