import { describe, it, expect } from "vitest";
import {
  createEventSchema,
  updateEventSchema,
  updateEventStatusSchema,
  eventStatusSchema,
} from "./event.schema.js";
import {
  createTeamSchema,
  updateTeamSchema,
  createParticipantSchema,
  setPresentationOrderSchema,
} from "./team.schema.js";
import {
  createTaskSchema,
  updateTaskSchema,
  assignTaskSchema,
  taskDifficultySchema,
} from "./task.schema.js";
import {
  createCriterionSchema,
  updateCriterionSchema,
  reorderCriteriaSchema,
} from "./criterion.schema.js";
import {
  createJuryMemberSchema,
  updateJuryMemberSchema,
} from "./jury.schema.js";
import {
  saveScoresSchema,
  scoreInputSchema,
  confirmEvaluationSchema,
} from "./evaluation.schema.js";
import {
  columnMappingSchema,
  importApplySchema,
} from "./import.schema.js";

// --- Event schemas ---

describe("eventStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(eventStatusSchema.parse("DRAFT")).toBe("DRAFT");
    expect(eventStatusSchema.parse("ACTIVE")).toBe("ACTIVE");
    expect(eventStatusSchema.parse("SCORING_CLOSED")).toBe("SCORING_CLOSED");
    expect(eventStatusSchema.parse("COMPLETED")).toBe("COMPLETED");
  });

  it("rejects invalid status", () => {
    expect(() => eventStatusSchema.parse("INVALID")).toThrow();
    expect(() => eventStatusSchema.parse("")).toThrow();
  });
});

describe("createEventSchema", () => {
  const validEvent = {
    title: "Ideathon 2025",
    description: "Annual ideathon",
    date: "2025-06-15T10:00:00.000Z",
  };

  it("accepts valid data", () => {
    const result = createEventSchema.parse(validEvent);
    expect(result.title).toBe("Ideathon 2025");
    expect(result.timerDuration).toBe(300);
    expect(result.uniqueTaskAssignment).toBe(false);
  });

  it("applies defaults", () => {
    const result = createEventSchema.parse({
      title: "Test",
      date: "2025-01-01T00:00:00.000Z",
    });
    expect(result.description).toBe("");
    expect(result.timerDuration).toBe(300);
    expect(result.uniqueTaskAssignment).toBe(false);
  });

  it("rejects empty title", () => {
    expect(() =>
      createEventSchema.parse({ ...validEvent, title: "" })
    ).toThrow();
  });

  it("rejects title over 200 chars", () => {
    expect(() =>
      createEventSchema.parse({ ...validEvent, title: "a".repeat(201) })
    ).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      createEventSchema.parse({ ...validEvent, date: "not-a-date" })
    ).toThrow();
  });

  it("rejects timer below 30 seconds", () => {
    expect(() =>
      createEventSchema.parse({ ...validEvent, timerDuration: 10 })
    ).toThrow();
  });

  it("rejects timer above 3600 seconds", () => {
    expect(() =>
      createEventSchema.parse({ ...validEvent, timerDuration: 5000 })
    ).toThrow();
  });
});

describe("updateEventSchema", () => {
  it("accepts partial updates", () => {
    const result = updateEventSchema.parse({ title: "New Title" });
    expect(result.title).toBe("New Title");
    expect(result.description).toBeUndefined();
  });

  it("accepts empty object", () => {
    const result = updateEventSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("updateEventStatusSchema", () => {
  it("accepts valid status", () => {
    const result = updateEventStatusSchema.parse({ status: "ACTIVE" });
    expect(result.status).toBe("ACTIVE");
  });

  it("rejects missing status", () => {
    expect(() => updateEventStatusSchema.parse({})).toThrow();
  });
});

// --- Team schemas ---

describe("createTeamSchema", () => {
  it("accepts valid team", () => {
    const result = createTeamSchema.parse({ name: "Team Alpha" });
    expect(result.name).toBe("Team Alpha");
    expect(result.projectDescription).toBeNull();
  });

  it("accepts team with description", () => {
    const result = createTeamSchema.parse({
      name: "Team Alpha",
      projectDescription: "Our project",
    });
    expect(result.projectDescription).toBe("Our project");
  });

  it("rejects empty name", () => {
    expect(() => createTeamSchema.parse({ name: "" })).toThrow();
  });
});

describe("updateTeamSchema", () => {
  it("accepts taskId as UUID", () => {
    const result = updateTeamSchema.parse({
      taskId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.taskId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("accepts taskId as null", () => {
    const result = updateTeamSchema.parse({ taskId: null });
    expect(result.taskId).toBeNull();
  });

  it("rejects invalid taskId", () => {
    expect(() => updateTeamSchema.parse({ taskId: "not-uuid" })).toThrow();
  });
});

describe("createParticipantSchema", () => {
  it("accepts valid participant", () => {
    const result = createParticipantSchema.parse({ name: "John Doe" });
    expect(result.name).toBe("John Doe");
    expect(result.email).toBeNull();
  });

  it("accepts participant with email", () => {
    const result = createParticipantSchema.parse({
      name: "John Doe",
      email: "john@example.com",
    });
    expect(result.email).toBe("john@example.com");
  });

  it("rejects invalid email", () => {
    expect(() =>
      createParticipantSchema.parse({ name: "John", email: "not-email" })
    ).toThrow();
  });
});

describe("setPresentationOrderSchema", () => {
  it("accepts array of UUIDs", () => {
    const uuids = [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
    ];
    const result = setPresentationOrderSchema.parse({ teamIds: uuids });
    expect(result.teamIds).toHaveLength(2);
  });

  it("rejects non-UUID strings", () => {
    expect(() =>
      setPresentationOrderSchema.parse({ teamIds: ["not-uuid"] })
    ).toThrow();
  });
});

// --- Task schemas ---

describe("taskDifficultySchema", () => {
  it("accepts valid difficulties", () => {
    expect(taskDifficultySchema.parse("LOW")).toBe("LOW");
    expect(taskDifficultySchema.parse("MEDIUM")).toBe("MEDIUM");
    expect(taskDifficultySchema.parse("HIGH")).toBe("HIGH");
  });

  it("rejects invalid difficulty", () => {
    expect(() => taskDifficultySchema.parse("EXTREME")).toThrow();
  });
});

describe("createTaskSchema", () => {
  it("accepts valid task with defaults", () => {
    const result = createTaskSchema.parse({ title: "Challenge 1" });
    expect(result.title).toBe("Challenge 1");
    expect(result.difficulty).toBe("MEDIUM");
    expect(result.description).toBeNull();
  });

  it("accepts task with all fields", () => {
    const result = createTaskSchema.parse({
      title: "Challenge 1",
      description: "Solve this",
      difficulty: "HIGH",
    });
    expect(result.difficulty).toBe("HIGH");
  });

  it("rejects empty title", () => {
    expect(() => createTaskSchema.parse({ title: "" })).toThrow();
  });
});

describe("updateTaskSchema", () => {
  it("accepts partial update", () => {
    const result = updateTaskSchema.parse({ title: "Updated Title" });
    expect(result.title).toBe("Updated Title");
    expect(result.difficulty).toBeUndefined();
  });

  it("accepts empty object", () => {
    const result = updateTaskSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid difficulty", () => {
    expect(() =>
      updateTaskSchema.parse({ difficulty: "EXTREME" })
    ).toThrow();
  });
});

describe("assignTaskSchema", () => {
  it("accepts valid assignment", () => {
    const result = assignTaskSchema.parse({
      teamId: "550e8400-e29b-41d4-a716-446655440000",
      taskId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.teamId).toBeDefined();
    expect(result.taskId).toBeDefined();
  });

  it("accepts null taskId (unassign)", () => {
    const result = assignTaskSchema.parse({
      teamId: "550e8400-e29b-41d4-a716-446655440000",
      taskId: null,
    });
    expect(result.taskId).toBeNull();
  });
});

// --- Criterion schemas ---

describe("createCriterionSchema", () => {
  it("accepts valid criterion", () => {
    const result = createCriterionSchema.parse({
      name: "Innovation",
      maxScore: 10,
    });
    expect(result.name).toBe("Innovation");
    expect(result.maxScore).toBe(10);
    expect(result.description).toBeNull();
  });

  it("rejects maxScore below 1", () => {
    expect(() =>
      createCriterionSchema.parse({ name: "Test", maxScore: 0 })
    ).toThrow();
  });

  it("rejects maxScore above 100", () => {
    expect(() =>
      createCriterionSchema.parse({ name: "Test", maxScore: 101 })
    ).toThrow();
  });

  it("rejects non-integer maxScore", () => {
    expect(() =>
      createCriterionSchema.parse({ name: "Test", maxScore: 5.5 })
    ).toThrow();
  });
});

describe("updateCriterionSchema", () => {
  it("accepts partial update", () => {
    const result = updateCriterionSchema.parse({ maxScore: 20 });
    expect(result.maxScore).toBe(20);
    expect(result.name).toBeUndefined();
  });

  it("accepts empty object", () => {
    const result = updateCriterionSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects maxScore above 100", () => {
    expect(() => updateCriterionSchema.parse({ maxScore: 101 })).toThrow();
  });
});

describe("reorderCriteriaSchema", () => {
  it("accepts array of UUIDs", () => {
    const result = reorderCriteriaSchema.parse({
      criterionIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.criterionIds).toHaveLength(1);
  });
});

// --- Jury schemas ---

describe("createJuryMemberSchema", () => {
  it("accepts valid jury member", () => {
    const result = createJuryMemberSchema.parse({ name: "Expert 1" });
    expect(result.name).toBe("Expert 1");
    expect(result.email).toBeNull();
  });

  it("accepts jury member with email", () => {
    const result = createJuryMemberSchema.parse({
      name: "Expert 1",
      email: "expert@example.com",
    });
    expect(result.email).toBe("expert@example.com");
  });

  it("rejects empty name", () => {
    expect(() => createJuryMemberSchema.parse({ name: "" })).toThrow();
  });
});

describe("updateJuryMemberSchema", () => {
  it("accepts partial update", () => {
    const result = updateJuryMemberSchema.parse({ name: "Updated Name" });
    expect(result.name).toBe("Updated Name");
  });
});

// --- Evaluation schemas ---

describe("scoreInputSchema", () => {
  it("accepts valid score", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 8,
    });
    expect(result.value).toBe(8);
  });

  it("accepts zero score", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 0,
    });
    expect(result.value).toBe(0);
  });

  it("rejects negative score", () => {
    expect(() =>
      scoreInputSchema.parse({
        criterionId: "550e8400-e29b-41d4-a716-446655440000",
        value: -1,
      })
    ).toThrow();
  });

  it("accepts fractional score with 0.1 step", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 3.5,
    });
    expect(result.value).toBe(3.5);
  });

  it("accepts score 7.1", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 7.1,
    });
    expect(result.value).toBe(7.1);
  });

  it("accepts 0.3 (floating-point regression)", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 0.3,
    });
    expect(result.value).toBe(0.3);
  });

  it("accepts 5.3 (floating-point regression)", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 5.3,
    });
    expect(result.value).toBe(5.3);
  });

  it("accepts 7.7 (floating-point regression)", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 7.7,
    });
    expect(result.value).toBe(7.7);
  });

  it("accepts 9.3 (floating-point regression)", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 9.3,
    });
    expect(result.value).toBe(9.3);
  });

  it("accepts integer 10", () => {
    const result = scoreInputSchema.parse({
      criterionId: "550e8400-e29b-41d4-a716-446655440000",
      value: 10,
    });
    expect(result.value).toBe(10);
  });

  it("rejects precision beyond 0.1 step (2.05)", () => {
    expect(() =>
      scoreInputSchema.parse({
        criterionId: "550e8400-e29b-41d4-a716-446655440000",
        value: 2.05,
      })
    ).toThrow();
  });

  it("rejects precision beyond 0.1 step (3.55)", () => {
    expect(() =>
      scoreInputSchema.parse({
        criterionId: "550e8400-e29b-41d4-a716-446655440000",
        value: 3.55,
      })
    ).toThrow();
  });

  it("rejects precision beyond 0.1 step (3.14159)", () => {
    expect(() =>
      scoreInputSchema.parse({
        criterionId: "550e8400-e29b-41d4-a716-446655440000",
        value: 3.14159,
      })
    ).toThrow();
  });
});

describe("saveScoresSchema", () => {
  const validScores = {
    scores: [
      {
        criterionId: "550e8400-e29b-41d4-a716-446655440000",
        value: 8,
      },
    ],
  };

  it("accepts valid scores", () => {
    const result = saveScoresSchema.parse(validScores);
    expect(result.scores).toHaveLength(1);
    expect(result.comment).toBeNull();
  });

  it("accepts scores with comment", () => {
    const result = saveScoresSchema.parse({
      ...validScores,
      comment: "Great presentation!",
    });
    expect(result.comment).toBe("Great presentation!");
  });

  it("rejects empty scores array", () => {
    expect(() => saveScoresSchema.parse({ scores: [] })).toThrow();
  });

  it("rejects comment over 5000 chars", () => {
    expect(() =>
      saveScoresSchema.parse({
        ...validScores,
        comment: "a".repeat(5001),
      })
    ).toThrow();
  });
});

describe("confirmEvaluationSchema", () => {
  it("accepts valid teamId", () => {
    const result = confirmEvaluationSchema.parse({
      teamId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.teamId).toBeDefined();
  });

  it("rejects invalid teamId", () => {
    expect(() =>
      confirmEvaluationSchema.parse({ teamId: "not-uuid" })
    ).toThrow();
  });
});

// --- Import schemas ---

describe("columnMappingSchema", () => {
  it("accepts valid mapping", () => {
    const result = columnMappingSchema.parse({
      teamName: 0,
      participantName: 1,
    });
    expect(result.teamName).toBe(0);
    expect(result.participantName).toBe(1);
    expect(result.participantEmail).toBeNull();
    expect(result.projectDescription).toBeNull();
  });

  it("accepts mapping with optional columns", () => {
    const result = columnMappingSchema.parse({
      teamName: 0,
      participantName: 1,
      participantEmail: 2,
      projectDescription: 3,
    });
    expect(result.participantEmail).toBe(2);
    expect(result.projectDescription).toBe(3);
  });

  it("rejects negative column index", () => {
    expect(() =>
      columnMappingSchema.parse({
        teamName: -1,
        participantName: 1,
      })
    ).toThrow();
  });
});

describe("importApplySchema", () => {
  it("accepts valid import config", () => {
    const result = importApplySchema.parse({
      fileId: "abc123",
      mapping: {
        teamName: 0,
        participantName: 1,
      },
    });
    expect(result.fileId).toBe("abc123");
    expect(result.mapping.teamName).toBe(0);
  });

  it("accepts optional teamResolutions with uuid", () => {
    const result = importApplySchema.parse({
      fileId: "abc123",
      mapping: { teamName: 0, participantName: 1 },
      teamResolutions: {
        "old team": "550e8400-e29b-41d4-a716-446655440000",
      },
    });
    expect(result.teamResolutions).toEqual({
      "old team": "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("accepts 'new' sentinel in teamResolutions", () => {
    const result = importApplySchema.parse({
      fileId: "abc123",
      mapping: { teamName: 0, participantName: 1 },
      teamResolutions: {
        "conflicting team": "new",
        "another team": "550e8400-e29b-41d4-a716-446655440000",
      },
    });
    expect(result.teamResolutions).toEqual({
      "conflicting team": "new",
      "another team": "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects non-uuid non-new values in teamResolutions", () => {
    expect(() =>
      importApplySchema.parse({
        fileId: "abc123",
        mapping: { teamName: 0, participantName: 1 },
        teamResolutions: { "team": "not-a-uuid" },
      })
    ).toThrow();
  });

  it("rejects empty fileId", () => {
    expect(() =>
      importApplySchema.parse({
        fileId: "",
        mapping: { teamName: 0, participantName: 1 },
      })
    ).toThrow();
  });
});
