import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { ApiError } from '../utils/errors.js';
import {
  importApplySchema,
  columnMappingSchema,
  ERROR_CODES,
  MAX_TEAMS,
  MAX_PARTICIPANTS_PER_TEAM,
} from '@ideathon/shared';

// Validation objects for routes
export const importPreviewValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const importApplyValidation = z.object({
  body: importApplySchema,
  params: z.object({ eventId: z.string().uuid() }),
});

// In-memory cache for uploaded import files (fileId → parsed rows)
interface ParsedFile {
  headers: string[];
  rows: string[][];
  createdAt: number;
}

const fileCache = new Map<string, ParsedFile>();

// Clean up stale entries older than 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000;

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of fileCache) {
    if (now - value.createdAt > CACHE_TTL_MS) {
      fileCache.delete(key);
    }
  }
}

// Auto-detect column mapping heuristic based on header names
function autoDetectMapping(headers: string[]): z.infer<typeof columnMappingSchema> {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const teamNamePatterns = ['команда', 'team', 'название команды', 'team name', 'group', 'группа'];
  const participantNamePatterns = ['имя', 'участник', 'фио', 'name', 'participant', 'имя участника', 'full name'];
  const emailPatterns = ['email', 'e-mail', 'почта', 'электронная почта', 'mail'];
  const descriptionPatterns = ['описание', 'description', 'проект', 'project', 'описание проекта', 'project description'];

  function findColumn(patterns: string[], exclude?: Set<number>): number | null {
    for (const pattern of patterns) {
      const idx = lowerHeaders.findIndex((h, i) => h.includes(pattern) && !(exclude?.has(i)));
      if (idx !== -1) return idx;
    }
    return null;
  }

  const teamName = findColumn(teamNamePatterns);
  const usedColumns = new Set(teamName !== null ? [teamName] : []);
  const participantName = findColumn(participantNamePatterns, usedColumns);
  const participantEmail = findColumn(emailPatterns);
  const projectDescription = findColumn(descriptionPatterns);

  return {
    teamName: teamName ?? 0,
    participantName: participantName ?? (teamName === 0 ? 1 : 0),
    participantEmail: participantEmail,
    projectDescription: projectDescription,
  };
}

function parseCSV(buffer: Buffer): { headers: string[]; rows: string[][] } {
  try {
    const content = buffer.toString('utf-8');
    const records: string[][] = parse(content, {
      relax_column_count: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      throw ApiError.badRequest('File is empty', ERROR_CODES.IMPORT_PARSE_ERROR);
    }

    const headers = records[0];
    const rows = records.slice(1);

    return { headers, rows };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      400,
      ERROR_CODES.IMPORT_PARSE_ERROR,
      'Failed to parse CSV file. Check file encoding and format.',
    );
  }
}

function parseXLSX(buffer: Buffer): { headers: string[]; rows: string[][] } {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw ApiError.badRequest('Excel file has no sheets', ERROR_CODES.IMPORT_PARSE_ERROR);
    }

    const sheet = workbook.Sheets[sheetName];
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    if (data.length === 0) {
      throw ApiError.badRequest('Sheet is empty', ERROR_CODES.IMPORT_PARSE_ERROR);
    }

    const headers = data[0].map(String);
    const rows = data.slice(1).map((row) => row.map(String));

    return { headers, rows };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      400,
      ERROR_CODES.IMPORT_PARSE_ERROR,
      'Failed to parse Excel file. Check file format.',
    );
  }
}

async function ensureEventOwnership(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, status: true },
  });

  if (!event) {
    throw ApiError.notFound('Event not found');
  }

  if (event.organizerId !== organizerId) {
    throw ApiError.forbidden('Access denied');
  }

  return event;
}

export class ImportService {
  /**
   * Preview: parse uploaded file, cache parsed data, return headers + sample rows + auto-mapping
   */
  static async preview(
    eventId: string,
    organizerId: string,
    filePath: string,
    originalName: string,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    let parsed: { headers: string[]; rows: string[][] };

    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(originalName).toLowerCase();

      if (ext === '.csv') {
        parsed = parseCSV(buffer);
      } else if (ext === '.xlsx' || ext === '.xls') {
        parsed = parseXLSX(buffer);
      } else {
        throw ApiError.badRequest(
          'Unsupported file format. Only CSV and XLSX/XLS are supported.',
          ERROR_CODES.IMPORT_PARSE_ERROR,
        );
      }
    } finally {
      // Clean up temp file regardless of success or failure
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }

    // Generate a fileId and cache the parsed data
    const fileId = crypto.randomBytes(16).toString('hex');

    cleanupCache();
    fileCache.set(fileId, {
      headers: parsed.headers,
      rows: parsed.rows,
      createdAt: Date.now(),
    });

    // Auto-detect column mapping
    const suggestedMapping = autoDetectMapping(parsed.headers);

    // Preview rows (up to 10)
    const previewRows = parsed.rows.slice(0, 10);

    // Fetch existing teams for conflict detection
    const existingTeams = await prisma.team.findMany({
      where: { eventId },
      select: { id: true, name: true },
    });

    return {
      fileId,
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      previewRows,
      allRows: parsed.rows,
      suggestedMapping,
      existingTeams,
    };
  }

  /**
   * Apply: create/update teams and participants from cached file data using column mapping.
   * Re-import: match by team name (case-insensitive), preserve evaluations.
   */
  static async apply(
    eventId: string,
    organizerId: string,
    data: z.infer<typeof importApplySchema>,
  ) {
    await ensureEventOwnership(eventId, organizerId);

    const cached = fileCache.get(data.fileId);
    if (!cached) {
      throw ApiError.badRequest(
        'Import file not found or expired. Please upload the file again.',
      );
    }

    const { rows } = cached;
    const { mapping } = data;

    // Normalize teamResolutions keys to lowercase+trimmed for safe lookup
    const teamResolutions = data.teamResolutions
      ? Object.fromEntries(
          Object.entries(data.teamResolutions).map(([k, v]) => [k.trim().toLowerCase(), v]),
        )
      : undefined;

    // Validate all mapped column indices are within range
    const maxColIdx = cached.headers.length - 1;
    const invalidColumns: string[] = [];
    if (mapping.teamName > maxColIdx) invalidColumns.push('teamName');
    if (mapping.participantName > maxColIdx) invalidColumns.push('participantName');
    if (mapping.participantEmail !== null && mapping.participantEmail > maxColIdx) invalidColumns.push('participantEmail');
    if (mapping.projectDescription !== null && mapping.projectDescription > maxColIdx) invalidColumns.push('projectDescription');

    if (invalidColumns.length > 0) {
      throw ApiError.badRequest(
        `Column mapping indices exceed the number of columns in the file: ${invalidColumns.join(', ')}.`,
      );
    }

    // Group rows by team name
    interface ImportRow {
      teamName: string;
      participantName: string;
      participantEmail: string | null;
      projectDescription: string | null;
    }

    const importRows: ImportRow[] = [];

    for (const row of rows) {
      const teamName = (row[mapping.teamName] ?? '').trim();
      const participantName = (row[mapping.participantName] ?? '').trim();

      if (!teamName || !participantName) continue; // skip empty rows

      const participantEmail =
        mapping.participantEmail !== null
          ? (row[mapping.participantEmail] ?? '').trim() || null
          : null;

      const projectDescription =
        mapping.projectDescription !== null
          ? (row[mapping.projectDescription] ?? '').trim() || null
          : null;

      importRows.push({ teamName, participantName, participantEmail, projectDescription });
    }

    if (importRows.length === 0) {
      throw ApiError.badRequest('No valid data rows found in the file.');
    }

    // Group by team
    const teamMap = new Map<string, ImportRow[]>();
    for (const row of importRows) {
      const key = row.teamName.toLowerCase();
      if (!teamMap.has(key)) {
        teamMap.set(key, []);
      }
      teamMap.get(key)!.push(row);
    }

    // Check teams limit
    const existingTeamCount = await prisma.team.count({ where: { eventId } });
    const existingTeams = await prisma.team.findMany({
      where: { eventId },
      include: { participants: true },
    });

    // Build lookup: existing team by ID and by lowercased name
    const existingTeamById = new Map<string, (typeof existingTeams)[number]>();
    const existingTeamByName = new Map<string, (typeof existingTeams)[number]>();
    for (const team of existingTeams) {
      existingTeamById.set(team.id, team);
      existingTeamByName.set(team.name.toLowerCase(), team);
    }

    // Validate teamResolutions: every target ID (except "new") must exist in this event
    if (teamResolutions) {
      for (const [importedName, value] of Object.entries(teamResolutions)) {
        if (value !== 'new' && !existingTeamById.has(value)) {
          throw ApiError.badRequest(
            `Team resolution for "${importedName}" points to non-existent team ID "${value}".`,
          );
        }
      }
    }

    // Resolve imported team key → existing team (using resolutions first, then auto-match by name)
    // Returns undefined when the team should be created as new (either "new" sentinel or no match).
    function resolveExistingTeam(teamKey: string): (typeof existingTeams)[number] | undefined {
      if (teamResolutions && teamKey in teamResolutions) {
        const value = teamResolutions[teamKey];
        if (value === 'new') return undefined; // explicitly create new
        return existingTeamById.get(value);
      }
      return existingTeamByName.get(teamKey);
    }

    // Resolve all imported teams and check for collisions (manual + auto-match)
    let newTeamCount = 0;
    const resolvedTargets = new Map<string, string>(); // existing team ID → first imported key that resolved to it
    for (const [key] of teamMap) {
      const resolved = resolveExistingTeam(key);
      if (!resolved) {
        newTeamCount++;
        continue;
      }

      const previousKey = resolvedTargets.get(resolved.id);
      if (previousKey !== undefined) {
        throw ApiError.badRequest(
          `Multiple imported teams ("${previousKey}", "${key}") resolve to the same existing team "${resolved.name}". Each target team can only be used once.`,
        );
      }
      resolvedTargets.set(resolved.id, key);
    }

    if (existingTeamCount + newTeamCount > MAX_TEAMS) {
      throw ApiError.badRequest(
        `Import would exceed the maximum of ${MAX_TEAMS} teams. Currently ${existingTeamCount} teams, trying to add ${newTeamCount} new.`,
      );
    }

    // Apply import in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      const updated: string[] = [];
      const skipped: string[] = [];

      for (const [teamKey, rows] of teamMap) {
        const teamName = rows[0].teamName; // use original casing
        const projectDescription = rows[0].projectDescription;

        const existing = resolveExistingTeam(teamKey);

        if (existing) {
          // Update existing team
          // Update project description if provided and team has no evaluations
          if (projectDescription !== null) {
            await tx.team.update({
              where: { id: existing.id },
              data: { projectDescription },
            });
          }

          // Merge participants: update existing by name, add new ones
          const existingParticipantMap = new Map(
            existing.participants.map((p) => [p.name.toLowerCase(), p]),
          );

          let participantCount = existing.participants.length;
          const seenNames = new Set<string>();

          for (const row of rows) {
            const nameKey = row.participantName.toLowerCase();

            // Deduplicate within the same file
            if (seenNames.has(nameKey)) continue;
            seenNames.add(nameKey);

            const existingParticipant = existingParticipantMap.get(nameKey);
            if (existingParticipant) {
              // Update email if it changed
              if (row.participantEmail !== null && row.participantEmail !== existingParticipant.email) {
                await tx.participant.update({
                  where: { id: existingParticipant.id },
                  data: { email: row.participantEmail },
                });
              }
              continue;
            }

            if (participantCount >= MAX_PARTICIPANTS_PER_TEAM) {
              skipped.push(
                `${row.participantName} (team "${teamName}" — max participants reached)`,
              );
              continue;
            }

            await tx.participant.create({
              data: {
                teamId: existing.id,
                name: row.participantName,
                email: row.participantEmail,
              },
            });

            participantCount++;
          }

          updated.push(teamName);
        } else {
          // Create new team
          const team = await tx.team.create({
            data: {
              eventId,
              name: teamName,
              projectDescription,
            },
          });

          // Add participants (up to limit, deduplicate by name within file)
          let count = 0;
          const addedNames = new Set<string>();
          for (const row of rows) {
            const nameKey = row.participantName.toLowerCase();
            if (addedNames.has(nameKey)) continue;
            addedNames.add(nameKey);

            if (count >= MAX_PARTICIPANTS_PER_TEAM) {
              skipped.push(
                `${row.participantName} (team "${teamName}" — max participants reached)`,
              );
              continue;
            }

            await tx.participant.create({
              data: {
                teamId: team.id,
                name: row.participantName,
                email: row.participantEmail,
              },
            });
            count++;
          }

          created.push(teamName);
        }
      }

      return { created, updated, skipped };
    });

    // Clean up cached file data
    fileCache.delete(data.fileId);

    return {
      teamsCreated: result.created.length,
      teamsUpdated: result.updated.length,
      skippedEntries: result.skipped,
      createdTeams: result.created,
      updatedTeams: result.updated,
    };
  }

  // Exposed for testing
  static _clearCache() {
    fileCache.clear();
  }

  static _getCache() {
    return fileCache;
  }
}
