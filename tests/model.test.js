"use strict";

const assert = require("node:assert/strict");
const model = require("../src/model.js");

function test(name, run) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("normalizes valid speeds and rejects non-numeric input", () => {
  assert.equal(model.normalizeSpeed(8), 5);
  assert.equal(model.normalizeSpeed(0.1), 0.5);
  assert.equal(model.normalizeSpeed(2.53), 2.55);
  assert.equal(model.normalizeSpeed("no speed"), null);
});

test("uses a robust median over session evidence", () => {
  const profile = {
    sessions: [
      { videoId: "a", speed: 2.5 },
      { videoId: "b", speed: 2.5 },
      { videoId: "c", speed: 4 },
      { videoId: "d", speed: 2.5 },
      { videoId: "e", speed: 2.5 }
    ]
  };
  assert.equal(model.predictionFor(profile, 3), 2.5);
});

test("does not predict before the minimum evidence threshold", () => {
  const profile = { sessions: [{ videoId: "a", speed: 2 }, { videoId: "b", speed: 2.5 }] };
  assert.equal(model.predictionFor(profile, 3), null);
});

test("upserts one sample per video and keeps the newest bounded evidence", () => {
  let profile = { sessions: [] };
  profile = model.upsertSessionEvidence(profile, { videoId: "a", speed: 2, observedAt: "2026-07-15T10:00:00Z" }, 3);
  profile = model.upsertSessionEvidence(profile, { videoId: "b", speed: 2.5, observedAt: "2026-07-15T10:01:00Z" }, 3);
  profile = model.upsertSessionEvidence(profile, { videoId: "a", speed: 3, observedAt: "2026-07-15T10:02:00Z" }, 3);
  assert.deepEqual(profile.sessions.map((item) => [item.videoId, item.speed]), [["b", 2.5], ["a", 3]]);

  profile = model.upsertSessionEvidence(profile, { videoId: "c", speed: 3.5, observedAt: "2026-07-15T10:03:00Z" }, 2);
  assert.deepEqual(profile.sessions.map((item) => item.videoId), ["a", "c"]);
});

test("requires a manual, stable, meaningful session", () => {
  const valid = {
    manualAdjusted: true,
    stableSpeed: 2.5,
    activeSeconds: 35,
    stableSeconds: 24,
    stableShare: 0.69
  };
  assert.equal(model.shouldTrainSession(valid), true);
  assert.equal(model.shouldTrainSession({ ...valid, manualAdjusted: false }), false);
  assert.equal(model.shouldTrainSession({ ...valid, stableSpeed: 1 }), false);
  assert.equal(model.shouldTrainSession({ ...valid, stableSeconds: 10 }), false);
  assert.equal(model.shouldTrainSession({ ...valid, excluded: true }), false);
});

test("derives profile status from evidence or an explicit manual speed", () => {
  const sessions = ["a", "b", "c", "d", "e"].map((videoId) => ({ videoId, speed: 2.5 }));
  assert.equal(model.profileStatusFor({ sessions: sessions.slice(0, 2) }, 3), "Learning");
  assert.equal(model.profileStatusFor({ sessions: sessions.slice(0, 3) }, 3), "Ready");
  assert.equal(model.profileStatusFor({ sessions }, 3), "Established");
  assert.equal(model.profileStatusFor({ manualSpeed: 1, sessions: [] }, 3), "Manual");
  assert.equal(model.predictionFor({ manualSpeed: 1, sessions: [] }, 3), 1);
});
