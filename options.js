// options.js
// Configure time limit and extreme mode settings.

const timeLimitInput = document.getElementById("timeLimit");
const extremeModeInput = document.getElementById("extremeMode");
const extremeDurationInput = document.getElementById("extremeDuration");
const showDebugCountdownInput = document.getElementById("showDebugCountdown");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

const DEFAULT_SETTINGS = {
  enabled: true,
  timeLimitMinutes: 5,
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
  chrome.storage.sync.get("settings", data => {
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    timeLimitInput.value = settings.timeLimitMinutes;
    extremeModeInput.checked = settings.extremeModeEnabled;
    extremeDurationInput.value = settings.extremeDurationMinutes;
     showDebugCountdownInput.checked = settings.showDebugCountdown;
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

  const newSettings = {
    timeLimitMinutes: timeLimit,
    extremeModeEnabled: extremeModeInput.checked,
    extremeDurationMinutes: extremeDuration,
    showDebugCountdown: showDebugCountdownInput.checked
  };

  chrome.storage.sync.get("settings", data => {
    const existing = data.settings || {};
    const merged = { ...DEFAULT_SETTINGS, ...existing, ...newSettings };
    chrome.storage.sync.set({ settings: merged }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Failed to save settings.", true);
        return;
      }
      showStatus("Settings saved.");
    });
  });
}

function resetOptions() {
  chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS } }, () => {
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

document.addEventListener("DOMContentLoaded", loadOptions);


