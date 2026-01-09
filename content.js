// content.js
// Debug countdown overlay shown on target sites while a doomscrolling session is active.

const DK_OVERLAY_ID = "dk-debug-countdown-overlay";
let dkIntervalId = null;

function dkIsTargetUrl(urlString) {
  if (!urlString) return false;
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    return false;
  }

  const hostname = url.hostname;
  const path = url.pathname;

  // YouTube Shorts
  if (
    (hostname === "www.youtube.com" || hostname === "youtube.com") &&
    path.startsWith("/shorts")
  ) {
    return true;
  }

  // Instagram Reels
  if (
    (hostname === "www.instagram.com" || hostname === "instagram.com") &&
    path.startsWith("/reels")
  ) {
    return true;
  }

  // Twitter / X main feed (broad match)
  if (
    hostname === "twitter.com" ||
    hostname === "www.twitter.com" ||
    hostname === "x.com" ||
    hostname === "www.x.com"
  ) {
    return true;
  }

  return false;
}

function dkFormatCountdown(ms) {
  if (ms == null) return "";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");
  return `${minutes}:${paddedSeconds}`;
}

function dkEnsureOverlay() {
  let el = document.getElementById(DK_OVERLAY_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = DK_OVERLAY_ID;
  el.style.position = "fixed";
  el.style.top = "10px";
  el.style.right = "10px";
  el.style.zIndex = "2147483647";
  el.style.background = "rgba(15, 23, 42, 0.9)";
  el.style.color = "#f9fafb";
  el.style.padding = "6px 10px";
  el.style.borderRadius = "999px";
  el.style.fontSize = "12px";
  el.style.fontFamily =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  el.style.display = "none";
  el.style.pointerEvents = "none";
  el.textContent = "Doomscrolling: --:--";

  document.documentElement.appendChild(el);
  return el;
}

function dkHideOverlay() {
  const el = document.getElementById(DK_OVERLAY_ID);
  if (el) {
    el.style.display = "none";
  }
}

function dkUpdateOnce() {
  // Only show on target URLs
  if (!dkIsTargetUrl(window.location.href)) {
    dkHideOverlay();
    return;
  }

  chrome.runtime.sendMessage({ type: "DK_GET_STATUS" }, response => {
    if (chrome.runtime.lastError || !response) {
      dkHideOverlay();
      return;
    }

    const { settings, isBlocked, hasActiveSession, remainingMs } = response;
    if (!settings || !settings.enabled || !settings.showDebugCountdown) {
      dkHideOverlay();
      return;
    }
    if (isBlocked || !hasActiveSession || remainingMs == null) {
      dkHideOverlay();
      return;
    }

    const el = dkEnsureOverlay();
    el.style.display = "inline-flex";
    el.textContent = `Doomscrolling ends in ${dkFormatCountdown(remainingMs)}`;
  });
}

function dkStartInterval() {
  if (dkIntervalId != null) return;
  dkUpdateOnce();
  dkIntervalId = window.setInterval(dkUpdateOnce, 1000);
}

function dkInit() {
  // Always start the interval; dkUpdateOnce() itself checks if the URL is a target.
  // This ensures we still work on SPA-style navigation (e.g., YouTube Shorts).
  dkStartInterval();
}

dkInit();


