"use strict";

const assert = require("node:assert/strict");
globalThis.SmartPaceModel = require("../src/model.js");
globalThis.SmartPaceController = require("../src/controller.js");
const storage = require("../src/storage.js");

function test(name, run) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("default state contains no mode or global fallback speed", () => {
  const state = storage.defaultState();
  assert.deepEqual(state.settings, { minSamples: 3, maxSamplesPerChannel: 10, wheelStep: 0.1 });
  assert.equal("mode" in state.settings, false);
  assert.equal("globalDefault" in state.settings, false);
});

test("normalizer removes obsolete UI settings and migrates numeric evidence", () => {
  const state = storage.normalizeState({
    schemaVersion: 1,
    settings: { obsoleteMode: "legacy", obsoleteFallback: 3, minSamples: 3, maxSamplesPerChannel: 10, wheelStep: 0.33 },
    profiles: {
      "channelId:UCexample12345": {
        channelName: "Example",
        sessionSpeeds: [2, 2.5, 3],
        updatedAt: "2026-07-15T12:00:00.000Z"
      }
    }
  });
  assert.deepEqual(state.settings, { minSamples: 3, maxSamplesPerChannel: 10, wheelStep: 0.35 });
  assert.deepEqual(
    state.profiles["channelId:UCexample12345"].sessions.map((item) => item.speed),
    [2, 2.5, 3]
  );
});
