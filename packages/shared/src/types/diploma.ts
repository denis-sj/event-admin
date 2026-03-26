export interface Diploma {
  id: string;
  teamId: string;
  verificationCode: string;
  filePath: string | null;
  rank: number;
  totalScore: number;
  generatedAt: string;
}

export interface DiplomaSettings {
  id: string;
  eventId: string;
  backgroundPath: string | null;
  primaryColor: string; // default "#1a365d"
  textColor: string; // default "#1a202c"
}
