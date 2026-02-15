// options.js
// Configure time limit and extreme mode settings.

const timeLimitInput = document.getElementById("timeLimit");
const softModeInput = document.getElementById("softMode");
const normalModeInput = document.getElementById("normalMode");
const extremeModeInput = document.getElementById("extremeMode");
const extremeDurationInput = document.getElementById("extremeDuration");
const showDebugCountdownInput = document.getElementById("showDebugCountdown");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const todoList = document.getElementById("todoList");
const todoInput = document.getElementById("todoInput");
const addTodoBtn = document.getElementById("addTodoBtn");
const extremeWarning = document.getElementById("extremeWarning");

const DEFAULT_SETTINGS = {
  enabled: true,
  timeLimitMinutes: 5,
  softModeEnabled: false,
  extremeModeEnabled: false,
  extremeDurationMinutes: 60,
  showDebugCountdown: false
};

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#dc2626" : "#059669";
  if (!message) return;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2500);
}

function loadOptions() {
  chrome.storage.sync.get(["settings", "todoList", "extremeModeEmergencyUsed"], data => {
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    timeLimitInput.value = settings.timeLimitMinutes;
    extremeDurationInput.value = settings.extremeDurationMinutes;
    showDebugCountdownInput.checked = settings.showDebugCountdown;
    
    // Set radio buttons based on mode
    if (settings.softModeEnabled) {
      softModeInput.checked = true;
    } else if (settings.extremeModeEnabled) {
      extremeModeInput.checked = true;
    } else {
      normalModeInput.checked = true;
    }
    
    // Load to-do list
    const todos = data.todoList || [];
    renderTodoList(todos);
    
    // Check if extreme mode lock-in is active
    const emergencyUsed = data.extremeModeEmergencyUsed || false;
    if (emergencyUsed && settings.extremeModeEnabled) {
      extremeModeInput.disabled = true;
      softModeInput.disabled = true;
      normalModeInput.disabled = true;
      extremeWarning.style.display = "block";
    } else {
      extremeModeInput.disabled = false;
      softModeInput.disabled = false;
      normalModeInput.disabled = false;
      extremeWarning.style.display = "none";
    }
  });
}

function saveOptions() {
  let timeLimit = parseInt(timeLimitInput.value, 10);
  let extremeDuration = parseInt(extremeDurationInput.value, 10);

  if (isNaN(timeLimit) || timeLimit < 1) {
    showStatus("Time limit must be at least 1 minute.", true);
    return;
  }
  if (isNaN(extremeDuration) || extremeDuration < 5) {
    showStatus("Extreme mode duration must be at least 5 minutes.", true);
    return;
  }

  chrome.storage.sync.get(["settings", "extremeModeEmergencyUsed"], data => {
    const existing = data.settings || {};
    const emergencyUsed = data.extremeModeEmergencyUsed || false;
    const wasExtremeEnabled = existing.extremeModeEnabled || false;
    
    // Determine which mode is selected
    const willBeSoftMode = softModeInput.checked;
    const willBeExtremeMode = extremeModeInput.checked;
    const willBeNormalMode = normalModeInput.checked;
    
    // Check if user is trying to disable extreme mode after emergency was used
    if (emergencyUsed && wasExtremeEnabled && !willBeExtremeMode) {
      showStatus("Extreme mode cannot be disabled after emergency use. Disable the extension instead.", true);
      extremeModeInput.checked = true; // Revert to extreme mode
      return;
    }
    
    // Track if extreme mode was disabled (emergency use)
    let newEmergencyUsed = emergencyUsed;
    if (wasExtremeEnabled && !willBeExtremeMode && !emergencyUsed) {
      newEmergencyUsed = true;
    }

    const newSettings = {
      timeLimitMinutes: timeLimit,
      softModeEnabled: willBeSoftMode,
      extremeModeEnabled: willBeExtremeMode,
      extremeDurationMinutes: extremeDuration,
      showDebugCountdown: showDebugCountdownInput.checked
    };

    const merged = { ...DEFAULT_SETTINGS, ...existing, ...newSettings };
    
    chrome.storage.sync.set({ 
      settings: merged,
      extremeModeEmergencyUsed: newEmergencyUsed
    }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Failed to save settings.", true);
        return;
      }
      showStatus("Settings saved.");
      loadOptions(); // Reload to update UI state
    });
  });
}

function renderTodoList(todos) {
  todoList.innerHTML = "";
  if (todos.length === 0) {
    todoList.innerHTML = '<p style="font-size: 12px; color: #9ca3af; font-style: italic;">No tasks yet. Add one above!</p>';
    return;
  }
  todos.forEach((todo, index) => {
    const item = document.createElement("div");
    item.className = "todo-item";
    item.innerHTML = `
      <span>${escapeHtml(todo)}</span>
      <button class="remove-todo" data-index="${index}">Remove</button>
    `;
    todoList.appendChild(item);
  });
  
  // Add event listeners to remove buttons
  document.querySelectorAll(".remove-todo").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"), 10);
      removeTodo(index);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  
  chrome.storage.sync.get("todoList", data => {
    const todos = data.todoList || [];
    todos.push(text);
    chrome.storage.sync.set({ todoList: todos }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Failed to add task.", true);
        return;
      }
      renderTodoList(todos);
      todoInput.value = "";
      showStatus("Task added.");
    });
  });
}

function removeTodo(index) {
  chrome.storage.sync.get("todoList", data => {
    const todos = data.todoList || [];
    todos.splice(index, 1);
    chrome.storage.sync.set({ todoList: todos }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Failed to remove task.", true);
        return;
      }
      renderTodoList(todos);
      showStatus("Task removed.");
    });
  });
}

function resetOptions() {
  chrome.storage.sync.set({ 
    settings: { ...DEFAULT_SETTINGS },
    todoList: [],
    extremeModeEmergencyUsed: false
  }, () => {
    if (chrome.runtime.lastError) {
      showStatus("Failed to reset settings.", true);
      return;
    }
    loadOptions();
    showStatus("Settings reset to defaults.");
  });
}

saveBtn.addEventListener("click", saveOptions);
resetBtn.addEventListener("click", resetOptions);
addTodoBtn.addEventListener("click", addTodo);
todoInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addTodo();
  }
});

// Prevent changing mode if extreme mode lock-in is active
[softModeInput, normalModeInput, extremeModeInput].forEach(radio => {
  radio.addEventListener("change", () => {
    chrome.storage.sync.get("extremeModeEmergencyUsed", data => {
      const emergencyUsed = data.extremeModeEmergencyUsed || false;
      if (emergencyUsed && !extremeModeInput.checked) {
        showStatus("Extreme mode cannot be disabled after emergency use.", true);
        extremeModeInput.checked = true;
        softModeInput.checked = false;
        normalModeInput.checked = false;
      }
    });
  });
});

document.addEventListener("DOMContentLoaded", loadOptions);


