/* Background-owned SmartPace profile reads and mutations. */

/* global SmartPaceModel, SmartPaceStorage */

let writeQueue = Promise.resolve();

async function profilePrediction(channelKey) {
  const state = await SmartPaceStorage.loadState();
  const profile = state.profiles[channelKey] || null;
  return {
    profile,
    prediction: SmartPaceModel.predictionFor(profile, state.settings.minSamples)
  };
}

function enqueueWrite(action) {
  writeQueue = writeQueue.then(action, action);
  return writeQueue;
}

async function upsertEvidence(message) {
  if (!message.channelKey || !SmartPaceModel.shouldTrainSession(message.evidence)) {
    return { ok: true, stored: false };
  }
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.loadState();
    const sessionRevision = Number.isSafeInteger(Number(message.resetRevision))
      ? Number(message.resetRevision)
      : 0;
    if (sessionRevision !== state.resetRevision) return { ok: true, stored: false };
    const previous = state.profiles[message.channelKey] || {};
    const next = SmartPaceModel.upsertSessionEvidence(
      previous,
      {
        videoId: message.evidence.videoId,
        speed: message.evidence.stableSpeed,
        observedAt: new Date().toISOString()
      },
      state.settings.maxSamplesPerChannel
    );
    state.profiles[message.channelKey] = {
      ...next,
      channelName: String(message.channelName || previous.channelName || message.channelKey),
      updatedAt: new Date().toISOString()
    };
    await SmartPaceStorage.saveState(state);
    return {
      ok: true,
      stored: true,
      prediction: SmartPaceModel.predictionFor(state.profiles[message.channelKey], state.settings.minSamples)
    };
  });
}

async function resetProfiles(channelKey) {
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.loadState();
    if (channelKey) delete state.profiles[channelKey];
    else state.profiles = {};
    state.resetRevision += 1;
    await SmartPaceStorage.saveState(state);
    return { ok: true };
  });
}

async function saveSettings(message) {
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.loadState();
    state.settings = SmartPaceStorage.normalizeSettings({
      ...state.settings,
      wheelStep: message.wheelStep
    });
    await SmartPaceStorage.saveState(state);
    return { ok: true, settings: state.settings };
  });
}

async function learnCurrentSpeed(message) {
  const speed = SmartPaceModel.normalizeSpeed(message.speed);
  if (!message.channelKey || speed == null) return { ok: true, stored: false };
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.loadState();
    const previous = state.profiles[message.channelKey] || {};
    state.profiles[message.channelKey] = {
      ...previous,
      channelName: String(message.channelName || previous.channelName || message.channelKey),
      manualSpeed: speed,
      updatedAt: new Date().toISOString()
    };
    await SmartPaceStorage.saveState(state);
    return { ok: true, stored: true, speed };
  });
}

async function exportBackup() {
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.loadState();
    return {
      payload: SmartPaceStorage.createBackup(state, {
        extensionVersion: chrome.runtime.getManifest().version
      })
    };
  });
}

async function importBackup(message) {
  const importedState = SmartPaceStorage.stateFromBackup(message.payload);
  return enqueueWrite(async () => {
    const state = await SmartPaceStorage.saveState(importedState);
    return { ok: true, profileCount: Object.keys(state.profiles).length };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let operation = null;
  if (message?.type === "profile.get") {
    operation = profilePrediction(String(message.channelKey || ""));
  } else if (message?.type === "session.upsert") {
    operation = upsertEvidence(message);
  } else if (message?.type === "profiles.reset") {
    operation = resetProfiles(String(message.channelKey || ""));
  } else if (message?.type === "settings.save") {
    operation = saveSettings(message);
  } else if (message?.type === "profile.learnCurrentSpeed") {
    operation = learnCurrentSpeed(message);
  } else if (message?.type === "backup.export") {
    operation = exportBackup();
  } else if (message?.type === "backup.import") {
    operation = importBackup(message);
  }

  if (!operation) return false;
  operation
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
