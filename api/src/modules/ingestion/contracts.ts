import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const Identifier = Type.String({ minLength: 1, maxLength: 64 });
const JsonObject = Type.Record(Type.String({ minLength: 1, maxLength: 64 }), Type.Unknown(), {
  maxProperties: 32,
});

export const PositionSchema = Type.Object(
  {
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    accuracyMeters: Type.Optional(Type.Number({ minimum: 0, maximum: 10_000 })),
  },
  { additionalProperties: false },
);

export const BoundingBoxSchema = Type.Object(
  {
    left: Type.Number({ minimum: 0, maximum: 1 }),
    top: Type.Number({ minimum: 0, maximum: 1 }),
    right: Type.Number({ minimum: 0, maximum: 1 }),
    bottom: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

export const ObservationV1Schema = Type.Object(
  {
    clientEventId: Identifier,
    observationType: Type.Literal("object_detection"),
    capturedAt: Type.String({ minLength: 20, maxLength: 40 }),
    position: PositionSchema,
    model: Type.Object(
      {
        name: Type.String({ minLength: 1, maxLength: 100 }),
        version: Type.String({ minLength: 1, maxLength: 100 }),
        runtime: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
      },
      { additionalProperties: false },
    ),
    detection: Type.Object(
      {
        classId: Type.Integer({ minimum: 0, maximum: 20 }),
        className: Type.String({ minLength: 1, maxLength: 64 }),
        confidence: Type.Number({ minimum: 0, maximum: 1 }),
        boundingBox: BoundingBoxSchema,
        trackingId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
      },
      { additionalProperties: false },
    ),
    camera: Type.Object(
      {
        id: Type.String({ minLength: 1, maxLength: 100 }),
        frameId: Type.String({ minLength: 1, maxLength: 200 }),
      },
      { additionalProperties: false },
    ),
    evidenceIds: Type.Array(Identifier, { maxItems: 8 }),
    edgeConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    edgeSeverity: Type.Optional(Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("critical"),
    ])),
    payload: JsonObject,
    metadata: JsonObject,
  },
  { additionalProperties: false },
);

export const IngestionBatchEnvelopeSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    batchId: Identifier,
    tripId: Type.Optional(Type.String({ format: "uuid" })),
    software: Type.Object(
      {
        name: Type.String({ minLength: 1, maxLength: 100 }),
        version: Type.String({ minLength: 1, maxLength: 100 }),
      },
      { additionalProperties: false },
    ),
    observations: Type.Array(ObservationV1Schema, { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);

export type ObservationV1 = Static<typeof ObservationV1Schema>;
export type IngestionBatchEnvelope = Omit<Static<typeof IngestionBatchEnvelopeSchema>, "observations"> & {
  observations: unknown[];
};

export const IngestionResultSchema = Type.Object(
  {
    batchId: Identifier,
    receivedAt: Type.String(),
    summary: Type.Object({
      accepted: Type.Integer({ minimum: 0 }),
      duplicates: Type.Integer({ minimum: 0 }),
      rejected: Type.Integer({ minimum: 0 }),
    }),
    results: Type.Array(
      Type.Object({
        index: Type.Integer({ minimum: 0 }),
        clientEventId: Type.Union([Identifier, Type.Null()]),
        status: Type.Union([Type.Literal("accepted"), Type.Literal("duplicate"), Type.Literal("rejected")]),
        observationId: Type.Optional(Type.String()),
        error: Type.Optional(
          Type.Object({
            code: Type.String(),
            path: Type.String(),
            message: Type.String(),
            retryable: Type.Boolean(),
          }),
        ),
      }),
    ),
  },
  { additionalProperties: false },
);

export const ApiErrorSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    requestId: Type.String(),
  },
  { additionalProperties: false },
);

export interface ObservationValidationError {
  code: string;
  path: string;
  message: string;
  retryable: false;
}

const DETECTION_CLASSES = [
  "person",
  "bicycle",
  "motorcycle",
  "autorickshaw",
  "car",
  "bus",
  "truck",
  "pothole",
  "longitudinal_crack",
  "transverse_crack",
  "alligator_crack",
  "damaged_road",
  "waterlogging",
  "manhole",
  "traffic_sign",
  "traffic_light",
  "zebra_crossing",
  "road_divider",
  "animal",
  "speed_bump",
  "unsurfaced_road",
] as const;

const EARLIEST_CAPTURE = Date.parse("2020-01-01T00:00:00.000Z");
const MAX_FUTURE_MILLISECONDS = 10 * 60 * 1_000;

export type ValidatedObservation = ObservationV1 & { capturedAtDate: Date };

export const validateObservation = (
  value: unknown,
  now: Date,
): { value: ValidatedObservation } | { error: ObservationValidationError } => {
  if (!Value.Check(ObservationV1Schema, value)) {
    const firstError = Value.Errors(ObservationV1Schema, value).First();
    return {
      error: {
        code: "INVALID_OBSERVATION",
        path: firstError?.path ?? "",
        message: firstError?.message ?? "Observation does not match schema version 1",
        retryable: false,
      },
    };
  }

  const observation = value as ObservationV1;
  const capturedAtMilliseconds = Date.parse(observation.capturedAt);
  if (
    !Number.isFinite(capturedAtMilliseconds) ||
    capturedAtMilliseconds < EARLIEST_CAPTURE ||
    capturedAtMilliseconds > now.getTime() + MAX_FUTURE_MILLISECONDS
  ) {
    return {
      error: {
        code: "INVALID_CAPTURE_TIMESTAMP",
        path: "/capturedAt",
        message: "capturedAt must be an ISO timestamp from 2020-01-01 through 10 minutes in the future",
        retryable: false,
      },
    };
  }

  const expectedClassName = DETECTION_CLASSES[observation.detection.classId];
  if (observation.detection.className !== expectedClassName) {
    return {
      error: {
        code: "DETECTION_CLASS_MISMATCH",
        path: "/detection/className",
        message: `classId ${observation.detection.classId} must use className ${expectedClassName}`,
        retryable: false,
      },
    };
  }

  const box = observation.detection.boundingBox;
  if (box.left >= box.right || box.top >= box.bottom) {
    return {
      error: {
        code: "INVALID_BOUNDING_BOX",
        path: "/detection/boundingBox",
        message: "Bounding box must have positive area",
        retryable: false,
      },
    };
  }

  for (const [key, metadataValue] of Object.entries(observation.metadata)) {
    if (JSON.stringify(metadataValue).length > 2_048) {
      return {
        error: {
          code: "METADATA_VALUE_TOO_LARGE",
          path: `/metadata/${key}`,
          message: "Encoded metadata values cannot exceed 2048 characters",
          retryable: false,
        },
      };
    }
  }

  return { value: { ...observation, capturedAtDate: new Date(capturedAtMilliseconds) } };
};

export const detectionClassName = (classId: number): string | undefined => DETECTION_CLASSES[classId];
