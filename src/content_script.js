/* YouTube playback control, session evidence, and silent channel prediction. */

/* global SmartPaceController, SmartPaceModel, SmartPaceSession, SmartPaceStorage */

(function initSmartPaceContent() {
  "use strict";

  const TICK_MS = 1000;
  const FLUSH_MS = 5000;
  const RECONCILE_MS = 1000;
  const OVERLAY_OFFSET_PX = 16;
  const OVERLAY_FONT_STYLE_ID = "inferfox-smartpace-overlay-font";
  let current = null;
  let reconcileTimer = 0;
  let ctrlHeld = false;
  let speedOverlay = null;
  let pointer = { x: -1, y: -1 };

  function runtimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response || {});
      });
    });
  }

  function videoIdFromLocation() {
    return SmartPaceController.videoIdFromUrl(location.href);
  }

  function channelContext() {
    const metaChannelId = String(document.querySelector('meta[itemprop="channelId"]')?.content || "").trim();
    const ownerLink = document.querySelector(
      'ytd-video-owner-renderer a[href^="/channel/"], #owner a[href^="/channel/"], ytd-video-owner-renderer a[href^="/@"], #owner a[href^="/@"]'
    );
    const href = String(ownerLink?.getAttribute("href") || "");
    const channelKey = SmartPaceController.channelKeyFromSignals(href, metaChannelId);
    const channelName = String(
      document.querySelector("ytd-video-owner-renderer ytd-channel-name #text")?.textContent
      || document.querySelector("#owner ytd-channel-name #text")?.textContent
      || ownerLink?.textContent
      || channelKey
    ).replace(/\s+/g, " ").trim();
    return { channelKey, channelName };
  }

  function currentVideoElement() {
    return document.querySelector("video.html5-main-video") || document.querySelector("video");
  }

  function setPlaybackRate(video, value) {
    const rate = SmartPaceModel.normalizeSpeed(value);
    if (rate == null) return;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }

  function pointIsOnVideo(x, y) {
    if (!current?.video?.isConnected) return false;
    const rect = current.video.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function formatOverlaySpeed(rate) {
    return `${Number(rate).toFixed(2)}×`;
  }

  function ensureOverlayFont() {
    if (document.getElementById(OVERLAY_FONT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = OVERLAY_FONT_STYLE_ID;
    style.textContent = `@font-face { font-family: "Inferfox Orbitron"; font-style: normal; font-weight: 700; font-display: swap; src: url("${chrome.runtime.getURL("assets/fonts/Orbitron-Bold.woff2")}") format("woff2"); }`;
    (document.head || document.documentElement).appendChild(style);
  }

  function overlayElement() {
    if (speedOverlay?.isConnected) return speedOverlay;
    ensureOverlayFont();
    speedOverlay = document.createElement("div");
    speedOverlay.id = "inferfox-smartpace-speed-overlay";
    speedOverlay.setAttribute("aria-hidden", "true");
    Object.assign(speedOverlay.style, {
      position: "fixed",
      zIndex: "2147483647",
      display: "none",
      padding: "8px 12px",
      borderRadius: "6px",
      background: "rgba(0, 0, 0, 0.62)",
      color: "#ffffff",
      fontFamily: '"Inferfox Orbitron", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      fontSize: "20px",
      fontWeight: "700",
      fontVariantNumeric: "tabular-nums",
      lineHeight: "1",
      pointerEvents: "none"
    });
    (document.fullscreenElement || document.body).appendChild(speedOverlay);
    return speedOverlay;
  }

  function hideSpeedOverlay() {
    if (speedOverlay) speedOverlay.style.display = "none";
  }

  function showSpeedOverlay() {
    if (!current?.video?.isConnected || !pointIsOnVideo(pointer.x, pointer.y)) return;
    const overlay = overlayElement();
    const fullscreenHost = document.fullscreenElement || document.body;
    if (overlay.parentElement !== fullscreenHost) fullscreenHost.appendChild(overlay);
    const rect = current.video.getBoundingClientRect();
    overlay.textContent = formatOverlaySpeed(current.video.playbackRate);
    overlay.style.left = `${Math.max(8, rect.left + OVERLAY_OFFSET_PX)}px`;
    overlay.style.top = `${Math.max(8, rect.top + OVERLAY_OFFSET_PX)}px`;
    overlay.style.display = "block";
  }

  function updateSpeedOverlay() {
    if (ctrlHeld && pointIsOnVideo(pointer.x, pointer.y)) showSpeedOverlay();
    else hideSpeedOverlay();
  }

  async function applyReadyPrediction(binding) {
    if (!binding || binding !== current || !binding.video.isConnected || binding.session.manualAdjusted) return;
    try {
      const response = await runtimeMessage({ type: "profile.get", channelKey: binding.channelKey });
      if (!response.ok || response.prediction == null || binding !== current || binding.session.manualAdjusted) return;
      binding.prediction = response.prediction;
      setPlaybackRate(binding.video, response.prediction);
    } catch {
      // Extension reloads and transient player states are retried by reconciliation.
    }
  }

  async function refreshWheelStep(binding) {
    try {
      const state = await SmartPaceStorage.loadState();
      if (binding && binding === current) binding.wheelStep = state.settings.wheelStep;
    } catch {
      // A safe default remains available while storage is temporarily unavailable.
    }
  }

  function recordTick(binding) {
    const now = performance.now();
    const elapsedSeconds = Math.min(2.5, Math.max(0, (now - binding.lastTickAt) / 1000));
    binding.lastTickAt = now;
    if (binding !== current || !binding.session.manualAdjusted) return;
    if (binding.video.paused || binding.video.ended || binding.video.readyState < 2) return;
    SmartPaceSession.recordPlayback(binding.session, binding.video.playbackRate, elapsedSeconds);
  }

  async function flushEvidence(binding) {
    if (!binding) return;
    recordTick(binding);
    const evidence = SmartPaceSession.buildEvidence(binding.session);
    if (!SmartPaceModel.shouldTrainSession(evidence)) return;
    try {
      await runtimeMessage({
        type: "session.upsert",
        channelKey: binding.channelKey,
        channelName: binding.channelName,
        evidence
      });
    } catch {
      // The next periodic flush retries the same per-video upsert.
    }
  }

  function teardownCurrent() {
    const binding = current;
    if (!binding) return;
    current = null;
    hideSpeedOverlay();
    window.clearInterval(binding.tickTimer);
    window.clearInterval(binding.flushTimer);
    window.clearTimeout(binding.retryTimer);
    binding.video.removeEventListener("loadedmetadata", binding.applyHandler);
    binding.video.removeEventListener("canplay", binding.applyHandler);
    void flushEvidence(binding);
  }

  function bindVideo(videoId, channelKey, channelName, video) {
    teardownCurrent();
    const binding = {
      videoId,
      channelKey,
      channelName,
      video,
      prediction: null,
      wheelStep: SmartPaceModel.DEFAULT_SETTINGS.wheelStep,
      session: SmartPaceSession.createSession(videoId),
      lastTickAt: performance.now(),
      tickTimer: 0,
      flushTimer: 0,
      retryTimer: 0,
      applyHandler: null
    };
    binding.applyHandler = () => void applyReadyPrediction(binding);
    binding.tickTimer = window.setInterval(() => recordTick(binding), TICK_MS);
    binding.flushTimer = window.setInterval(() => void flushEvidence(binding), FLUSH_MS);
    video.addEventListener("loadedmetadata", binding.applyHandler);
    video.addEventListener("canplay", binding.applyHandler);
    current = binding;
    void refreshWheelStep(binding);
    void applyReadyPrediction(binding);
    binding.retryTimer = window.setTimeout(binding.applyHandler, 500);
  }

  function reconcile() {
    const videoId = videoIdFromLocation();
    if (!videoId) {
      teardownCurrent();
      return;
    }
    const video = currentVideoElement();
    const { channelKey, channelName } = channelContext();
    if (!video || !channelKey) return;
    if (current?.videoId === videoId && current.video === video && current.channelKey === channelKey) {
      if (channelName && channelName !== channelKey) current.channelName = channelName;
      return;
    }
    bindVideo(videoId, channelKey, channelName, video);
  }

  function onWheel(event) {
    if (!event.ctrlKey || !current || !current.video.isConnected || !videoIdFromLocation() || !pointIsOnVideo(event.clientX, event.clientY)) return;
    event.preventDefault();
    ctrlHeld = true;
    pointer = { x: event.clientX, y: event.clientY };
    showSpeedOverlay();
    const nextRate = SmartPaceController.nextRateForWheel(current.video.playbackRate, event.deltaY, current.wheelStep);
    if (nextRate == null || nextRate === current.video.playbackRate) return;
    SmartPaceSession.markManualAdjustment(current.session);
    current.lastTickAt = performance.now();
    setPlaybackRate(current.video, nextRate);
    showSpeedOverlay();
  }

  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    updateSpeedOverlay();
  }, { capture: true, passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Control") return;
    ctrlHeld = true;
    updateSpeedOverlay();
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key !== "Control") return;
    ctrlHeld = false;
    hideSpeedOverlay();
  }, true);
  document.addEventListener("yt-navigate-finish", reconcile, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushEvidence(current);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SmartPaceStorage.STORAGE_KEY]) void refreshWheelStep(current);
  });
  window.addEventListener("pagehide", () => void flushEvidence(current));
  window.addEventListener("resize", updateSpeedOverlay);
  window.addEventListener("scroll", updateSpeedOverlay, true);
  document.addEventListener("fullscreenchange", updateSpeedOverlay);
  window.addEventListener("blur", () => {
    ctrlHeld = false;
    hideSpeedOverlay();
  });
  reconcileTimer = window.setInterval(reconcile, RECONCILE_MS);
  window.addEventListener("unload", () => window.clearInterval(reconcileTimer));
  reconcile();
})();
