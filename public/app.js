/**
 * Iterative Process Agent System – Frontend Application
 * Multi-agent chat interface with Sprint kanban board
 */

// ============================================================
// State
// ============================================================
const state = {
  currentAgent: "developer_employee",
  currentEmployeeId: null,
  editingEmployeeId: null,
  agents: [],
  developerEmployees: [],
  currentSprintId: null,
  sprints: [],
  pendingTaskStatus: "todo",
};

// ============================================================
// Quick prompts per agent
// ============================================================
const QUICK_PROMPTS = {
  developer_employee: [
    "我有一个新需求，帮我自动完成计划→开发→检查→评审→复盘",
    "把“用户登录+注册”拆成本轮迭代任务并给出落地实现步骤",
    "根据当前迭代目标，给我完整测试与 CI 检查清单",
    "请按一个开发员工的方式推进下一轮改进计划",
  ],
};

// ============================================================
// API helpers
// ============================================================
const API = {
  async getAgents() {
    const r = await fetch("/api/agents");
    return r.json();
  },
  async getSprints() {
    const r = await fetch("/api/sprints");
    return r.json();
  },
  async createSprint(data) {
    const r = await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async updateSprint(id, data) {
    const r = await fetch(`/api/sprints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async createTask(sprintId, data) {
    const r = await fetch(`/api/sprints/${sprintId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async updateTask(sprintId, taskId, data) {
    const r = await fetch(`/api/sprints/${sprintId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async deleteTask(sprintId, taskId) {
    await fetch(`/api/sprints/${sprintId}/tasks/${taskId}`, { method: "DELETE" });
  },
  async clearHistory(agentRole) {
    await fetch(`/api/agents/${agentRole}/history`, { method: "DELETE" });
  },
  async getDeveloperEmployees() {
    const r = await fetch("/api/developer-employees");
    return r.json();
  },
  async createDeveloperEmployee(data) {
    const r = await fetch("/api/developer-employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async updateDeveloperEmployee(id, data) {
    const r = await fetch(`/api/developer-employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  /**
   * Send a message via SSE streaming.
   * @returns {Promise<void>} resolves when done
   */
  chatStream(message, agentRole, sprintContext, onChunk, onDone, onError) {
    return fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.currentEmployeeId ? { "x-developer-employee-id": state.currentEmployeeId } : {}),
      },
      body: JSON.stringify({ message, agentRole, sprintContext }),
    }).then((res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processBuffer() {
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete last line

        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6);
          } else if (line === "") {
            // dispatch
            if (eventType && dataStr) {
              try {
                const data = JSON.parse(dataStr);
                if (eventType === "chunk") onChunk(data.content);
                else if (eventType === "done") onDone(data);
                else if (eventType === "error") onError(new Error(data.message));
              } catch (e) {
                console.error("SSE parse error", e);
              }
            }
            eventType = "";
            dataStr = "";
          }
        }
      }

      function read() {
        return reader.read().then(({ done, value }) => {
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          processBuffer();
          return read();
        });
      }

      return read().catch(onError);
    }).catch(onError);
  },
};

// ============================================================
// Render helpers
// ============================================================
function renderAgentList() {
  const list = document.getElementById("agent-list");
  list.innerHTML = "";
  for (const agent of state.agents) {
    const li = document.createElement("li");
    li.className = `agent-item${agent.role === state.currentAgent && agent.employeeId === state.currentEmployeeId ? " active" : ""}`;
    li.dataset.role = agent.role;
    li.dataset.employeeId = agent.employeeId;
    li.innerHTML = `
      <span class="agent-icon">${agent.icon}</span>
      <div class="agent-info">
        <div class="agent-name">${agent.nameZh}</div>
        <div class="agent-name-zh">${agent.name}</div>
        <div class="agent-workdir">${escapeHtml(agent.workDirectory ?? "")}</div>
      </div>
      <button class="btn btn-ghost btn-sm edit-employee-btn" title="编辑开发员工">✏️</button>`;
    li.addEventListener("click", () => selectAgent(agent.role, agent.employeeId));
    li.querySelector(".edit-employee-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const employee = state.developerEmployees.find((d) => d.id === agent.employeeId);
      if (!employee) return;
      state.editingEmployeeId = employee.id;
      document.getElementById("employee-name-zh").value = employee.nameZh;
      document.getElementById("employee-name").value = employee.name;
      document.getElementById("employee-work-directory").value = employee.workDirectory;
      document.getElementById("employee-desc-zh").value = employee.descriptionZh;
      document.getElementById("employee-desc").value = employee.description;
      document.getElementById("employee-icon").value = employee.icon;
      document.getElementById("btn-create-employee").textContent = "保存开发员工";
      openModal("modal-employee");
    });
    list.appendChild(li);
  }
}

function renderSprintPanel() {
  const panel = document.getElementById("sprint-panel");
  const sprint = state.sprints.find((s) => s.id === state.currentSprintId);

  if (!sprint) {
    const latest = state.sprints[state.sprints.length - 1];
    if (latest) {
      state.currentSprintId = latest.id;
      renderSprintPanel();
      return;
    }
    panel.innerHTML = `<p class="empty-hint">暂无迭代周期<br><br>点击「新建迭代周期」开始</p>`;
    return;
  }

  const statusLabels = {
    planning: "计划中",
    active: "进行中",
    review: "评审中",
    done: "已完成",
  };

  panel.innerHTML = `
    <div class="sprint-card">
      <span class="sprint-status ${sprint.status}">${statusLabels[sprint.status] ?? sprint.status}</span>
      <div class="sprint-name">${escapeHtml(sprint.name)}</div>
      <div class="sprint-goal">${escapeHtml(sprint.goal)}</div>
      <div class="sprint-meta">
        <span>⏱️ ${sprint.durationWeeks}周</span>
        <span>📌 ${sprint.tasks.length}个任务</span>
        <span>✅ ${sprint.tasks.filter((t) => t.status === "done").length}已完成</span>
      </div>
      <div class="sprint-actions">
        ${sprint.status === "planning" ? `<button class="btn btn-primary btn-sm" onclick="advanceSprint('active')">▶ 开始</button>` : ""}
        ${sprint.status === "active" ? `<button class="btn btn-secondary btn-sm" onclick="advanceSprint('review')">📊 评审</button>` : ""}
        ${sprint.status === "review" ? `<button class="btn btn-secondary btn-sm" onclick="advanceSprint('done')">✅ 完成</button>` : ""}
      </div>
    </div>`;
}

function renderBoard() {
  const sprint = state.sprints.find((s) => s.id === state.currentSprintId);
  const info = document.getElementById("board-sprint-info");

  if (!sprint) {
    info.textContent = "请先创建一个迭代周期";
    for (const status of ["todo", "in_progress", "done", "blocked"]) {
      document.getElementById(`col-${status}`).innerHTML = "";
      document.getElementById(`count-${status}`).textContent = "0";
    }
    return;
  }

  info.textContent = `${sprint.name} · ${sprint.goal}`;

  for (const status of ["todo", "in_progress", "done", "blocked"]) {
    const tasks = sprint.tasks.filter((t) => t.status === status);
    document.getElementById(`count-${status}`).textContent = tasks.length;
    const col = document.getElementById(`col-${status}`);
    col.innerHTML = "";
    for (const task of tasks) {
      col.appendChild(createTaskCard(sprint, task));
    }
  }
}

function createTaskCard(sprint, task) {
  const div = document.createElement("div");
  div.className = "task-card";
  div.innerHTML = `
    <div class="task-title">${escapeHtml(task.title)}</div>
    ${task.description ? `<div class="task-desc">${escapeHtml(task.description.slice(0, 80))}${task.description.length > 80 ? "…" : ""}</div>` : ""}
    <div class="task-meta">
      <span class="priority-badge priority-${task.priority}">${{ high: "🔴高", medium: "🟡中", low: "🟢低" }[task.priority]}</span>
    </div>
    <div class="task-actions">
      ${task.status !== "todo" ? `<button class="btn btn-ghost btn-sm" data-action="move-left" title="向左移动">◀</button>` : ""}
      ${task.status !== "blocked" ? `<button class="btn btn-ghost btn-sm" data-action="move-right" title="向右/阻塞">▶</button>` : ""}
      <button class="btn btn-ghost btn-sm" data-action="delete" title="删除任务">🗑</button>
    </div>`;

  const statusOrder = ["todo", "in_progress", "done", "blocked"];
  div.querySelector('[data-action="move-left"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const idx = statusOrder.indexOf(task.status);
    if (idx > 0) {
      const newStatus = statusOrder[idx - 1];
      await API.updateTask(sprint.id, task.id, { status: newStatus });
      await reloadSprints();
    }
  });
  div.querySelector('[data-action="move-right"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const idx = statusOrder.indexOf(task.status);
    if (idx < statusOrder.length - 1) {
      const newStatus = statusOrder[idx + 1];
      await API.updateTask(sprint.id, task.id, { status: newStatus });
      await reloadSprints();
    }
  });
  div.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm(`删除任务「${task.title}」？`)) {
      await API.deleteTask(sprint.id, task.id);
      await reloadSprints();
    }
  });

  return div;
}

function renderQuickPrompts() {
  const container = document.getElementById("quick-prompts");
  container.innerHTML = "";
  const prompts = QUICK_PROMPTS[state.currentAgent] ?? [];
  for (const p of prompts) {
    const btn = document.createElement("button");
    btn.className = "quick-prompt";
    btn.textContent = p;
    btn.addEventListener("click", () => {
      document.getElementById("user-input").value = p;
      sendMessage();
    });
    container.appendChild(btn);
  }
}

function updatePdcaWheel(agentRole) {
  const phaseMap = {
    developer_employee: "plan",
  };
  const phase = phaseMap[agentRole];
  document.querySelectorAll(".pdca-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.phase === phase);
  });
}

// ============================================================
// Chat logic
// ============================================================
function selectAgent(role, employeeId = state.currentEmployeeId) {
  state.currentAgent = role;
  state.currentEmployeeId = employeeId ?? state.currentEmployeeId;
  const agent = state.agents.find((a) => a.role === role && a.employeeId === state.currentEmployeeId)
    ?? state.agents.find((a) => a.role === role);
  if (!agent) return;

  // Update sidebar selection
  document.querySelectorAll(".agent-item").forEach((el) => {
    el.classList.toggle(
      "active",
      el.dataset.role === role && el.dataset.employeeId === String(state.currentEmployeeId ?? ""),
    );
  });

  // Update chat header
  document.getElementById("chat-agent-icon").textContent = agent.icon;
  document.getElementById("chat-agent-name").textContent = `${agent.nameZh} (${agent.name})`;
  document.getElementById("chat-agent-desc").textContent = `${agent.descriptionZh} · 工作目录：${agent.workDirectory ?? "-"}`;

  // Update quick prompts
  renderQuickPrompts();

  // Update PDCA wheel
  updatePdcaWheel(role);

  // Switch to chat tab
  switchTab("chat");
}

function appendMessage(role, content, icon = "👤") {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = `message ${role}`;

  const avatarIcon =
    role === "user"
      ? "👤"
      : (state.agents.find((a) => a.role === state.currentAgent)?.icon ?? "🤖");

  div.innerHTML = `
    <div class="message-avatar">${avatarIcon}</div>
    <div class="message-content">${markdownToHtml(content)}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function appendTypingIndicator() {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = "typing-indicator";

  const icon = state.agents.find((a) => a.role === state.currentAgent)?.icon ?? "🤖";
  div.innerHTML = `
    <div class="message-avatar">${icon}</div>
    <div class="message-content">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function removeTypingIndicator() {
  document.getElementById("typing-indicator")?.remove();
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const message = input.value.trim();
  if (!message) return;

  const sendBtn = document.getElementById("btn-send");
  const sendLabel = document.getElementById("send-label");
  const sendSpinner = document.getElementById("send-spinner");

  input.value = "";
  sendBtn.disabled = true;
  sendLabel.classList.add("hidden");
  sendSpinner.classList.remove("hidden");

  appendMessage("user", message);
  const typingEl = appendTypingIndicator();

  const sprint = state.sprints.find((s) => s.id === state.currentSprintId);

  // Build streaming response
  let assistantDiv = null;
  let contentDiv = null;
  let fullContent = "";

  await API.chatStream(
    message,
    state.currentAgent,
    sprint ?? null,
    (chunk) => {
      if (!assistantDiv) {
        removeTypingIndicator();
        const icon = state.agents.find((a) => a.role === state.currentAgent)?.icon ?? "🤖";
        assistantDiv = document.createElement("div");
        assistantDiv.className = "message assistant";
        contentDiv = document.createElement("div");
        contentDiv.className = "message-content";
        assistantDiv.innerHTML = `<div class="message-avatar">${icon}</div>`;
        assistantDiv.appendChild(contentDiv);
        document.getElementById("messages").appendChild(assistantDiv);
      }
      fullContent += chunk;
      contentDiv.innerHTML = markdownToHtml(fullContent);
      document.getElementById("messages").scrollTop =
        document.getElementById("messages").scrollHeight;
    },
    () => {
      removeTypingIndicator();
      if (!assistantDiv) {
        appendMessage("assistant", fullContent || "(no response)");
      }
      sendBtn.disabled = false;
      sendLabel.classList.remove("hidden");
      sendSpinner.classList.add("hidden");
    },
    (err) => {
      removeTypingIndicator();
      console.error("Chat error:", err);
      appendMessage(
        "assistant",
        `⚠️ **错误**: ${err.message}\n\n请确认 GitHub Copilot CLI 已安装并完成身份验证。`,
      );
      sendBtn.disabled = false;
      sendLabel.classList.remove("hidden");
      sendSpinner.classList.add("hidden");
    },
  );
}

// ============================================================
// Sprint/Task actions
// ============================================================
async function reloadSprints() {
  state.sprints = await API.getSprints();
  renderSprintPanel();
  renderBoard();
}

async function advanceSprint(newStatus) {
  if (!state.currentSprintId) return;
  await API.updateSprint(state.currentSprintId, { status: newStatus });
  await reloadSprints();
}

// ============================================================
// Tab switching
// ============================================================
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tabId}`);
  });
  if (tabId === "board") renderBoard();
}

// ============================================================
// Modal helpers
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function resetEmployeeModal() {
  state.editingEmployeeId = null;
  document.getElementById("btn-create-employee").textContent = "创建开发员工";
  document.getElementById("employee-name-zh").value = "";
  document.getElementById("employee-name").value = "";
  document.getElementById("employee-work-directory").value = "";
  document.getElementById("employee-desc-zh").value = "";
  document.getElementById("employee-desc").value = "";
  document.getElementById("employee-icon").value = "🧑‍💻";
}

// ============================================================
// Simple markdown → HTML converter
// ============================================================
function markdownToHtml(text) {
  // Escape ALL HTML in the raw text first — this makes every subsequent
  // substitution safe: captured groups contain only already-escaped content.
  let html = escapeHtml(text);

  // Code blocks — `code` is already HTML-escaped from the line above
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code}</code></pre>`,
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Headers
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  // Unordered lists (grouped)
  html = html.replace(/(^- .+\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.slice(2)}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });
  // Numbered lists
  html = html.replace(/(^\d+\. .+\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });
  // Paragraphs (double newline)
  html = html.replace(/\n{2,}/g, "</p><p>");
  // Single newlines
  html = html.replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Initialization
// ============================================================
async function init() {
  // Load developer employees
  try {
    state.developerEmployees = await API.getDeveloperEmployees();
    if (state.developerEmployees.length > 0) {
      state.currentEmployeeId = state.developerEmployees[0].id;
    }
  } catch (e) {
    console.error("Failed to load developer employees:", e);
    state.developerEmployees = [];
  }

  // Load agents
  try {
    state.agents = await API.getAgents();
    if (!state.currentEmployeeId && state.agents.length > 0) {
      state.currentEmployeeId = state.agents[0].employeeId ?? null;
    }
  } catch (e) {
    console.error("Failed to load agents:", e);
    state.agents = [];
  }
  renderAgentList();
  selectAgent(state.currentAgent, state.currentEmployeeId);
  renderQuickPrompts();

  // Load sprints
  try {
    state.sprints = await API.getSprints();
  } catch (e) {
    console.error("Failed to load sprints:", e);
  }
  renderSprintPanel();

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Send button
  document.getElementById("btn-send").addEventListener("click", sendMessage);

  // Textarea Enter key
  document.getElementById("user-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Clear history
  document.getElementById("btn-clear-history").addEventListener("click", async () => {
    if (confirm("清除当前代理的对话历史？")) {
      await API.clearHistory(state.currentAgent);
      document.getElementById("messages").innerHTML = "";
      const agent = state.agents.find((a) => a.role === state.currentAgent);
      if (agent) {
        appendMessage(
          "assistant",
          `已清除对话历史。我是 **${agent.nameZh}**，有什么可以帮您？`,
        );
      }
    }
  });

  // New sprint button
  document.getElementById("btn-new-sprint").addEventListener("click", () =>
    openModal("modal-sprint"),
  );
  document.getElementById("btn-new-employee").addEventListener("click", () =>
    {
      resetEmployeeModal();
      openModal("modal-employee");
    },
  );

  // Modal close buttons
  document.querySelectorAll(".modal-close, [data-modal]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const modalId = e.currentTarget.dataset.modal;
      if (modalId) closeModal(modalId);
    });
  });

  // Create sprint
  document.getElementById("btn-create-sprint").addEventListener("click", async () => {
    const name = document.getElementById("sprint-name").value.trim();
    const goal = document.getElementById("sprint-goal").value.trim();
    const durationWeeks = parseInt(document.getElementById("sprint-duration").value, 10) || 2;

    if (!name || !goal) {
      alert("请填写迭代名称和目标");
      return;
    }

    const sprint = await API.createSprint({ name, goal, durationWeeks });
    state.currentSprintId = sprint.id;
    state.sprints.push(sprint);
    closeModal("modal-sprint");
    document.getElementById("sprint-name").value = "";
    document.getElementById("sprint-goal").value = "";
    renderSprintPanel();
    renderBoard();

    // Suggest first message
    selectAgent("developer_employee", state.currentEmployeeId);
    document.getElementById("user-input").value =
      `我刚创建了一个新迭代：「${sprint.name}」，目标是「${sprint.goal}」，请帮我规划具体的任务清单。`;
  });

  // Create developer employee
  document.getElementById("btn-create-employee").addEventListener("click", async () => {
    const nameZh = document.getElementById("employee-name-zh").value.trim();
    const name = document.getElementById("employee-name").value.trim();
    const workDirectory = document.getElementById("employee-work-directory").value.trim();
    const descriptionZh = document.getElementById("employee-desc-zh").value.trim();
    const description = document.getElementById("employee-desc").value.trim();
    const icon = document.getElementById("employee-icon").value.trim();

    if (!name || !nameZh || !workDirectory) {
      alert("请填写中文名、英文名和工作目录");
      return;
    }

    if (state.editingEmployeeId) {
      await API.updateDeveloperEmployee(state.editingEmployeeId, {
        name,
        nameZh,
        description: description || undefined,
        descriptionZh: descriptionZh || undefined,
        workDirectory,
        icon: icon || "🧑‍💻",
      });
    } else {
      await API.createDeveloperEmployee({
        name,
        nameZh,
        description: description || undefined,
        descriptionZh: descriptionZh || undefined,
        workDirectory,
        icon: icon || "🧑‍💻",
      });
    }

    state.developerEmployees = await API.getDeveloperEmployees();
    state.agents = await API.getAgents();
    if (state.editingEmployeeId) {
      state.currentEmployeeId = state.editingEmployeeId;
    } else {
      const latest = state.developerEmployees[state.developerEmployees.length - 1];
      state.currentEmployeeId = latest?.id ?? state.currentEmployeeId;
    }
    state.editingEmployeeId = null;
    document.getElementById("btn-create-employee").textContent = "创建开发员工";
    renderAgentList();
    selectAgent("developer_employee", state.currentEmployeeId);

    closeModal("modal-employee");
    resetEmployeeModal();
  });

  // Add task buttons
  document.querySelectorAll(".btn-add-task").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pendingTaskStatus = btn.dataset.status ?? "todo";
      openModal("modal-task");
    });
  });

  // Create task
  document.getElementById("btn-create-task").addEventListener("click", async () => {
    if (!state.currentSprintId) {
      alert("请先创建一个迭代周期");
      closeModal("modal-task");
      return;
    }
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-desc").value.trim();
    const priority = document.getElementById("task-priority").value;

    if (!title) {
      alert("请填写任务标题");
      return;
    }

    await API.createTask(state.currentSprintId, { title, description, priority });
    // Update task status if needed
    const sprint = state.sprints.find((s) => s.id === state.currentSprintId);
    if (sprint) {
      const task = sprint.tasks[sprint.tasks.length - 1];
      if (task && state.pendingTaskStatus !== "todo") {
        await API.updateTask(state.currentSprintId, task.id, {
          status: state.pendingTaskStatus,
        });
      }
    }

    closeModal("modal-task");
    document.getElementById("task-title").value = "";
    document.getElementById("task-desc").value = "";
    await reloadSprints();
  });

  // Close modal on backdrop click
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (modal.id === "modal-employee") resetEmployeeModal();
      }
    });
  });

  document.querySelectorAll('[data-modal="modal-employee"]').forEach((btn) => {
    btn.addEventListener("click", resetEmployeeModal);
  });
}

document.addEventListener("DOMContentLoaded", init);
