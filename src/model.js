/* Pure SmartPace profile rules. No browser APIs belong in this file. */

(function initSmartPaceModel(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    mode: "learn",
    globalDefault: 1.5,
    minSamples: 3,
    maxSamplesPerChannel: 10
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSpeed(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.globalDefault;
    return Math.round(clamp(numeric, 0.5, 5) * 20) / 20;
  }

  function median(values) {
    const sorted = (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
    return normalizeSpeed(value);
  }

  function appendSessionSpeed(profile, observedSpeed, maxSamples = DEFAULT_SETTINGS.maxSamplesPerChannel) {
    const previous = Array.isArray(profile?.sessionSpeeds) ? profile.sessionSpeeds : [];
    const limit = Math.max(1, Math.floor(Number(maxSamples) || DEFAULT_SETTINGS.maxSamplesPerChannel));
    return {
      ...(profile || {}),
      sessionSpeeds: [...previous, normalizeSpeed(observedSpeed)].slice(-limit)
    };
  }

  function predictionFor(profile, minSamples = DEFAULT_SETTINGS.minSamples) {
    const samples = Array.isArray(profile?.sessionSpeeds) ? profile.sessionSpeeds : [];
    if (samples.length < minSamples) return null;
    return median(samples);
  }

  function confidenceFor(profile, minSamples = DEFAULT_SETTINGS.minSamples) {
    const count = Array.isArray(profile?.sessionSpeeds) ? profile.sessionSpeeds.length : 0;
    if (count < minSamples) return "Learning";
    if (count < 5) return "Ready";
    return "High";
  }

  function shouldTrainSession(session) {
    if (!session || session.excluded) return false;
    const speed = normalizeSpeed(session.stableSpeed);
    if (speed === 1) return false;
    if (Number(session.activeSeconds) < 45) return false;
    if (Number(session.stableSeconds) < 20) return false;
    if (Number(session.stableShare) < 0.5) return false;
    if (session.viewedFraction != null && Number(session.viewedFraction) < 0.1) return false;
    return true;
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeSpeed,
    median,
    appendSessionSpeed,
    predictionFor,
    confidenceFor,
    shouldTrainSession
  };

  root.SmartPaceModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
