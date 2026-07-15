/* SmartPace profile dashboard. */

(function initOptions() {
  "use strict";

  let state = null;
  let savedWheelStep = null;
  const MAX_BACKUP_BYTES = 1024 * 1024;

  function setStatus(message, isError = false) {
    const element = document.getElementById("profileStatus");
    element.textContent = message || "";
    element.className = isError ? "status error" : "status";
  }

  function setSettingsStatus(message, isError = false) {
    const element = document.getElementById("settingsStatus");
    element.textContent = message || "";
    element.className = isError ? "status error" : "status";
  }

  function setBackupStatus(message, isError = false) {
    const element = document.getElementById("backupStatus");
    element.textContent = message || "";
    element.className = isError ? "status error" : "status";
  }

  function runtimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!response?.ok) reject(new Error(response?.error || "SmartPace request failed."));
        else resolve(response);
      });
    });
  }

  function updateWheelStepDirty() {
    const input = document.getElementById("wheelStep");
    const button = document.getElementById("saveWheelStep");
    const rawValue = String(input.value || "").trim();
    const validValue = rawValue !== "" && input.validity.valid;
    const dirty = validValue && SmartPaceController.normalizeWheelStep(rawValue) !== savedWheelStep;
    button.disabled = !dirty;
    button.classList.toggle("pending", dirty);
  }

  function formatSpeed(value) {
    return value == null ? "Learning" : `${Number(value).toFixed(2)}×`;
  }

  function formatUpdated(value) {
    if (!value) return "–";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString();
  }

  function channelUrlForKey(key) {
    const channelId = String(key || "").match(/^channelId:(UC[0-9A-Za-z_-]{10,})$/);
    if (channelId) return `https://www.youtube.com/channel/${channelId[1]}`;
    const handle = String(key || "").match(/^handle:(@[0-9A-Za-z._-]+)$/);
    return handle ? `https://www.youtube.com/${handle[1]}` : "";
  }

  function profileEntries() {
    return Object.entries(state?.profiles || {}).sort(([, a], [, b]) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
  }

  function renderProfiles() {
    const rows = document.getElementById("profileRows");
    const entries = profileEntries();
    rows.textContent = "";
    let readyCount = 0;

    for (const [channelKey, profile] of entries) {
      const sessions = SmartPaceModel.sessionsFor(profile);
      const prediction = SmartPaceModel.predictionFor(profile, state.settings.minSamples);
      if (prediction != null) readyCount += 1;
      const row = document.createElement("tr");
      const values = [
        profile.channelName || channelKey,
        formatSpeed(prediction),
        String(sessions.length),
        SmartPaceModel.confidenceFor(profile, state.settings.minSamples),
        formatUpdated(profile.updatedAt)
      ];

      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 0) {
          const channelUrl = channelUrlForKey(channelKey);
          if (channelUrl) {
            const link = document.createElement("a");
            link.className = "channel-link";
            link.href = channelUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = value;
            cell.textContent = "";
            cell.appendChild(link);
          }
        }
        if (index === 1) cell.className = "speed";
        if (index === 3) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = value;
          cell.textContent = "";
          cell.appendChild(badge);
        }
        row.appendChild(cell);
      });

      const actionCell = document.createElement("td");
      actionCell.className = "action-col";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "danger";
      reset.textContent = "Reset";
      reset.title = `Reset ${profile.channelName || channelKey}`;
      reset.addEventListener("click", () => void resetProfiles(channelKey));
      actionCell.appendChild(reset);
      row.appendChild(actionCell);
      rows.appendChild(row);
    }

    document.getElementById("channelCount").textContent = String(entries.length);
    document.getElementById("readyCount").textContent = String(readyCount);
    document.getElementById("emptyState").classList.toggle("hidden", entries.length > 0);
    document.getElementById("resetAll").disabled = entries.length === 0;
  }

  async function reloadState() {
    state = await SmartPaceStorage.loadState();
    savedWheelStep = state.settings.wheelStep;
    document.getElementById("wheelStep").value = String(state.settings.wheelStep);
    updateWheelStepDirty();
    renderProfiles();
  }

  async function saveWheelStep() {
    const input = document.getElementById("wheelStep");
    const wheelStep = SmartPaceController.normalizeWheelStep(input.value);
    document.getElementById("saveWheelStep").disabled = true;
    await runtimeMessage({ type: "settings.save", wheelStep });
    await reloadState();
    setSettingsStatus(`Wheel step applied: ${state.settings.wheelStep}×.`);
  }

  async function exportBackup() {
    const response = await runtimeMessage({ type: "backup.export" });
    const blob = new Blob([JSON.stringify(response.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inferfox-smartpace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setBackupStatus("Exported SmartPace backup.");
  }

  async function importBackupFile(file) {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup file must be 1 MB or smaller.");
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      throw new Error("Backup file is not valid JSON.");
    }
    const response = await runtimeMessage({ type: "backup.import", payload });
    await reloadState();
    const count = Number(response.profileCount) || 0;
    setBackupStatus(`Imported ${count} channel profile${count === 1 ? "" : "s"}.`);
  }

  async function resetProfiles(channelKey = "") {
    await runtimeMessage({ type: "profiles.reset", channelKey });
    await reloadState();
    setStatus(channelKey ? "Channel profile reset." : "All channel profiles reset.");
  }

  async function start() {
    const extensionRuntimeAvailable = typeof chrome !== "undefined" && chrome.runtime?.getManifest;
    document.getElementById("version").textContent = extensionRuntimeAvailable
      ? chrome.runtime.getManifest().version
      : "preview";
    state = extensionRuntimeAvailable
      ? await SmartPaceStorage.loadState()
      : SmartPaceStorage.defaultState();
    savedWheelStep = state.settings.wheelStep;
    document.getElementById("wheelStep").value = String(state.settings.wheelStep);
    updateWheelStepDirty();
    renderProfiles();
    if (!extensionRuntimeAvailable) return;

    document.getElementById("resetAll").addEventListener("click", () => {
      void resetProfiles().catch((error) => setStatus(error.message, true));
    });
    document.getElementById("saveWheelStep").addEventListener("click", () => {
      void saveWheelStep().catch((error) => {
        setSettingsStatus(error.message, true);
        updateWheelStepDirty();
      });
    });
    document.getElementById("wheelStep").addEventListener("input", updateWheelStepDirty);
    document.getElementById("exportBackup").addEventListener("click", () => {
      void exportBackup().catch((error) => setBackupStatus(error.message, true));
    });
    document.getElementById("importBackup").addEventListener("click", () => {
      document.getElementById("importBackupFile").click();
    });
    document.getElementById("importBackupFile").addEventListener("change", (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      void importBackupFile(file).catch((error) => setBackupStatus(error.message, true));
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[SmartPaceStorage.STORAGE_KEY]) {
        void reloadState().catch((error) => setStatus(error.message, true));
      }
    });
  }

  void start().catch((error) => setStatus(error.message, true));
})();
