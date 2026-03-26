export interface JuryMember {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  token: string;
  firstLogin: string | null;
  lastActive: string | null;
}
