export const TaskDifficulty = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

export type TaskDifficulty =
  (typeof TaskDifficulty)[keyof typeof TaskDifficulty];

export interface Task {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  difficulty: TaskDifficulty;
}
