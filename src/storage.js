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

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return defaultState();
    if (raw.schemaVersion !== 1) throw new Error("Unsupported SmartPace storage schema.");
    return {
      schemaVersion: 1,
      settings: { ...root.SmartPaceModel.DEFAULT_SETTINGS, ...(raw.settings || {}) },
      profiles: raw.profiles && typeof raw.profiles === "object" ? raw.profiles : {}
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

  root.SmartPaceStorage = { STORAGE_KEY, defaultState, normalizeState, loadState, saveState };
})(typeof globalThis !== "undefined" ? globalThis : this);
