import type { EventStatus } from "./types/event.js";

// Limits
export const MAX_TEAMS = 50;
export const MAX_JURY = 20;
export const MAX_CRITERIA = 20;
export const MAX_TASKS = 30;
export const MAX_PARTICIPANTS_PER_TEAM = 10;

// Timer
export const MIN_TIMER_DURATION = 30; // seconds
export const MAX_TIMER_DURATION = 3600; // seconds
export const DEFAULT_TIMER_DURATION = 300; // seconds (5 minutes)

// Score
export const MIN_SCORE = 0;
export const MAX_SCORE_LIMIT = 100;

// Diploma
export const DEFAULT_PRIMARY_COLOR = "#1a365d";
export const DEFAULT_TEXT_COLOR = "#1a202c";
export const VERIFICATION_CODE_LENGTH = 12;

// Jury token
export const JURY_TOKEN_BYTES = 32;

// Anomaly detection
export const ANOMALY_STDDEV_MULTIPLIER = 2;

// Allowed status transitions
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["SCORING_CLOSED"],
  SCORING_CLOSED: ["ACTIVE", "COMPLETED"],
  COMPLETED: [],
};

// WebSocket event names
export const WS_EVENTS = {
  TEAM_CURRENT: "team:current",
  TIMER_STATE: "timer:state",
  SCORING_STATUS: "scoring:status",
  SCORES_UPDATED: "scores:updated",
} as const;

// Error codes
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  SCORING_CLOSED: "SCORING_CLOSED",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  EVENT_NOT_ACTIVE: "EVENT_NOT_ACTIVE",
  TASK_ALREADY_ASSIGNED: "TASK_ALREADY_ASSIGNED",
  EVALUATION_ALREADY_CONFIRMED: "EVALUATION_ALREADY_CONFIRMED",
  CRITERIA_LOCKED: "CRITERIA_LOCKED",
  IMPORT_PARSE_ERROR: "IMPORT_PARSE_ERROR",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
