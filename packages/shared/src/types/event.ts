export const EventStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  SCORING_CLOSED: "SCORING_CLOSED",
  COMPLETED: "COMPLETED",
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  date: string; // ISO 8601
  logoPath: string | null;
  status: EventStatus;
  timerDuration: number; // seconds, default 300
  uniqueTaskAssignment: boolean;
  currentTeamId: string | null;
  scoringTeamId: string | null;
  createdAt: string;
  updatedAt: string;
}
