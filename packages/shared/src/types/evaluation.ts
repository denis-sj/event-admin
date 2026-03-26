export const EvaluationStatus = {
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
} as const;

export type EvaluationStatus =
  (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

export interface Score {
  id: string;
  evaluationId: string;
  criterionId: string;
  value: number;
}

export interface TeamEvaluation {
  id: string;
  juryMemberId: string;
  teamId: string;
  status: EvaluationStatus;
  comment: string | null;
  updatedAt: string;
  scores?: Score[];
}
