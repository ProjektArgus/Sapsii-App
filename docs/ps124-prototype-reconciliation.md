# PS124 prototype reconciliation

This document distinguishes what the current Sapseed + Sapsii prototype demonstrates from capabilities that the problem statement describes but that cannot be inferred reliably from the current detector alone.

## Demonstrable now

| PS124 concern | Prototype implementation | Reliability boundary |
| --- | --- | --- |
| Buses as mobile sensing units | Sapseed processes the built-in Android camera and multiple wireless camera sources; observations carry authenticated device, camera, timestamp, GPS, model, class, confidence and normalized box data. | A production bus installation still needs calibrated camera mounts, power, connectivity and field validation. |
| Road-defect detection | The 21-class model supplies positive sightings including potholes, road damage, cracks, waterlogging, manholes and speed bumps. Exact inference frames can be uploaded as evidence. | These are positive detections, not a complete road-condition score. |
| Fleet-wide reconciliation | Sapsii preserves every accepted raw observation and reconciles eligible defect sightings into candidate or confirmed infrastructure issues using class, distance, GPS uncertainty, confidence, recency and independent devices. | GPS-only matching cannot resolve every adjacent-lane or parallel-road ambiguity. Ambiguous matches intentionally become separate candidates. |
| Bandwidth minimization | Detection runs at the edge. Only structured observations and selected evidence frames are uploaded; retries use a bounded durable queue and idempotent batches. | Adaptive evidence sampling/compression policy remains a deployment concern. |
| GIS dashboard and road-condition map | Raw observations, reconciled issues, fleet positions, issue history and evidence are available on the map. The issue Kanban filters candidate, confirmed, resolved and dismissed maintenance states. | Kanban is used only for infrastructure triage because that directly supports proactive maintenance; it is not presented as an AI capability. |
| Vehicle counting | Five-minute per-device/per-camera windows count distinct tracking IDs. A track that changes predicted class is assigned once using its strongest classification. Raw, unique, untracked and duplicate-tracked totals remain auditable. | This is an approximate count. Reliable flow requires stable tracking, line crossing, direction and calibrated camera coverage. |
| Human review workflow | Issues have optimistic-versioned candidate, confirmed, resolved and dismissed states with an audit log. | Automated work-order integration is not part of the prototype. |

## Designed extension points, not claimed as working conclusions

- **Congestion and bottlenecks:** the UI can visualize vehicle measurements as a heat layer, but true congestion needs calibrated observable road area, direction, stationary duration, road geometry and temporal baselines.
- **Missing dividers, zebra crossings and signboards:** absence cannot be inferred from a detector's lack of a positive detection. It requires an expected-infrastructure inventory, mapped road context and repeated negative evidence.
- **Route delay:** requires route/trip assignment plus schedule or AVL reference data.
- **Road-condition scoring:** requires sampled-road coverage and normalization rather than raw defect totals.
- **School-child crossing risk:** person detection alone does not establish age, crossing context or danger.

## Not implemented by the current model

- Rash-driving and hit-and-run reasoning
- Registration-plate detection/OCR and confidence calibration
- Vehicle re-identification and cross-camera incident tracking
- Origin-destination inference
- Privacy redaction, evidentiary chain of custody and incident-sharing governance

The schema retains derived-event and metadata extension points for these areas, but the prototype does not relabel basic object detections as unsupported conclusions.

## Deduplication and aggregation semantics

1. **Batch replay:** `(device_id, client_batch_id)` stores the canonical request hash and response. An identical retry replays the same result; reuse with different content is rejected.
2. **Observation deduplication:** `(device_id, client_event_id)` accepts a physical edge record once even when it arrives in a later batch.
3. **Infrastructure reconciliation:** one observation can link to only one issue. Eligible unresolved same-class candidates within the PostGIS search radius are scored; weak or ambiguous matches create a new candidate. A second independent device confirms a matched issue. Re-running a job cannot increment the issue twice.
4. **Traffic reconciliation:** one measurement exists per organization/device/camera/five-minute window and is recomputed idempotently. Each tracking ID contributes once across repeated frames and class fluctuations.

## Verification result

A disposable two-device organization was created in the configured PostgreSQL/PostGIS database and removed after the run. The verification confirmed:

- exact semantic batch-response replay;
- duplicate `clientEventId` rejection across different batches;
- retry-safe issue linking;
- two nearby same-class sightings merged into one confirmed issue with two independent devices;
- a distant same-class sighting remained a separate candidate;
- four vehicle detections reconciled to two unique tracks (`car: 1`, `truck: 1`) in one upserted traffic window.

The audit also found and corrected two defects: cumulative issue coordinates were over-weighting old sightings, and a tracking ID that changed predicted class could previously be counted once in each class.
