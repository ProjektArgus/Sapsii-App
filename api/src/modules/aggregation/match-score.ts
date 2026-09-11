export interface MatchScoreInput {
  distanceMeters: number;
  observationAccuracyMeters: number;
  issueAccuracyMeters: number;
  confidence: number;
  ageDays: number;
  independentDevice: boolean;
}

const clamp = (minimum: number, maximum: number, value: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export const scoreIssueCandidate = (input: MatchScoreInput): number => {
  const radius = clamp(
    8,
    30,
    1.5 * Math.sqrt(input.observationAccuracyMeters ** 2 + input.issueAccuracyMeters ** 2),
  );
  const distance = Math.max(0, 1 - input.distanceMeters / radius);
  const accuracy = Math.max(0, 1 - Math.min(input.observationAccuracyMeters, 100) / 100);
  const recency = Math.max(0, 1 - Math.min(Math.abs(input.ageDays), 90) / 90);
  const score =
    0.55 * distance +
    0.2 * clamp(0, 1, input.confidence) +
    0.1 * accuracy +
    0.1 * recency +
    (input.independentDevice ? 0.05 : 0);
  return clamp(0, 1, score);
};

export const shouldAttachCandidate = (scores: readonly number[]): boolean => {
  if (scores.length === 0 || scores[0]! < 0.72) return false;
  return scores.length === 1 || scores[0]! - scores[1]! >= 0.12;
};

export const combineIssueLocation = (input: {
  issueLongitude: number;
  issueLatitude: number;
  issueAccuracyMeters: number;
  observationLongitude: number;
  observationLatitude: number;
  observationAccuracyMeters: number;
}) => {
  const issueWeight = 1 / Math.max(3, input.issueAccuracyMeters) ** 2;
  const observationWeight = 1 / Math.max(3, input.observationAccuracyMeters) ** 2;
  const totalWeight = issueWeight + observationWeight;
  return {
    longitude: (input.issueLongitude * issueWeight + input.observationLongitude * observationWeight) / totalWeight,
    latitude: (input.issueLatitude * issueWeight + input.observationLatitude * observationWeight) / totalWeight,
    accuracyMeters: Math.sqrt(1 / totalWeight),
  };
};
