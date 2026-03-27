/*
  Warnings:

  - You are about to alter the column `value` on the `Score` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" REAL NOT NULL,
    CONSTRAINT "Score_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "TeamEvaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Score_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Score" ("criterionId", "evaluationId", "id", "value") SELECT "criterionId", "evaluationId", "id", "value" FROM "Score";
DROP TABLE "Score";
ALTER TABLE "new_Score" RENAME TO "Score";
CREATE INDEX "Score_evaluationId_idx" ON "Score"("evaluationId");
CREATE UNIQUE INDEX "Score_evaluationId_criterionId_key" ON "Score"("evaluationId", "criterionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
