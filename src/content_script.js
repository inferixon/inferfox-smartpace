/* YouTube playback control, session evidence, and silent channel prediction. */

/* global SmartPaceController, SmartPaceModel, SmartPaceSession, SmartPaceStorage */

(function initSmartPaceContent() {
  "use strict";

  const TICK_MS = 1000;
  const FLUSH_MS = 15000;
  const RECONCILE_MS = 5000;
  const PERSIST_INTERVAL_SECONDS = 60;
  const PLAYER_INTERACTION_WINDOW_MS = 5000;
  const AUTOMATIC_RATE_WINDOW_MS = 1500;
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
    const ownerLinks = [...document.querySelectorAll(
      'ytd-video-owner-renderer ytd-channel-name a[href^="/channel/"], #owner ytd-channel-name a[href^="/channel/"], ytd-video-owner-renderer ytd-channel-name a[href^="/@"], #owner ytd-channel-name a[href^="/@"]'
    )];
    const channelKey = SmartPaceController.channelKeyFromOwnerLinks(
      ownerLinks.map((link) => String(link.getAttribute("href") || "")),
      metaChannelId
    );
    const ownerLink = ownerLinks[0] || null;
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

  function setPlaybackRate(binding, value) {
    const rate = SmartPaceModel.normalizeSpeed(value);
    if (rate == null) return;
    binding.automaticRateUntil = performance.now() + AUTOMATIC_RATE_WINDOW_MS;
    binding.video.defaultPlaybackRate = rate;
    binding.video.playbackRate = rate;
  }

  function isLearningEligible(video) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return false;
    const player = document.querySelector("#movie_player");
    if (player?.classList.contains("ad-showing")) return false;
    return !document.querySelector('ytd-watch-flexy[is-live-content], ytd-watch-flexy[is-premiere], .ytp-live-badge');
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
    if (!binding || !binding.channelKey || binding !== current || !binding.video.isConnected
      || binding.session.manualAdjusted || !isLearningEligible(binding.video)) return;
    try {
      const response = await runtimeMessage({ type: "profile.get", channelKey: binding.channelKey });
      if (!response.ok || response.prediction == null || binding !== current || binding.session.manualAdjusted) return;
      binding.prediction = response.prediction;
      setPlaybackRate(binding, response.prediction);
    } catch {
      // Extension reloads and transient player states are retried by reconciliation.
    }
  }

  function resetSession(binding) {
    binding.session = SmartPaceSession.createSession(binding.videoId);
    binding.lastPersistedEvidence = null;
    binding.lastTickAt = performance.now();
  }

  function markManualAdjustment(binding) {
    SmartPaceSession.markManualAdjustment(binding.session);
    binding.lastPersistedEvidence = null;
    binding.lastTickAt = performance.now();
  }

  async function refreshRuntimeState(binding) {
    try {
      const state = await SmartPaceStorage.loadState();
      if (!binding || binding !== current) return;
      if (binding.resetRevision !== state.resetRevision) {
        binding.resetRevision = state.resetRevision;
        resetSession(binding);
      }
      binding.wheelStep = state.settings.wheelStep;
    } catch {
      // A safe default remains available while storage is temporarily unavailable.
    }
  }

  function recordTick(binding) {
    const now = performance.now();
    const elapsedSeconds = Math.min(2.5, Math.max(0, (now - binding.lastTickAt) / 1000));
    binding.lastTickAt = now;
    if (binding !== current || !binding.session.manualAdjusted) return;
    if (binding.video.paused || binding.video.ended || binding.video.readyState < 2 || !isLearningEligible(binding.video)) return;
    SmartPaceSession.recordPlayback(binding.session, binding.video.playbackRate, elapsedSeconds);
  }

  async function flushEvidence(binding, { final = false } = {}) {
    if (!binding || !binding.channelKey || !isLearningEligible(binding.video)) return;
    recordTick(binding);
    const evidence = SmartPaceSession.buildEvidence(binding.session);
    if (!SmartPaceModel.shouldTrainSession(evidence)
      || !SmartPaceSession.shouldPersistEvidence(binding.lastPersistedEvidence, evidence, PERSIST_INTERVAL_SECONDS, final)) return;
    try {
      const response = await runtimeMessage({
        type: "session.upsert",
        channelKey: binding.channelKey,
        channelName: binding.channelName,
        resetRevision: binding.resetRevision,
        evidence
      });
      if (response.ok && response.stored) {
        binding.lastPersistedEvidence = {
          stableSpeed: evidence.stableSpeed,
          stableSeconds: evidence.stableSeconds
        };
      }
    } catch {
      // The next periodic flush retries the same per-video upsert.
    }
  }

  function teardownCurrent() {
    const binding = current;
    if (!binding) return;
    hideSpeedOverlay();
    void flushEvidence(binding, { final: true });
    current = null;
    window.clearInterval(binding.tickTimer);
    window.clearInterval(binding.flushTimer);
    window.clearTimeout(binding.retryTimer);
    binding.video.removeEventListener("loadedmetadata", binding.applyHandler);
    binding.video.removeEventListener("canplay", binding.applyHandler);
    binding.video.removeEventListener("ratechange", binding.rateChangeHandler);
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
      resetRevision: 0,
      session: SmartPaceSession.createSession(videoId),
      lastPersistedEvidence: null,
      automaticRateUntil: 0,
      playerInteractionUntil: 0,
      lastTickAt: performance.now(),
      tickTimer: 0,
      flushTimer: 0,
      retryTimer: 0,
      applyHandler: null
    };
    binding.applyHandler = () => void applyReadyPrediction(binding);
    binding.rateChangeHandler = () => {
      if (binding !== current || performance.now() < binding.automaticRateUntil || performance.now() > binding.playerInteractionUntil) return;
      markManualAdjustment(binding);
    };
    binding.tickTimer = window.setInterval(() => recordTick(binding), TICK_MS);
    binding.flushTimer = window.setInterval(() => void flushEvidence(binding), FLUSH_MS);
    video.addEventListener("loadedmetadata", binding.applyHandler);
    video.addEventListener("canplay", binding.applyHandler);
    video.addEventListener("ratechange", binding.rateChangeHandler);
    current = binding;
    void refreshRuntimeState(binding);
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
    if (!video) return;
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
    markManualAdjustment(current);
    setPlaybackRate(current, nextRate);
    showSpeedOverlay();
  }

  function notePlayerInteraction(event) {
    if (!current || !current.video.isConnected || !pointIsOnVideo(event.clientX, event.clientY)) return;
    current.playerInteractionUntil = performance.now() + PLAYER_INTERACTION_WINDOW_MS;
  }

  async function learnCurrentSpeed() {
    const binding = current;
    if (!binding?.channelKey || !binding.video.isConnected || !isLearningEligible(binding.video)) {
      throw new Error("Open a regular video from one channel to learn its current speed.");
    }
    const response = await runtimeMessage({
      type: "profile.learnCurrentSpeed",
      channelKey: binding.channelKey,
      channelName: binding.channelName,
      speed: binding.video.playbackRate
    });
    if (!response.ok || !response.stored) throw new Error(response.error || "Current speed could not be learned.");
    binding.prediction = response.speed;
    return response;
  }

  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("pointerdown", notePlayerInteraction, true);
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
    if (document.visibilityState === "hidden") void flushEvidence(current, { final: true });
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[SmartPaceStorage.STORAGE_KEY]) void refreshRuntimeState(current);
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "content.learnCurrentSpeed") return false;
    learnCurrentSpeed()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
  window.addEventListener("pagehide", () => void flushEvidence(current, { final: true }));
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
