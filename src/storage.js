/* SmartPace local storage adapter and schema boundary. */

(function initSmartPaceStorage(root) {
  "use strict";

  const STORAGE_KEY = "smartPaceState";
  const BACKUP_KIND = "inferfox-smartpace-backup";

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
      minSamples: root.SmartPaceModel.DEFAULT_SETTINGS.minSamples,
      maxSamplesPerChannel: root.SmartPaceModel.DEFAULT_SETTINGS.maxSamplesPerChannel,
      wheelStep: root.SmartPaceController.normalizeWheelStep(raw?.wheelStep)
    };
  }

  function validChannelKey(channelKey) {
    return /^channelId:UC[0-9A-Za-z_-]{10,}$/.test(channelKey)
      || /^handle:@[0-9A-Za-z._-]+$/.test(channelKey);
  }

  function normalizedSessions(rawProfile) {
    let profile = { sessions: [] };
    for (const session of root.SmartPaceModel.sessionsFor(rawProfile)) {
      profile = root.SmartPaceModel.upsertSessionEvidence(
        profile,
        session,
        root.SmartPaceModel.DEFAULT_SETTINGS.maxSamplesPerChannel
      );
    }
    return profile.sessions;
  }

  function normalizeProfiles(rawProfiles) {
    const profiles = {};
    if (!rawProfiles || typeof rawProfiles !== "object") return profiles;
    for (const [channelKey, rawProfile] of Object.entries(rawProfiles)) {
      if (!validChannelKey(channelKey) || !rawProfile || typeof rawProfile !== "object") continue;
      profiles[channelKey] = {
        channelName: String(rawProfile.channelName || channelKey).slice(0, 200),
        sessions: normalizedSessions(rawProfile),
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

  function createBackup(state, metadata = {}) {
    const normalized = normalizeState(state);
    return {
      kind: BACKUP_KIND,
      schemaVersion: normalized.schemaVersion,
      exportedAt: String(metadata.exportedAt || new Date().toISOString()),
      extensionVersion: String(metadata.extensionVersion || ""),
      state: normalized
    };
  }

  function stateFromBackup(payload) {
    if (!payload || typeof payload !== "object" || payload.kind !== BACKUP_KIND) {
      throw new Error("Import JSON is not an Inferfox SmartPace backup.");
    }
    if (payload.schemaVersion !== 1) throw new Error("Unsupported SmartPace backup schema.");
    if (!payload.state || typeof payload.state !== "object" || Array.isArray(payload.state)) {
      throw new Error("Backup must contain a SmartPace state object.");
    }
    return normalizeState(payload.state);
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

  const api = {
    STORAGE_KEY,
    BACKUP_KIND,
    defaultState,
    normalizeSettings,
    normalizeProfiles,
    normalizeState,
    createBackup,
    stateFromBackup,
    loadState,
    saveState
  };
  root.SmartPaceStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
