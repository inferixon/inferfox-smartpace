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
  assert.equal(state.resetRevision, 0);
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

test("exports and restores a versioned SmartPace backup", () => {
  const backup = storage.createBackup({
    schemaVersion: 1,
    settings: { wheelStep: 0.25 },
    profiles: {
      "handle:@example": {
        channelName: "Example",
        sessions: [
          { videoId: "video-a", speed: 2, observedAt: "2026-07-15T12:00:00.000Z" }
        ],
        updatedAt: "2026-07-15T12:00:00.000Z"
      }
    }
  }, {
    exportedAt: "2026-07-15T13:00:00.000Z",
    extensionVersion: "0.2.4"
  });

  assert.equal(backup.kind, "inferfox-smartpace-backup");
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.extensionVersion, "0.2.4");
  assert.equal(backup.state.settings.wheelStep, 0.25);
  assert.deepEqual(storage.stateFromBackup(backup), backup.state);
});

test("rejects a mismatched or future backup before any state replacement", () => {
  assert.throws(
    () => storage.stateFromBackup({ kind: "some-other-backup", schemaVersion: 1, state: storage.defaultState() }),
    /not an Inferfox SmartPace backup/
  );
  assert.throws(
    () => storage.stateFromBackup({ kind: "inferfox-smartpace-backup", schemaVersion: 2, state: storage.defaultState() }),
    /Unsupported SmartPace backup schema/
  );
  assert.throws(
    () => storage.stateFromBackup({ kind: "inferfox-smartpace-backup", schemaVersion: 1, state: null }),
    /must contain a SmartPace state object/
  );
});

test("normalizes imported profiles to valid bounded SmartPace evidence", () => {
  const sessions = Array.from({ length: 12 }, (_, index) => ({
    videoId: `video-${index}`,
    speed: 1.5 + index / 10,
    observedAt: `2026-07-15T12:${String(index).padStart(2, "0")}:00.000Z`
  }));
  const state = storage.stateFromBackup({
    kind: "inferfox-smartpace-backup",
    schemaVersion: 1,
    state: {
      schemaVersion: 1,
      settings: { wheelStep: 0.25 },
      profiles: {
        "handle:@valid": { channelName: "Valid", sessions, updatedAt: "2026-07-15T12:00:00.000Z" },
        "handle:@обманутыйроссиянин": { channelName: "Unicode handle", sessions, updatedAt: "2026-07-15T12:00:00.000Z" },
        "untrusted:channel": { channelName: "Ignore", sessions, updatedAt: "2026-07-15T12:00:00.000Z" }
      }
    }
  });

  assert.equal(state.settings.wheelStep, 0.25);
  assert.equal(state.profiles["handle:@valid"].sessions.length, 10);
  assert.equal(state.profiles["handle:@обманутыйроссиянин"].sessions.length, 10);
  assert.equal(state.profiles["untrusted:channel"], undefined);
});

test("keeps only the newest imported sample for a duplicate video ID", () => {
  const state = storage.stateFromBackup({
    kind: "inferfox-smartpace-backup",
    schemaVersion: 1,
    state: {
      schemaVersion: 1,
      settings: {},
      profiles: {
        "handle:@valid": {
          channelName: "Valid",
          sessions: [
            { videoId: "same-video", speed: 1.5, observedAt: "2026-07-15T12:00:00.000Z" },
            { videoId: "same-video", speed: 2, observedAt: "2026-07-15T12:10:00.000Z" }
          ]
        }
      }
    }
  });

  assert.deepEqual(state.profiles["handle:@valid"].sessions, [
    { videoId: "same-video", speed: 2, observedAt: "2026-07-15T12:10:00.000Z" }
  ]);
});

test("preserves an explicit manual speed without treating it as session evidence", () => {
  const state = storage.normalizeState({
    schemaVersion: 1,
    settings: {},
    profiles: {
      "handle:@manual": { channelName: "Manual", manualSpeed: 1, sessions: [] }
    }
  });

  assert.equal(state.profiles["handle:@manual"].manualSpeed, 1);
  assert.deepEqual(state.profiles["handle:@manual"].sessions, []);
});
