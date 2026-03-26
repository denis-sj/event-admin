export interface Team {
  id: string;
  eventId: string;
  name: string;
  projectDescription: string | null;
  taskId: string | null;
  presentationOrder: number | null;
}

export interface Participant {
  id: string;
  teamId: string;
  name: string;
  email: string | null;
}
