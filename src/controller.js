/* Pure URL, channel-key, and wheel-rate controller rules. */

(function initSmartPaceController(root) {
  "use strict";

  function normalizeRate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(Math.min(5, Math.max(0.5, numeric)) * 20) / 20;
  }

  function normalizeWheelStep(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.1;
    return Math.round(Math.min(1, Math.max(0.05, numeric)) * 20) / 20;
  }

  function videoIdFromUrl(urlString) {
    try {
      const url = new URL(String(urlString || ""));
      if (url.hostname !== "youtube.com" && !url.hostname.endsWith(".youtube.com")) return "";
      if (url.pathname !== "/watch") return "";
      return String(url.searchParams.get("v") || "").trim();
    } catch {
      return "";
    }
  }

  function nextRateForWheel(currentRate, deltaY, step = 0.1) {
    const current = normalizeRate(currentRate);
    if (current == null || Number(deltaY) === 0) return current;
    const wheelStep = normalizeWheelStep(step);
    return normalizeRate(current + (Number(deltaY) < 0 ? wheelStep : -wheelStep));
  }

  function channelKeyFromSignals(ownerHref, metaChannelId) {
    let href = String(ownerHref || "");
    try {
      href = decodeURIComponent(href);
    } catch {
      // Keep the original href when a malformed URL escape is encountered.
    }
    const channelIdMatch = href.match(/^\/channel\/(UC[0-9A-Za-z_-]{10,})/);
    if (channelIdMatch) return `channelId:${channelIdMatch[1]}`;
    const handleMatch = href.match(/^\/(@[^\s/?#]+)/u);
    if (handleMatch) return `handle:${handleMatch[1].toLowerCase()}`;
    const meta = String(metaChannelId || "").trim();
    return /^UC[0-9A-Za-z_-]{10,}$/.test(meta) ? `channelId:${meta}` : "";
  }

  const api = { videoIdFromUrl, nextRateForWheel, normalizeWheelStep, channelKeyFromSignals };
  root.SmartPaceController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
