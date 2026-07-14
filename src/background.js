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
    await SmartPaceStorage.saveState(state);
    return { ok: true };
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
  }

  if (!operation) return false;
  operation
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
