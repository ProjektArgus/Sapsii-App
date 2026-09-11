import { describe, expect, it } from "vitest";
import { combineIssueLocation, scoreIssueCandidate, shouldAttachCandidate } from "../src/modules/aggregation/match-score.js";

describe("issue match scoring", () => {
  it("favours a close independent high-confidence sighting", () => {
    const score = scoreIssueCandidate({
      distanceMeters: 4,
      observationAccuracyMeters: 6,
      issueAccuracyMeters: 6,
      confidence: 0.92,
      ageDays: 1,
      independentDevice: true,
    });
    expect(score).toBeGreaterThan(0.72);
    expect(shouldAttachCandidate([score])).toBe(true);
  });

  it("does not merge distant or ambiguous candidates", () => {
    const distant = scoreIssueCandidate({
      distanceMeters: 35,
      observationAccuracyMeters: 5,
      issueAccuracyMeters: 5,
      confidence: 0.95,
      ageDays: 1,
      independentDevice: true,
    });
    expect(shouldAttachCandidate([distant])).toBe(false);
    expect(shouldAttachCandidate([0.82, 0.76])).toBe(false);
  });

  it("updates the centroid by cumulative uncertainty without double-counting old sightings", () => {
    const first = combineIssueLocation({
      issueLongitude: 0,
      issueLatitude: 0,
      issueAccuracyMeters: 10,
      observationLongitude: 2,
      observationLatitude: 2,
      observationAccuracyMeters: 10,
    });
    const second = combineIssueLocation({
      issueLongitude: first.longitude,
      issueLatitude: first.latitude,
      issueAccuracyMeters: first.accuracyMeters,
      observationLongitude: 4,
      observationLatitude: 4,
      observationAccuracyMeters: 10,
    });

    expect(first.longitude).toBeCloseTo(1);
    expect(second.longitude).toBeCloseTo(2);
    expect(second.latitude).toBeCloseTo(2);
    expect(second.accuracyMeters).toBeCloseTo(10 / Math.sqrt(3));
  });
});
