import { z } from 'zod';
import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import { ANOMALY_STDDEV_MULTIPLIER } from '@ideathon/shared';

export const resultsQueryValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
  query: z.object({
    taskId: z.string().uuid().optional(),
  }),
});

export const resultsExportValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
  query: z.object({
    taskId: z.string().uuid().optional(),
    format: z.enum(['xlsx', 'csv']).default('xlsx'),
  }),
});

export interface JuryScore {
  juryMemberId: string;
  juryName: string;
  value: number;
  isAnomaly: boolean;
  comment: string | null;
}

export interface CriterionScore {
  criterionId: string;
  criterionName: string;
  avgScore: number;
  juryScores: JuryScore[];
}

export interface TeamResult {
  id: string;
  name: string;
  taskId: string | null;
  taskTitle: string | null;
  rank: number;
  totalAvgScore: number;
  criteriaScores: CriterionScore[];
}

export interface ResultsResponse {
  filter: {
    taskId: string | null;
  };
  teams: TeamResult[];
  anomalyThreshold: number;
}

export class ResultsService {
  static async getResults(eventId: string, organizerId: string, taskId?: string): Promise<ResultsResponse> {
    // Verify event ownership
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    return this.calculateResults(eventId, taskId);
  }

  static async calculateResults(eventId: string, taskId?: string): Promise<ResultsResponse> {
    // Build team filter
    const teamWhere: { eventId: string; taskId?: string } = { eventId };
    if (taskId) {
      teamWhere.taskId = taskId;
    }

    // Fetch teams with evaluations and scores
    const teams = await prisma.team.findMany({
      where: teamWhere,
      include: {
        task: { select: { id: true, title: true } },
        evaluations: {
          where: { status: 'CONFIRMED' },
          include: {
            juryMember: { select: { id: true, name: true } },
            scores: {
              include: {
                criterion: { select: { id: true, name: true, maxScore: true } },
              },
            },
          },
        },
      },
    });

    // Fetch criteria for anomaly detection and ordered columns
    const criteria = await prisma.criterion.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });

    // Build score matrix: criterionId -> values array (for stddev calc)
    const scoresByCriterion = new Map<string, number[]>();
    for (const criterion of criteria) {
      scoresByCriterion.set(criterion.id, []);
    }

    // Collect all confirmed scores across all teams
    for (const team of teams) {
      for (const evaluation of team.evaluations) {
        for (const score of evaluation.scores) {
          const arr = scoresByCriterion.get(score.criterionId);
          if (arr) {
            arr.push(score.value);
          }
        }
      }
    }

    // Compute mean and stddev per criterion
    const criterionStats = new Map<string, { mean: number; stddev: number }>();
    for (const [criterionId, values] of scoresByCriterion) {
      if (values.length === 0) {
        criterionStats.set(criterionId, { mean: 0, stddev: 0 });
        continue;
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const stddev = Math.sqrt(variance);
      criterionStats.set(criterionId, { mean, stddev });
    }

    // Build results per team
    const teamResults: TeamResult[] = teams.map((team) => {
      // Group scores by criterion across jury members
      const criteriaScores: CriterionScore[] = criteria.map((criterion) => {
        const juryScores: JuryScore[] = [];

        for (const evaluation of team.evaluations) {
          const score = evaluation.scores.find((s) => s.criterionId === criterion.id);
          if (score) {
            const stats = criterionStats.get(criterion.id);
            const isAnomaly = stats
              ? stats.stddev > 0 && Math.abs(score.value - stats.mean) > ANOMALY_STDDEV_MULTIPLIER * stats.stddev
              : false;

            juryScores.push({
              juryMemberId: evaluation.juryMember.id,
              juryName: evaluation.juryMember.name,
              value: score.value,
              isAnomaly,
              comment: evaluation.comment,
            });
          }
        }

        const avgScore = juryScores.length > 0
          ? juryScores.reduce((sum, s) => sum + s.value, 0) / juryScores.length
          : 0;

        return {
          criterionId: criterion.id,
          criterionName: criterion.name,
          avgScore: Math.round(avgScore * 100) / 100,
          juryScores,
        };
      });

      // totalAvgScore = average of all per-criterion averages (only criteria that have scores)
      const scoredCriteria = criteriaScores.filter((c) => c.juryScores.length > 0);
      const totalAvgScore = scoredCriteria.length > 0
        ? scoredCriteria.reduce((sum, c) => sum + c.avgScore, 0) / scoredCriteria.length
        : 0;

      return {
        id: team.id,
        name: team.name,
        taskId: team.task?.id ?? null,
        taskTitle: team.task?.title ?? null,
        rank: 0, // will be assigned after sorting
        totalAvgScore: Math.round(totalAvgScore * 100) / 100,
        criteriaScores,
      };
    });

    // Sort by totalAvgScore descending and assign ranks
    teamResults.sort((a, b) => b.totalAvgScore - a.totalAvgScore);
    teamResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return {
      filter: {
        taskId: taskId ?? null,
      },
      teams: teamResults,
      anomalyThreshold: ANOMALY_STDDEV_MULTIPLIER,
    };
  }

  static async exportResults(
    eventId: string,
    organizerId: string,
    format: 'xlsx' | 'csv',
    taskId?: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { teams } = await this.getResults(eventId, organizerId, taskId);

    // Fetch criteria for column headers
    const criteria = await prisma.criterion.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });

    // Fetch teams with participants for export
    const teamsWithParticipants = await prisma.team.findMany({
      where: { eventId },
      select: {
        id: true,
        participants: { select: { name: true } },
      },
    });
    const participantsMap = new Map(
      teamsWithParticipants.map((t) => [t.id, t.participants.map((p) => p.name).join(', ')]),
    );

    // Build spreadsheet rows — one row per team × jury member
    const rows: Record<string, unknown>[] = [];

    for (const team of teams) {
      // Collect all unique jury members that scored this team
      const juryIds = new Set<string>();
      for (const cs of team.criteriaScores) {
        for (const js of cs.juryScores) {
          juryIds.add(js.juryMemberId);
        }
      }

      if (juryIds.size === 0) {
        // Team with no scores — still include one summary row
        const row: Record<string, unknown> = {
          'Rank': team.rank,
          'Team': team.name,
          'Participants': participantsMap.get(team.id) ?? '',
          'Task': team.taskTitle ?? '',
          'Jury': '',
        };
        for (const criterion of criteria) {
          row[criterion.name] = '';
        }
        row['Average Score'] = team.totalAvgScore;
        rows.push(row);
        continue;
      }

      for (const juryId of juryIds) {
        const row: Record<string, unknown> = {
          'Rank': team.rank,
          'Team': team.name,
          'Participants': participantsMap.get(team.id) ?? '',
          'Task': team.taskTitle ?? '',
          'Jury': '',
        };

        for (const criterion of criteria) {
          const cs = team.criteriaScores.find((c) => c.criterionId === criterion.id);
          const js = cs?.juryScores.find((j) => j.juryMemberId === juryId);
          if (js) {
            row['Jury'] = js.juryName;
            row[criterion.name] = js.value;
          } else {
            row[criterion.name] = '';
          }
        }

        row['Average Score'] = team.totalAvgScore;
        rows.push(row);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Results');

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        filename: `results-${eventId}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      buffer: Buffer.from(xlsxBuffer),
      filename: `results-${eventId}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
