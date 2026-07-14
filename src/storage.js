/* SmartPace local storage adapter and schema boundary. */

(function initSmartPaceStorage(root) {
  "use strict";

  const STORAGE_KEY = "smartPaceState";

  function defaultState() {
    return {
      schemaVersion: 1,
      settings: { ...root.SmartPaceModel.DEFAULT_SETTINGS },
      profiles: {}
    };
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result || {});
      });
    });
  }

  function storageSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function normalizeSettings(raw) {
    return {
      minSamples: Math.max(1, Math.floor(Number(raw?.minSamples) || root.SmartPaceModel.DEFAULT_SETTINGS.minSamples)),
      maxSamplesPerChannel: Math.max(1, Math.floor(Number(raw?.maxSamplesPerChannel) || root.SmartPaceModel.DEFAULT_SETTINGS.maxSamplesPerChannel))
    };
  }

  function normalizeProfiles(rawProfiles) {
    const profiles = {};
    if (!rawProfiles || typeof rawProfiles !== "object") return profiles;
    for (const [channelKey, rawProfile] of Object.entries(rawProfiles)) {
      if (!channelKey || !rawProfile || typeof rawProfile !== "object") continue;
      profiles[channelKey] = {
        channelName: String(rawProfile.channelName || channelKey),
        sessions: root.SmartPaceModel.sessionsFor(rawProfile),
        updatedAt: String(rawProfile.updatedAt || "")
      };
    }
    return profiles;
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return defaultState();
    if (raw.schemaVersion !== 1) throw new Error("Unsupported SmartPace storage schema.");
    return {
      schemaVersion: 1,
      settings: normalizeSettings(raw.settings),
      profiles: normalizeProfiles(raw.profiles)
    };
  }

  async function loadState() {
    const stored = await storageGet(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) {
      const state = defaultState();
      await saveState(state);
      return state;
    }
    return normalizeState(stored[STORAGE_KEY]);
  }

  async function saveState(state) {
    const normalized = normalizeState(state);
    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  const api = { STORAGE_KEY, defaultState, normalizeSettings, normalizeProfiles, normalizeState, loadState, saveState };
  root.SmartPaceStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
