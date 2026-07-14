/* Pure SmartPace profile rules. No browser APIs belong in this file. */

(function initSmartPaceModel(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    minSamples: 3,
    maxSamplesPerChannel: 10
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSpeed(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(clamp(numeric, 0.5, 5) * 20) / 20;
  }

  function median(values) {
    const sorted = (Array.isArray(values) ? values : [])
      .map(normalizeSpeed)
      .filter((value) => value != null)
      .sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
    return normalizeSpeed(value);
  }

  function normalizedEvidence(evidence) {
    const videoId = String(evidence?.videoId || "").trim();
    const speed = normalizeSpeed(evidence?.speed ?? evidence?.stableSpeed);
    if (!videoId || speed == null || speed === 1) return null;
    return {
      videoId,
      speed,
      observedAt: String(evidence?.observedAt || new Date().toISOString())
    };
  }

  function sessionsFor(profile) {
    if (Array.isArray(profile?.sessions)) {
      return profile.sessions.map(normalizedEvidence).filter(Boolean);
    }
    if (Array.isArray(profile?.sessionSpeeds)) {
      return profile.sessionSpeeds
        .map((speed, index) => normalizedEvidence({ videoId: `legacy:${index}`, speed, observedAt: profile.updatedAt }))
        .filter(Boolean);
    }
    return [];
  }

  function upsertSessionEvidence(profile, evidence, maxSamples = DEFAULT_SETTINGS.maxSamplesPerChannel) {
    const normalized = normalizedEvidence(evidence);
    if (!normalized) return { ...(profile || {}), sessions: sessionsFor(profile) };
    const limit = Math.max(1, Math.floor(Number(maxSamples) || DEFAULT_SETTINGS.maxSamplesPerChannel));
    const sessions = sessionsFor(profile).filter((item) => item.videoId !== normalized.videoId);
    sessions.push(normalized);
    return {
      ...(profile || {}),
      sessions: sessions.slice(-limit)
    };
  }

  function predictionFor(profile, minSamples = DEFAULT_SETTINGS.minSamples) {
    const sessions = sessionsFor(profile);
    if (sessions.length < minSamples) return null;
    return median(sessions.map((item) => item.speed));
  }

  function confidenceFor(profile, minSamples = DEFAULT_SETTINGS.minSamples) {
    const count = sessionsFor(profile).length;
    if (count < minSamples) return "Learning";
    if (count < 5) return "Ready";
    return "High";
  }

  function shouldTrainSession(session) {
    if (!session || session.excluded || session.manualAdjusted !== true) return false;
    const speed = normalizeSpeed(session.stableSpeed);
    if (speed == null || speed === 1) return false;
    if (Number(session.activeSeconds) < 30) return false;
    if (Number(session.stableSeconds) < 20) return false;
    if (Number(session.stableShare) < 0.6) return false;
    return true;
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeSpeed,
    median,
    normalizedEvidence,
    sessionsFor,
    upsertSessionEvidence,
    predictionFor,
    confidenceFor,
    shouldTrainSession
  };

  root.SmartPaceModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
