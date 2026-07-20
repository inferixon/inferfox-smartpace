/* Pure duration-weighted viewing-session accumulator. */

(function initSmartPaceSession(root) {
  "use strict";

  function normalizeRate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(Math.min(5, Math.max(0.5, numeric)) * 20) / 20;
  }

  function createSession(videoId) {
    return {
      videoId: String(videoId || ""),
      manualAdjusted: false,
      buckets: Object.create(null)
    };
  }

  function markManualAdjustment(session) {
    if (!session.manualAdjusted) session.buckets = Object.create(null);
    session.manualAdjusted = true;
  }

  function recordPlayback(session, rate, seconds) {
    if (!session?.manualAdjusted) return;
    const normalizedRate = normalizeRate(rate);
    const duration = Number(seconds);
    if (normalizedRate == null || !Number.isFinite(duration) || duration <= 0) return;
    const key = String(normalizedRate);
    session.buckets[key] = Number(session.buckets[key] || 0) + duration;
  }

  function buildEvidence(session) {
    if (!session?.manualAdjusted) return null;
    const buckets = Object.entries(session.buckets || {})
      .map(([rate, seconds]) => ({ rate: Number(rate), seconds: Number(seconds) }))
      .filter((item) => Number.isFinite(item.rate) && Number.isFinite(item.seconds) && item.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds || b.rate - a.rate);
    if (!buckets.length) return null;
    const activeSeconds = buckets.reduce((sum, item) => sum + item.seconds, 0);
    const stable = buckets[0];
    return {
      videoId: session.videoId,
      manualAdjusted: true,
      stableSpeed: stable.rate,
      activeSeconds: Math.round(activeSeconds * 100) / 100,
      stableSeconds: Math.round(stable.seconds * 100) / 100,
      stableShare: Math.round((stable.seconds / activeSeconds) * 1000) / 1000
    };
  }

  function shouldPersistEvidence(previous, evidence, intervalSeconds = 60, final = false) {
    if (!evidence) return false;
    if (!previous) return true;
    if (previous.stableSpeed !== evidence.stableSpeed) return true;
    if (Number(evidence.stableSeconds) >= Number(previous.stableSeconds) + intervalSeconds) return true;
    return final && Number(evidence.stableSeconds) > Number(previous.stableSeconds);
  }

  const api = { createSession, markManualAdjustment, recordPlayback, buildEvidence, shouldPersistEvidence };
  root.SmartPaceSession = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
