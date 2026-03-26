-- CreateTable
CREATE TABLE "Organizer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "logoPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "timerDuration" INTEGER NOT NULL DEFAULT 300,
    "uniqueTaskAssignment" BOOLEAN NOT NULL DEFAULT false,
    "currentTeamId" TEXT,
    "scoringTeamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_scoringTeamId_fkey" FOREIGN KEY ("scoringTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Criterion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectDescription" TEXT,
    "taskId" TEXT,
    "presentationOrder" INTEGER,
    CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    CONSTRAINT "Participant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    CONSTRAINT "Task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JuryMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token" TEXT NOT NULL,
    "firstLogin" DATETIME,
    "lastActive" DATETIME,
    CONSTRAINT "JuryMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "juryMemberId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "comment" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamEvaluation_juryMemberId_fkey" FOREIGN KEY ("juryMemberId") REFERENCES "JuryMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamEvaluation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    CONSTRAINT "Score_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "TeamEvaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Diploma" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "filePath" TEXT,
    "rank" INTEGER NOT NULL,
    "totalScore" REAL NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Diploma_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiplomaSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "backgroundPath" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a365d',
    "textColor" TEXT NOT NULL DEFAULT '#1a202c',
    CONSTRAINT "DiplomaSettings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_email_key" ON "Organizer"("email");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "Event"("organizerId");

-- CreateIndex
CREATE INDEX "Criterion_eventId_idx" ON "Criterion"("eventId");

-- CreateIndex
CREATE INDEX "Team_eventId_idx" ON "Team"("eventId");

-- CreateIndex
CREATE INDEX "Team_taskId_idx" ON "Team"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_name_key" ON "Team"("eventId", "name");

-- CreateIndex
CREATE INDEX "Participant_teamId_idx" ON "Participant"("teamId");

-- CreateIndex
CREATE INDEX "Task_eventId_idx" ON "Task"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "JuryMember_token_key" ON "JuryMember"("token");

-- CreateIndex
CREATE INDEX "JuryMember_eventId_idx" ON "JuryMember"("eventId");

-- CreateIndex
CREATE INDEX "JuryMember_token_idx" ON "JuryMember"("token");

-- CreateIndex
CREATE INDEX "TeamEvaluation_teamId_idx" ON "TeamEvaluation"("teamId");

-- CreateIndex
CREATE INDEX "TeamEvaluation_juryMemberId_idx" ON "TeamEvaluation"("juryMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEvaluation_juryMemberId_teamId_key" ON "TeamEvaluation"("juryMemberId", "teamId");

-- CreateIndex
CREATE INDEX "Score_evaluationId_idx" ON "Score"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_evaluationId_criterionId_key" ON "Score"("evaluationId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "Diploma_teamId_key" ON "Diploma"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Diploma_verificationCode_key" ON "Diploma"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "DiplomaSettings_eventId_key" ON "DiplomaSettings"("eventId");
