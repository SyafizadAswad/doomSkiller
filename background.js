// background.js
// Core logic for tracking active time, enforcing limits, and extreme blocking.

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  timeLimitMinutes: 5, // limit per continuous session
  extremeModeEnabled: false,
  extremeDurationMinutes: 60, // block duration when extreme mode triggered
  showDebugCountdown: false // show in-page countdown overlay
};

// Track if extreme mode emergency disable has been used
let extremeModeEmergencyUsed = false;

// In-memory state (mirrored to storage.local)
let settings = { ...DEFAULT_SETTINGS };
let currentActiveTabId = null;
let currentWindowFocused = true;
let currentSessionStart = null; // timestamp (ms) when continuous session started
let accumulatedSessionMs = 0; // total time spent on target sites in the current cycle
let blockUntil = 0; // timestamp (ms) until which sites are blocked

// Alarm names
const SESSION_CHECK_ALARM = "dk_session_check";

// Helper: target site detection
function isTargetUrl(urlString) {
  if (!urlString) return false;
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    return false;
  }

  const hostname = url.hostname;
  const path = url.pathname;

  // youtube shorts
  if (
    (hostname === "www.youtube.com" || hostname === "youtube.com") &&
    path.startsWith("/shorts")
  ) {
    return true;
  }

  // instagram (all of it)
  if (
    hostname === "www.instagram.com" ||
    hostname === "instagram.com"
  ) {
    return true;
  }

  // twitter / x (all of it)
  if (
    hostname === "twitter.com" ||
    hostname === "www.twitter.com" ||
    hostname === "x.com" ||
    hostname === "www.x.com"
  ) {
    return true;
  }

  // facebook (all of it)
  if (
    hostname === "www.facebook.com" ||
    hostname === "facebook.com" ||
    hostname === "m.facebook.com"
  ) {
    return true;
  }

  // tiktok (all of it)
  if (
    hostname === "www.tiktok.com" ||
    hostname === "tiktok.com"
  ) {
    return true;
  }

  return false;
}

// Helper: get extension block page URL
function getBlockPageUrl() {
  return chrome.runtime.getURL("block.html");
}

// Load settings and state from storage
async function loadSettingsAndState() {
  const syncData = await chrome.storage.sync.get(["settings", "extremeModeEmergencyUsed"]);
  if (syncData.settings) {
    settings = { ...DEFAULT_SETTINGS, ...syncData.settings };
  } else {
    settings = { ...DEFAULT_SETTINGS };
  }
  
  extremeModeEmergencyUsed = syncData.extremeModeEmergencyUsed || false;
  
  // Enforce lock-in: if emergency was used and extreme mode is disabled, re-enable it
  if (extremeModeEmergencyUsed && !settings.extremeModeEnabled) {
    settings.extremeModeEnabled = true;
    await saveSettings({ extremeModeEnabled: true });
  }

  const localData = await chrome.storage.local.get([
    "blockUntil",
    "currentSessionStart",
    "accumulatedSessionMs"
  ]);
  blockUntil = typeof localData.blockUntil === "number" ? localData.blockUntil : 0;
  currentSessionStart =
    typeof localData.currentSessionStart === "number"
      ? localData.currentSessionStart
      : null;
  accumulatedSessionMs =
    typeof localData.accumulatedSessionMs === "number"
      ? localData.accumulatedSessionMs
      : 0;
}

// Persist settings to sync storage
function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  return chrome.storage.sync.set({ settings });
}

// Persist volatile state to local storage
function saveState() {
  return chrome.storage.local.set({
    blockUntil,
    currentSessionStart,
    accumulatedSessionMs
  });
}

// Check if we are currently in a block period
function isCurrentlyBlocked() {
  const now = Date.now();
  if (blockUntil && now >= blockUntil) {
    // Block has expired; clear it
    blockUntil = 0;
    saveState();
    return false;
  }
  return blockUntil && Date.now() < blockUntil;
}

// Enforce blocking on a single tab if needed
function enforceBlockingOnTab(tabId, urlString) {
  if (!isCurrentlyBlocked()) return;
  if (!isTargetUrl(urlString)) return;

  const blockUrl = getBlockPageUrl();
  chrome.tabs.update(tabId, { url: blockUrl }).catch(() => {
    // Tabs might already be gone; ignore errors
  });
}

// Enforce blocking on all open target tabs
function enforceBlockingOnAllTabs() {
  if (!isCurrentlyBlocked()) return;
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.url && isTargetUrl(tab.url)) {
        enforceBlockingOnTab(tab.id, tab.url);
      }
    }
  });
}

// Clear current session timer
function resetAllTiming() {
  currentSessionStart = null;
  accumulatedSessionMs = 0;
  saveState();
}

// Stop current session and accumulate elapsed time
function stopCurrentSession() {
  if (currentSessionStart == null) return;
  const now = Date.now();
  const elapsed = now - currentSessionStart;
  accumulatedSessionMs += Math.max(0, elapsed);
  currentSessionStart = null;
  saveState();
}

// Start a new session timer
function startSession() {
  currentSessionStart = Date.now();
  saveState();
}

// Returns a Promise resolving to the currently active tab (or null)
function getCurrentActiveTab() {
  if (currentActiveTabId == null) return Promise.resolve(null);
  return chrome.tabs
    .get(currentActiveTabId)
    .then(tab => tab)
    .catch(() => null);
}

// Core: recompute whether we should be timing a session
async function updateSessionState() {
  if (!settings.enabled) {
    stopCurrentSession();
    return;
  }

  // If in block period, no timing; just enforce block
  if (isCurrentlyBlocked()) {
    stopCurrentSession();
    const tab = await getCurrentActiveTab();
    if (tab && tab.url) {
      enforceBlockingOnTab(tab.id, tab.url);
    }
    return;
  }

  if (!currentWindowFocused) {
    stopCurrentSession();
    return;
  }

  const tab = await getCurrentActiveTab();
  if (!tab || !tab.url) {
    stopCurrentSession();
    return;
  }

  const onTarget = isTargetUrl(tab.url);

  if (!onTarget) {
    // Leaving SNS pauses the session but keeps accumulated time
    stopCurrentSession();
    return;
  }

  // On target site + window focused + extension enabled
  if (currentSessionStart == null) {
    startSession();
  }
}

// Check if the current session exceeded the limit
async function checkSessionLimit() {
  if (!settings.enabled) return;
  if (isCurrentlyBlocked()) return;
  const now = Date.now();
  let totalMs = accumulatedSessionMs;
  if (currentSessionStart != null && currentWindowFocused) {
    totalMs += now - currentSessionStart;
  }
  const limitMs = settings.timeLimitMinutes * 60 * 1000;

  if (totalMs < limitMs) {
    return; // Not yet reached limit
  }

  const tab = await getCurrentActiveTab();
  if (!tab || !tab.url || !isTargetUrl(tab.url)) {
    // User navigated away from target or closed the tab; we already accumulated the time
    return;
  }

  // Limit reached
  handleLimitReached(tab);
}

// Handle what to do when the limit is reached
function handleLimitReached(tab) {
  const now = Date.now();
  resetAllTiming();

  if (settings.extremeModeEnabled) {
    // Set block period
    const durationMs = settings.extremeDurationMinutes * 60 * 1000;
    blockUntil = now + durationMs;
    saveState();

    // Enforce block on all tabs
    enforceBlockingOnAllTabs();

    createNotification(
      "Doomscrolling blocked",
      `Extreme mode: all social media sites are blocked for ${settings.extremeDurationMinutes} minutes.`
    );
  } else {
    // Redirect only the current tab to the local block page
    const blockUrl = getBlockPageUrl();
    chrome.tabs.update(tab.id, { url: blockUrl }).catch(() => {});
    createNotification(
      "Doomscrolling stopped",
      `You spent more than ${settings.timeLimitMinutes} minutes on social media. Time to get back to work.`
    );
  }
}

// Create a browser notification
function createNotification(title, message) {
  // Note: iconUrl must reference a path in the extension. Add an icon file named icon128.png to avoid warnings.
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
    priority: 2
  });
}

// Listen for alarm ticks (for session checks)
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SESSION_CHECK_ALARM) {
    checkSessionLimit();
  }
});

// Track active tab changes
chrome.tabs.onActivated.addListener(activeInfo => {
  currentActiveTabId = activeInfo.tabId;
  updateSessionState();
});

// Track URL changes and enforce blocking
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // New URL: maybe enforce blocking
    enforceBlockingOnTab(tabId, changeInfo.url);
  }

  if (tabId === currentActiveTabId && (changeInfo.status === "complete" || changeInfo.url)) {
    updateSessionState();
  }
});

// Track window focus
chrome.windows.onFocusChanged.addListener(windowId => {
  currentWindowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  if (!currentWindowFocused) {
    // Pause timing when Chrome window loses focus
    stopCurrentSession();
  }
  updateSessionState();
});

// Clean up if active tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === currentActiveTabId) {
    currentActiveTabId = null;
    // Closing the active tab pauses the session but keeps accumulated time
    stopCurrentSession();
  }
});

// React to settings changes from options/popup
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync") {
    if (changes.settings) {
      const newSettings = changes.settings.newValue || {};
      const wasExtremeEnabled = settings.extremeModeEnabled || false;
      settings = { ...DEFAULT_SETTINGS, ...newSettings };
      
      // Enforce lock-in: prevent disabling extreme mode if emergency was used
      if (extremeModeEmergencyUsed && wasExtremeEnabled && !settings.extremeModeEnabled) {
        settings.extremeModeEnabled = true;
        await saveSettings({ extremeModeEnabled: true });
      }
    }
    if (changes.extremeModeEmergencyUsed) {
      extremeModeEmergencyUsed = changes.extremeModeEmergencyUsed.newValue || false;
    }
  }
});

// Provide simple status to popup via messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "DK_GET_STATUS") {
    const now = Date.now();
    let remainingMs = null;
    const limitMs = settings.timeLimitMinutes * 60 * 1000;
    let totalMs = accumulatedSessionMs;
    if (currentSessionStart != null && settings.enabled && !isCurrentlyBlocked()) {
      totalMs += now - currentSessionStart;
    }
    if (settings.enabled && !isCurrentlyBlocked()) {
      remainingMs = Math.max(0, limitMs - totalMs);
    }

    sendResponse({
      settings,
      isBlocked: isCurrentlyBlocked(),
      blockUntil,
      hasActiveSession: currentSessionStart != null,
      remainingMs
    });
    return true;
  }
});

// Initial setup: load state and create alarms
(async function init() {
  await loadSettingsAndState();

  // Ensure we have a repeating alarm that drives timestamp-based checks
  chrome.alarms.create(SESSION_CHECK_ALARM, {
    periodInMinutes: 0.25 // every 15s, but decision is purely timestamp-based
  });

  // Initialize the currently active tab
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs && tabs[0]) {
      currentActiveTabId = tabs[0].id;
      updateSessionState();
    }
  });
})();


