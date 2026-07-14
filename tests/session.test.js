"use strict";

const assert = require("node:assert/strict");
const sessionModel = require("../src/session.js");

function test(name, run) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("ignores playback before the user manually adjusts speed", () => {
  const session = sessionModel.createSession("video-a");
  sessionModel.recordPlayback(session, 1, 12);
  assert.equal(sessionModel.buildEvidence(session), null);
});

test("builds one duration-weighted stable-speed snapshot", () => {
  const session = sessionModel.createSession("video-a");
  sessionModel.markManualAdjustment(session);
  sessionModel.recordPlayback(session, 2, 8);
  sessionModel.recordPlayback(session, 2.5, 24);
  const evidence = sessionModel.buildEvidence(session);
  assert.equal(evidence.videoId, "video-a");
  assert.equal(evidence.stableSpeed, 2.5);
  assert.equal(evidence.activeSeconds, 32);
  assert.equal(evidence.stableSeconds, 24);
  assert.equal(evidence.stableShare, 0.75);
  assert.equal(evidence.manualAdjusted, true);
});

test("updates the same session snapshot as viewing continues", () => {
  const session = sessionModel.createSession("video-a");
  sessionModel.markManualAdjustment(session);
  sessionModel.recordPlayback(session, 2, 20);
  sessionModel.recordPlayback(session, 3, 25);
  assert.equal(sessionModel.buildEvidence(session).stableSpeed, 3);
  sessionModel.recordPlayback(session, 2, 20);
  assert.equal(sessionModel.buildEvidence(session).stableSpeed, 2);
});
