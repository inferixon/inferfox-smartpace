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

test("normalizes speed to supported range and 0.05 steps", () => {
  assert.equal(model.normalizeSpeed(8), 5);
  assert.equal(model.normalizeSpeed(0.1), 0.5);
  assert.equal(model.normalizeSpeed(2.53), 2.55);
});

test("uses a robust median for odd and even evidence sets", () => {
  assert.equal(model.median([2.5, 2.5, 4, 2.5, 2.5]), 2.5);
  assert.equal(model.median([2, 2.5, 3, 4]), 2.75);
});

test("keeps only the newest bounded session evidence", () => {
  let profile = { sessionSpeeds: [1.5, 2, 2.5] };
  profile = model.appendSessionSpeed(profile, 3, 3);
  assert.deepEqual(profile.sessionSpeeds, [2, 2.5, 3]);
});

test("does not predict before the minimum evidence threshold", () => {
  assert.equal(model.predictionFor({ sessionSpeeds: [2, 2.5] }, 3), null);
  assert.equal(model.predictionFor({ sessionSpeeds: [2, 2.5, 3] }, 3), 2.5);
});

test("classifies presentation confidence without storing it", () => {
  assert.equal(model.confidenceFor({ sessionSpeeds: [2, 2.5] }, 3), "Learning");
  assert.equal(model.confidenceFor({ sessionSpeeds: [2, 2.5, 3] }, 3), "Ready");
  assert.equal(model.confidenceFor({ sessionSpeeds: [2, 2.5, 3, 3, 3] }, 3), "High");
});

test("accepts only stable meaningful non-excluded sessions", () => {
  const valid = { stableSpeed: 2.5, activeSeconds: 60, stableSeconds: 35, stableShare: 0.58, viewedFraction: 0.2 };
  assert.equal(model.shouldTrainSession(valid), true);
  assert.equal(model.shouldTrainSession({ ...valid, stableSpeed: 1 }), false);
  assert.equal(model.shouldTrainSession({ ...valid, stableSeconds: 10 }), false);
  assert.equal(model.shouldTrainSession({ ...valid, excluded: true }), false);
});
