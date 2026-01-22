// popup.js
// Simple UI to enable/disable the extension and show quick status.

const enabledToggle = document.getElementById("enabledToggle");
const statusLine = document.getElementById("statusLine");
const sessionLine = document.getElementById("sessionLine");
const openOptions = document.getElementById("openOptions");
const refreshStatusBtn = document.getElementById("refreshStatus");

function formatMinutes(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatTime(timestampMs) {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderStatus(data) {
  const { settings, isBlocked, blockUntil, hasActiveSession, remainingMs } = data;

  enabledToggle.checked = !!(settings && settings.enabled);

  if (isBlocked) {
    statusLine.innerHTML =
      '<span class="badge badge-blocked">BLOCKED</span> ' +
      `Social media sites blocked until ${formatTime(blockUntil)}.`;
  } else if (settings && settings.enabled) {
    const extremeText = settings.extremeModeEnabled ? "Extreme mode ON" : "Extreme mode OFF";
    statusLine.innerHTML =
      '<span class="badge badge-on">ON</span> ' +
      `Limit: ${settings.timeLimitMinutes} min · ${extremeText}`;
  } else {
    statusLine.innerHTML =
      '<span class="badge badge-off">OFF</span> ' +
      "Extension is disabled.";
  }

  if (hasActiveSession && remainingMs != null) {
    sessionLine.textContent =
      "Current session remaining: " + formatMinutes(remainingMs);
  } else {
    sessionLine.textContent = "";
  }
}

function requestStatus() {
  chrome.runtime.sendMessage({ type: "DK_GET_STATUS" }, response => {
    if (chrome.runtime.lastError) {
      statusLine.textContent = "Unable to get status.";
      sessionLine.textContent = "";
      return;
    }
    renderStatus(response || {});
  });
}

enabledToggle.addEventListener("change", () => {
  const enabled = enabledToggle.checked;
  chrome.storage.sync.get("settings", data => {
    const settings = data.settings || {};
    settings.enabled = enabled;
    chrome.storage.sync.set({ settings }, () => {
      requestStatus();
    });
  });
});

openOptions.addEventListener("click", e => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
});

refreshStatusBtn.addEventListener("click", () => {
  requestStatus();
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  requestStatus();
});


