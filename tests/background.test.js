"use strict";

const assert = require("node:assert/strict");

const stored = {};
let messageListener = null;

globalThis.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: "0.2.4-test" }),
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      }
    }
  },
  storage: {
    local: {
      get(key, callback) {
        callback({ [key]: stored[key] });
      },
      set(items, callback) {
        Object.assign(stored, items);
        callback();
      }
    }
  }
};

globalThis.SmartPaceModel = require("../src/model.js");
globalThis.SmartPaceController = require("../src/controller.js");
globalThis.SmartPaceStorage = require("../src/storage.js");
require("../src/background.js");

function send(message) {
  return new Promise((resolve) => {
    const keepAlive = messageListener(message, {}, resolve);
    assert.equal(keepAlive, true);
  });
}

async function test(name, run) {
  try {
    await run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  await test("exports and imports a backup through the serialized background flow", async () => {
    await globalThis.SmartPaceStorage.saveState({
      schemaVersion: 1,
      settings: { wheelStep: 0.1 },
      profiles: {}
    });

    const exported = await send({ type: "backup.export" });
    assert.equal(exported.ok, true);
    assert.equal(exported.payload.kind, "inferfox-smartpace-backup");
    assert.equal(exported.payload.extensionVersion, "0.2.4-test");

    const backup = globalThis.SmartPaceStorage.createBackup({
      schemaVersion: 1,
      settings: { wheelStep: 0.25 },
      profiles: {
        "handle:@example": {
          channelName: "Example",
          sessions: [{ videoId: "video-a", speed: 2, observedAt: "2026-07-15T12:00:00.000Z" }],
          updatedAt: "2026-07-15T12:00:00.000Z"
        }
      }
    });
    const imported = await send({ type: "backup.import", payload: backup });
    assert.deepEqual(imported, { ok: true, profileCount: 1 });

    const state = await globalThis.SmartPaceStorage.loadState();
    assert.equal(state.settings.wheelStep, 0.25);
    assert.equal(state.profiles["handle:@example"].sessions.length, 1);
  });

  await test("rejects an invalid backup without replacing existing state", async () => {
    const before = JSON.stringify(await globalThis.SmartPaceStorage.loadState());
    const response = await send({
      type: "backup.import",
      payload: { kind: "inferfox-smartpace-backup", schemaVersion: 2, state: {} }
    });
    assert.equal(response.ok, false);
    assert.match(response.error, /Unsupported SmartPace backup schema/);
    assert.equal(JSON.stringify(await globalThis.SmartPaceStorage.loadState()), before);
  });

  await test("reset invalidates evidence captured by already-open video tabs", async () => {
    await globalThis.SmartPaceStorage.saveState({
      schemaVersion: 1,
      resetRevision: 0,
      settings: { wheelStep: 0.1 },
      profiles: {
        "handle:@example": {
          channelName: "Example",
          sessions: [{ videoId: "old-video", speed: 1.5, observedAt: "2026-07-16T12:00:00.000Z" }]
        }
      }
    });

    assert.equal((await send({ type: "profiles.reset", channelKey: "" })).ok, true);
    const stale = await send({
      type: "session.upsert",
      channelKey: "handle:@example",
      channelName: "Example",
      resetRevision: 0,
      evidence: { videoId: "old-video", stableSpeed: 1.5, activeSeconds: 60, stableSeconds: 60, stableShare: 1 }
    });
    assert.equal(stale.stored, false);
    const state = await globalThis.SmartPaceStorage.loadState();
    assert.equal(state.resetRevision, 1);
    assert.deepEqual(state.profiles, {});
  });

  await test("learn current speed creates an explicit manual profile immediately", async () => {
    await globalThis.SmartPaceStorage.saveState({
      schemaVersion: 1,
      settings: { wheelStep: 0.1 },
      profiles: {}
    });

    const response = await send({
      type: "profile.learnCurrentSpeed",
      channelKey: "handle:@example",
      channelName: "Example",
      speed: 2.25
    });
    assert.deepEqual(response, { ok: true, stored: true, speed: 2.25 });
    const state = await globalThis.SmartPaceStorage.loadState();
    assert.equal(state.profiles["handle:@example"].manualSpeed, 2.25);
    assert.equal(globalThis.SmartPaceModel.predictionFor(state.profiles["handle:@example"], 3), 2.25);
  });
}

void main();
