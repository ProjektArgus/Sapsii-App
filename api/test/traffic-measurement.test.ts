import { describe, expect, it } from "vitest";
import { summarizeVehicleWindow } from "../src/modules/aggregation/traffic-measurement-handler.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));

describe("traffic measurement reconciliation", () => {
  it("counts each tracking ID once across repeated frames", () => {
    const summary = summarizeVehicleWindow([
      { className: "car", confidence: 0.8, trackingId: "track-a", capturedAt: at(1) },
      { className: "car", confidence: 0.9, trackingId: "track-a", capturedAt: at(2) },
      { className: "truck", confidence: 0.85, trackingId: "track-b", capturedAt: at(3) },
    ]);

    expect(summary.vehicleCounts).toEqual({ car: 1, truck: 1 });
    expect(summary.rawDetectionCount).toBe(3);
    expect(summary.uniqueTrackCount).toBe(2);
    expect(summary.duplicateTrackedDetectionCount).toBe(1);
    expect(summary.untrackedDetectionCount).toBe(0);
  });

  it("reconciles class changes using the strongest observation of a track", () => {
    const summary = summarizeVehicleWindow([
      { className: "bus", confidence: 0.55, trackingId: "track-a", capturedAt: at(1) },
      { className: "car", confidence: 0.92, trackingId: "track-a", capturedAt: at(2) },
      { className: "motorcycle", confidence: 0.8, trackingId: null, capturedAt: at(3) },
    ]);

    expect(summary.vehicleCounts).toEqual({ car: 1 });
    expect(summary.uniqueTrackCount).toBe(1);
    expect(summary.untrackedDetectionCount).toBe(1);
    expect(summary.duplicateTrackedDetectionCount).toBe(1);
  });
});
