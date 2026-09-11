# Sapsii ingestion contract v1

Status: proposed Stage 2 contract

## Taxonomy

The transport contract distinguishes what the edge directly observed from what Sapsii later concludes.

### Raw observation

An immutable fact emitted by an edge sensor. Version 1 accepts `object_detection` observations from the current YOLO model. The detector class is one of:

```text
0 person                 11 damaged_road
1 bicycle                12 waterlogging
2 motorcycle             13 manhole
3 autorickshaw           14 traffic_sign
4 car                    15 traffic_light
5 bus                    16 zebra_crossing
6 truck                  17 road_divider
7 pothole                18 animal
8 longitudinal_crack     19 speed_bump
9 transverse_crack       20 unsurfaced_road
10 alligator_crack
```

A positive `zebra_crossing`, `road_divider`, or `traffic_sign` observation means the object was seen. It never means nearby infrastructure is complete, damaged, or missing.

### Derived event

A higher-level, time-bounded conclusion produced by a declared rule/model, such as an incident or vulnerable-pedestrian alert. It records derivation version and source observations. Current object detections do not directly create rash-driving, hit-and-run, congestion, OCR, or missing-infrastructure events.

### Infrastructure issue

A persistent logical condition at a location, such as one pothole observed on multiple passes. Issues have candidate/confirmed/resolved/dismissed lifecycle and retain links to every supporting observation.

### Traffic measurement

A time-window aggregate with vehicle class counts plus methodology and quality fields. A raw number of frame detections is not automatically a vehicle count.

## Endpoint

```http
POST /v1/ingestion/batches
Authorization: Device <credential-id>.<secret>
Content-Type: application/json
Idempotency-Key: 018f247c-7cc1-7ea9-aec2-47e1295f90df
```

`Idempotency-Key` equals `batchId`. Device identity and organization are derived from the credential. The request deliberately has no trusted `deviceId` field.

### Limits

- Maximum 100 observations per batch
- Maximum 1 MiB JSON body
- UUID/ULID identifiers no longer than 64 characters
- Metadata: at most 32 keys; keys at most 64 characters; encoded value at most 2 KiB
- Timestamp no earlier than 2020-01-01 and no more than 10 minutes ahead of server time
- Latitude `[-90, 90]`, longitude `[-180, 180]`
- GPS accuracy, when present, `[0, 10_000]` meters; low-quality points can be stored but excluded from aggregation
- Normalized bounding-box coordinates `[0, 1]` with `left < right` and `top < bottom`
- Confidence `[0, 1]`

Old and out-of-order observations are accepted within the timestamp validity bound. Capture order never depends on receive order.

## Request

```json
{
  "schemaVersion": 1,
  "batchId": "018f247c-7cc1-7ea9-aec2-47e1295f90df",
  "tripId": "trip-optional-server-issued-id",
  "software": {
    "name": "sapseed-edge-android",
    "version": "0.4.0"
  },
  "observations": [
    {
      "clientEventId": "018f247c-b2a8-742f-9e41-3df15980ebd0",
      "observationType": "object_detection",
      "capturedAt": "2026-09-09T08:17:42.381Z",
      "position": {
        "latitude": 12.971599,
        "longitude": 77.594566,
        "accuracyMeters": 6.4
      },
      "model": {
        "name": "yolo11n",
        "version": "sapseed-2026-08-31",
        "runtime": "litert-gpu"
      },
      "detection": {
        "classId": 7,
        "className": "pothole",
        "confidence": 0.91,
        "boundingBox": {
          "left": 0.28,
          "top": 0.51,
          "right": 0.57,
          "bottom": 0.83
        },
        "trackingId": "camera-front:track-148"
      },
      "camera": {
        "id": "front",
        "frameId": "frame-492881"
      },
      "evidenceIds": [],
      "edgeConfidence": 0.91,
      "edgeSeverity": "medium",
      "payload": {},
      "metadata": {
        "provider": "LiteRT"
      }
    },
    {
      "clientEventId": "018f247c-b2a8-742f-9e41-3df15980ebd1",
      "observationType": "object_detection",
      "capturedAt": "2026-09-09T08:17:42.381Z",
      "position": {
        "latitude": 12.971601,
        "longitude": 77.59457,
        "accuracyMeters": 6.4
      },
      "model": {
        "name": "yolo11n",
        "version": "sapseed-2026-08-31",
        "runtime": "litert-gpu"
      },
      "detection": {
        "classId": 4,
        "className": "car",
        "confidence": 0.88,
        "boundingBox": {
          "left": 0.61,
          "top": 0.34,
          "right": 0.9,
          "bottom": 0.79
        },
        "trackingId": "camera-front:track-149"
      },
      "camera": {
        "id": "front",
        "frameId": "frame-492881"
      },
      "evidenceIds": [],
      "payload": {},
      "metadata": {}
    }
  ]
}
```

### Field decisions

- `clientEventId` is generated once on the edge and retained across retries.
- `batchId` groups one upload attempt and protects against accidental changed replay.
- `schemaVersion` versions the envelope. Type-specific payload evolution can later add `payloadSchemaVersion` without replacing the endpoint.
- `tripId` is optional and server-issued. Bus identity is resolved from the authenticated device assignment; a client cannot assert another bus.
- `classId` preserves exact model output. `className` makes records interpretable and must match the server taxonomy for the declared model.
- Bounding boxes remain normalized so the API is independent of camera resolution.
- `camera.id` is required for multi-camera tracking context. Tracking IDs are scoped to device, camera, and a bounded tracking session; they are not global identities.
- `payload` is bounded JSON for observation-type-specific data. Search/filter fields remain typed columns.
- `edgeSeverity` is advisory. Server-derived issue severity is separate.
- `evidenceIds` contains server-issued opaque IDs only. File bytes and public URLs never appear here.

## Successful/partial response

A syntactically valid envelope returns HTTP `200` even when individual observations are rejected. This is easier for constrained clients than WebDAV-style `207` and makes retry rules explicit.

```json
{
  "batchId": "018f247c-7cc1-7ea9-aec2-47e1295f90df",
  "receivedAt": "2026-09-09T08:19:03.104Z",
  "summary": {
    "accepted": 1,
    "duplicates": 1,
    "rejected": 1
  },
  "results": [
    {
      "clientEventId": "event-a",
      "status": "accepted",
      "observationId": "server-observation-id-a"
    },
    {
      "clientEventId": "event-b",
      "status": "duplicate",
      "observationId": "server-observation-id-b"
    },
    {
      "clientEventId": "event-c",
      "status": "rejected",
      "error": {
        "code": "DETECTION_CLASS_MISMATCH",
        "path": "/observations/2/detection/className",
        "message": "classId 7 must use className pothole",
        "retryable": false
      }
    }
  ]
}
```

Results preserve request order.

## Batch-level errors

- `400 INVALID_ENVELOPE`: malformed JSON, missing batch fields, empty/oversized batch
- `401 INVALID_DEVICE_CREDENTIAL`: missing, invalid, expired, or revoked credential
- `403 DEVICE_DISABLED`: valid credential but disabled device/organization
- `409 BATCH_ID_REUSED`: same `(device, batchId)` used with a different canonical payload hash
- `413 PAYLOAD_TOO_LARGE`: body limit exceeded
- `429 RATE_LIMITED`: retry using `Retry-After`
- `503 INGESTION_UNAVAILABLE`: no observations committed; retry the complete batch

Unknown fields are rejected in v1 rather than silently discarded.

## Idempotency and transaction semantics

- Event uniqueness is `(device_id, client_event_id)`.
- Batch uniqueness is `(device_id, batch_id)` with a canonical request hash.
- Repeating an identical batch returns the exact stored response, including original statuses, observation IDs, and `receivedAt`.
- Reusing a batch ID with different content returns `409`. A previously seen event in a new batch returns `duplicate`.
- Items are validated independently before persistence, enabling useful per-item failures.
- All valid items, the batch record, and their durable jobs are committed in one database transaction.
- If that transaction fails, the API returns `503`; the edge retains and retries every item.
- Server-owned fields—organization, device, bus assignment, receive time, derivation state, issue ID, and audit fields—are never accepted from JSON.

## Evidence flow

Evidence is optional and is intentionally outside the JSON batch body:

1. Generate a stable evidence UUID and request an upload reservation from `/v1/evidence/reservations` with MIME type, exact size, and SHA-256.
2. API stores an organization/device-scoped reservation and returns a short-lived signed `PUT` request.
3. Edge uploads directly to private S3-compatible object storage using every returned signed header.
4. Edge calls `POST /v1/evidence/{evidenceId}/complete`; the API verifies the private object exists.
5. Edge references the uploaded `evidenceId` in its observation batch. The API rejects missing, foreign, or incomplete evidence IDs per item.
6. A cleanup worker deletes expired reservations and uploaded objects that were never linked to an observation.

Empty `evidenceIds` remain valid. Object keys and provider URLs are server-owned and never become durable client identifiers.

## Implemented Sapseed changes

- Replace `UrbanEvent` as the wire DTO with an immutable `ObservationEnvelopeV1`/`ObservationV1` contract.
- Keep raw detection class separate from derived event type.
- Stop trusting/sending `deviceId` as identity; authenticate with a provisioned device credential.
- Batch queued metadata records rather than looping over one multipart request per event.
- Parse per-item results and remove only `accepted`, `duplicate`, or permanently `rejected` items.
- Keep retryable items and stop/back off on batch-level `429`/`503`.
- Add software/model/runtime and camera identity fields explicitly instead of encoding bounding boxes and labels into string attributes.
- Retain generated IDs and capture timestamps exactly across retries.

These changes are now implemented in `../Sapseed/sapseed-edge`: the edge queues `UrbanObservation` records, uploads batches, uses device credentials, performs the reservation/PUT/completion evidence flow, and removes only terminal item results.
