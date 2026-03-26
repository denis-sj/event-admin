import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import archiver from 'archiver';
import { nanoid } from 'nanoid';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { formatDateRu } from '../utils/date.js';
import { ResultsService } from './results.service.js';
import {
  VERIFICATION_CODE_LENGTH,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_TEXT_COLOR,
} from '@ideathon/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIPLOMAS_DIR = path.resolve(__dirname, '../..', config.UPLOAD_DIR, 'diplomas');

export const diplomaSettingsParamValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
});

export const updateDiplomaSettingsValidation = z.object({
  params: z.object({ eventId: z.string().uuid() }),
  body: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }),
});

export const diplomaTeamParamValidation = z.object({
  params: z.object({
    eventId: z.string().uuid(),
    teamId: z.string().uuid(),
  }),
});

function ensureDiplomasDir(eventId: string): string {
  const eventDir = path.join(DIPLOMAS_DIR, eventId);
  if (!fs.existsSync(eventDir)) {
    fs.mkdirSync(eventDir, { recursive: true });
  }
  return eventDir;
}

export class DiplomaService {
  // --- DiplomaSettings CRUD ---

  static async getSettings(eventId: string, organizerId: string) {
    await this.verifyOwnership(eventId, organizerId);

    let settings = await prisma.diplomaSettings.findUnique({
      where: { eventId },
    });

    if (!settings) {
      settings = await prisma.diplomaSettings.create({
        data: {
          eventId,
          primaryColor: DEFAULT_PRIMARY_COLOR,
          textColor: DEFAULT_TEXT_COLOR,
        },
      });
    }

    return settings;
  }

  static async updateSettings(
    eventId: string,
    organizerId: string,
    data: { primaryColor?: string; textColor?: string },
  ) {
    await this.verifyOwnership(eventId, organizerId);

    // Ensure settings exist
    await this.getSettings(eventId, organizerId);

    return prisma.diplomaSettings.update({
      where: { eventId },
      data: {
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.textColor !== undefined && { textColor: data.textColor }),
      },
    });
  }

  static async uploadBackground(eventId: string, organizerId: string, filePath: string) {
    await this.verifyOwnership(eventId, organizerId);

    // Ensure settings exist
    await this.getSettings(eventId, organizerId);

    return prisma.diplomaSettings.update({
      where: { eventId },
      data: { backgroundPath: filePath },
    });
  }

  // --- Diploma generation ---

  static async generatePreview(eventId: string, organizerId: string): Promise<Buffer> {
    await this.verifyOwnership(eventId, organizerId);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { title: true, date: true, logoPath: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    const settings = await this.getSettings(eventId, organizerId);

    // Generate preview with dummy data
    return this.renderDiplomaPdf({
      eventTitle: event.title,
      eventDate: event.date,
      eventLogoPath: event.logoPath,
      teamName: 'Example Team',
      participantNames: ['Participant 1', 'Participant 2', 'Participant 3'],
      taskTitle: 'Example Task',
      rank: 1,
      totalScore: 95.5,
      verificationCode: 'PREVIEW12345',
      settings,
    });
  }

  static async generateAll(eventId: string, organizerId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, status: true, title: true, date: true, logoPath: true },
    });

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw ApiError.forbidden('Access denied');
    }

    if (event.status !== 'COMPLETED') {
      throw ApiError.conflict(
        'Event must be completed before generating diplomas',
        'EVENT_NOT_COMPLETED',
      );
    }

    const settings = await this.getSettings(eventId, organizerId);
    const { teams: results } = await ResultsService.calculateResults(eventId);

    if (results.length === 0) {
      throw ApiError.badRequest('No teams with results to generate diplomas for');
    }

    const eventDir = ensureDiplomasDir(eventId);

    const diplomas = [];

    for (const teamResult of results) {
      const team = await prisma.team.findUnique({
        where: { id: teamResult.id },
        include: {
          participants: { select: { name: true } },
          task: { select: { title: true } },
        },
      });

      if (!team) continue;

      const verificationCode = nanoid(VERIFICATION_CODE_LENGTH);

      const pdfBuffer = await this.renderDiplomaPdf({
        eventTitle: event.title,
        eventDate: event.date,
        eventLogoPath: event.logoPath,
        teamName: team.name,
        participantNames: team.participants.map((p) => p.name),
        taskTitle: team.task?.title ?? null,
        rank: teamResult.rank,
        totalScore: teamResult.totalAvgScore,
        verificationCode,
        settings,
      });

      // Use teamId for collision-proof filenames
      const fileName = `diploma-${team.id}.pdf`;
      const filePath = path.join(eventDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);

      const relativePath = `/uploads/diplomas/${eventId}/${fileName}`;

      // Upsert diploma record
      const diploma = await prisma.diploma.upsert({
        where: { teamId: team.id },
        create: {
          teamId: team.id,
          verificationCode,
          filePath: relativePath,
          rank: teamResult.rank,
          totalScore: teamResult.totalAvgScore,
        },
        update: {
          verificationCode,
          filePath: relativePath,
          rank: teamResult.rank,
          totalScore: teamResult.totalAvgScore,
          generatedAt: new Date(),
        },
      });

      diplomas.push(diploma);
    }

    return diplomas;
  }

  static async getDiplomaForTeam(eventId: string, organizerId: string, teamId: string) {
    await this.verifyOwnership(eventId, organizerId);

    const diploma = await prisma.diploma.findUnique({
      where: { teamId },
      include: { team: { select: { name: true, eventId: true } } },
    });

    if (!diploma || diploma.team.eventId !== eventId) {
      throw ApiError.notFound('Diploma not found');
    }

    return diploma;
  }

  static async downloadAll(eventId: string, organizerId: string): Promise<{ stream: archiver.Archiver; filename: string }> {
    await this.verifyOwnership(eventId, organizerId);

    const eventDir = path.join(DIPLOMAS_DIR, eventId);

    if (!fs.existsSync(eventDir)) {
      throw ApiError.notFound('No diplomas generated yet');
    }

    const files = fs.readdirSync(eventDir).filter((f) => f.endsWith('.pdf'));

    if (files.length === 0) {
      throw ApiError.notFound('No diplomas generated yet');
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    for (const file of files) {
      archive.file(path.join(eventDir, file), { name: file });
    }

    archive.finalize();

    return {
      stream: archive,
      filename: `diplomas-${eventId}.zip`,
    };
  }

  // --- Public verification ---

  static async verify(verificationCode: string) {
    const diploma = await prisma.diploma.findUnique({
      where: { verificationCode },
      include: {
        team: {
          include: {
            event: {
              select: { id: true, title: true, date: true },
            },
            participants: {
              select: { name: true },
            },
            task: {
              select: { title: true },
            },
          },
        },
      },
    });

    if (!diploma) {
      throw ApiError.notFound('Diploma not found');
    }

    return {
      eventTitle: diploma.team.event.title,
      eventDate: formatDateRu(diploma.team.event.date),
      teamName: diploma.team.name,
      participants: diploma.team.participants.map((p) => p.name),
      taskTitle: diploma.team.task?.title ?? null,
      rank: diploma.rank,
      totalScore: diploma.totalScore,
      generatedAt: formatDateRu(diploma.generatedAt),
    };
  }

  // --- Private helpers ---

  private static async verifyOwnership(eventId: string, organizerId: string) {
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
  }

  private static async renderDiplomaPdf(params: {
    eventTitle: string;
    eventDate: Date;
    eventLogoPath: string | null;
    teamName: string;
    participantNames: string[];
    taskTitle: string | null;
    rank: number;
    totalScore: number;
    verificationCode: string;
    settings: { primaryColor: string; textColor: string; backgroundPath: string | null };
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { primaryColor, textColor } = params.settings;
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Background image if available
      if (params.settings.backgroundPath) {
        const bgPath = path.resolve(__dirname, '../..', config.UPLOAD_DIR, params.settings.backgroundPath.replace('/uploads/', ''));
        if (fs.existsSync(bgPath)) {
          doc.image(bgPath, 0, 0, { width: pageWidth, height: pageHeight });
        }
      }

      // Border
      doc.rect(30, 30, pageWidth - 60, pageHeight - 60).lineWidth(2).stroke(primaryColor);
      doc.rect(35, 35, pageWidth - 70, pageHeight - 70).lineWidth(0.5).stroke(primaryColor);

      let yPos = 60;

      // Logo (if available)
      if (params.eventLogoPath) {
        const logoAbsPath = path.resolve(__dirname, '../..', config.UPLOAD_DIR, params.eventLogoPath.replace('/uploads/', ''));
        if (fs.existsSync(logoAbsPath)) {
          doc.image(logoAbsPath, pageWidth / 2 - 30, yPos, { width: 60, height: 60, align: 'center' });
          yPos += 70;
        }
      }

      // Title
      doc
        .fontSize(28)
        .fillColor(primaryColor)
        .text('DIPLOMA', 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 45;

      // Event title
      doc
        .fontSize(18)
        .fillColor(textColor)
        .text(params.eventTitle, 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 30;

      // Date
      const dateStr = formatDateRu(params.eventDate);
      doc
        .fontSize(12)
        .fillColor(textColor)
        .text(dateStr, 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 30;

      // Rank
      const rankText = `${params.rank} place`;
      doc
        .fontSize(22)
        .fillColor(primaryColor)
        .text(rankText, 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 35;

      // Team name
      doc
        .fontSize(20)
        .fillColor(textColor)
        .text(`Team: ${params.teamName}`, 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 30;

      // Participants
      if (params.participantNames.length > 0) {
        doc
          .fontSize(12)
          .fillColor(textColor)
          .text(params.participantNames.join(', '), 80, yPos, {
            align: 'center',
            width: pageWidth - 160,
          });
        yPos += 25;
      }

      // Task
      if (params.taskTitle) {
        doc
          .fontSize(12)
          .fillColor(textColor)
          .text(`Task: ${params.taskTitle}`, 50, yPos, { align: 'center', width: pageWidth - 100 });
        yPos += 25;
      }

      // Total score
      doc
        .fontSize(14)
        .fillColor(primaryColor)
        .text(`Total score: ${params.totalScore}`, 50, yPos, { align: 'center', width: pageWidth - 100 });
      yPos += 30;

      // QR code with verification URL
      const verifyUrl = `${config.BASE_URL}/verify/${params.verificationCode}`;

      // Generate QR code as data URL (sync-style via callback-to-promise wrapper above)
      QRCode.toDataURL(verifyUrl, { width: 80, margin: 1 })
        .then((qrDataUrl) => {
          const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
          doc.image(qrBuffer, pageWidth / 2 - 40, yPos, { width: 80, height: 80 });

          // Verification code text below QR
          doc
            .fontSize(8)
            .fillColor(textColor)
            .text(params.verificationCode, 50, yPos + 85, { align: 'center', width: pageWidth - 100 });

          doc.end();
        })
        .catch(() => {
          // If QR fails, just finish without it
          doc.end();
        });
    });
  }
}
