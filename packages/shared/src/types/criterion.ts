export interface Criterion {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  maxScore: number;
  sortOrder: number;
}
