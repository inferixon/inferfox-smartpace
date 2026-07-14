/* YouTube playback control, session evidence, and silent channel prediction. */

/* global SmartPaceController, SmartPaceModel, SmartPaceSession */

(function initSmartPaceContent() {
  "use strict";

  const TICK_MS = 1000;
  const FLUSH_MS = 5000;
  const RECONCILE_MS = 1000;
  let current = null;
  let reconcileTimer = 0;

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
    if (!event.ctrlKey || !current || !current.video.isConnected || !videoIdFromLocation()) return;
    event.preventDefault();
    const nextRate = SmartPaceController.nextRateForWheel(current.video.playbackRate, event.deltaY);
    if (nextRate == null || nextRate === current.video.playbackRate) return;
    SmartPaceSession.markManualAdjustment(current.session);
    current.lastTickAt = performance.now();
    setPlaybackRate(current.video, nextRate);
  }

  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("yt-navigate-finish", reconcile, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushEvidence(current);
  });
  window.addEventListener("pagehide", () => void flushEvidence(current));
  reconcileTimer = window.setInterval(reconcile, RECONCILE_MS);
  window.addEventListener("unload", () => window.clearInterval(reconcileTimer));
  reconcile();
})();
