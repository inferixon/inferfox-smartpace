/* SmartPace options dashboard. */

(function initOptions() {
  "use strict";

  let state = null;

  function setStatus(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message || "";
    element.className = isError ? "status error" : "status";
  }

  function formatSpeed(value) {
    return value == null ? "Learning" : `${Number(value).toFixed(2).replace(/\.00$/, ".0").replace(/0$/, "")}×`;
  }

  function formatUpdated(value) {
    if (!value) return "–";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString();
  }

  function setMode(mode) {
    state.settings.mode = mode === "auto" ? "auto" : "learn";
    for (const button of document.querySelectorAll("[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.settings.mode));
    }
    document.getElementById("modeMetric").textContent = state.settings.mode === "auto" ? "Auto" : "Learn";
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
      const prediction = SmartPaceModel.predictionFor(profile, state.settings.minSamples);
      if (prediction != null) readyCount += 1;

      const row = document.createElement("tr");
      const values = [
        profile.channelName || channelKey,
        formatSpeed(prediction),
        String(Array.isArray(profile.sessionSpeeds) ? profile.sessionSpeeds.length : 0),
        SmartPaceModel.confidenceFor(profile, state.settings.minSamples),
        formatUpdated(profile.updatedAt)
      ];

      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
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
      reset.addEventListener("click", () => void resetProfile(channelKey));
      actionCell.appendChild(reset);
      row.appendChild(actionCell);
      rows.appendChild(row);
    }

    document.getElementById("channelCount").textContent = String(entries.length);
    document.getElementById("readyCount").textContent = String(readyCount);
    document.getElementById("emptyState").classList.toggle("hidden", entries.length > 0);
    document.getElementById("resetAll").disabled = entries.length === 0;
  }

  async function resetProfile(channelKey) {
    delete state.profiles[channelKey];
    state = await SmartPaceStorage.saveState(state);
    renderProfiles();
    setStatus("profileStatus", "Channel profile reset.");
  }

  async function resetAllProfiles() {
    state.profiles = {};
    state = await SmartPaceStorage.saveState(state);
    renderProfiles();
    setStatus("profileStatus", "All channel profiles reset.");
  }

  async function saveSettings() {
    state.settings.globalDefault = SmartPaceModel.normalizeSpeed(document.getElementById("globalDefault").value);
    state = await SmartPaceStorage.saveState(state);
    setStatus("settingsStatus", "Settings saved.");
  }

  async function start() {
    const extensionRuntimeAvailable = typeof chrome !== "undefined" && chrome.runtime?.getManifest;
    document.getElementById("version").textContent = extensionRuntimeAvailable
      ? chrome.runtime.getManifest().version
      : "preview";
    state = extensionRuntimeAvailable
      ? await SmartPaceStorage.loadState()
      : SmartPaceStorage.defaultState();
    setMode(state.settings.mode);
    document.getElementById("globalDefault").value = String(state.settings.globalDefault);
    renderProfiles();

    if (!extensionRuntimeAvailable) {
      document.getElementById("saveSettings").disabled = true;
      setStatus("settingsStatus", "Static preview – persistence requires the Firefox extension runtime.");
      return;
    }

    document.getElementById("modeLearn").addEventListener("click", () => setMode("learn"));
    document.getElementById("modeAuto").addEventListener("click", () => setMode("auto"));
    document.getElementById("saveSettings").addEventListener("click", () => {
      void saveSettings().catch((error) => setStatus("settingsStatus", error.message, true));
    });
    document.getElementById("resetAll").addEventListener("click", () => {
      void resetAllProfiles().catch((error) => setStatus("profileStatus", error.message, true));
    });
  }

  void start().catch((error) => setStatus("settingsStatus", error.message, true));
})();
