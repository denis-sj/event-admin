import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

function generateJuryToken(): string {
  return randomBytes(32).toString("hex");
}

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.score.deleteMany();
  await prisma.teamEvaluation.deleteMany();
  await prisma.diploma.deleteMany();
  await prisma.diplomaSettings.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.juryMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.task.deleteMany();
  await prisma.criterion.deleteMany();
  await prisma.event.deleteMany();
  await prisma.organizer.deleteMany();

  // 1. Create organizer
  const organizer = await prisma.organizer.create({
    data: {
      id: randomUUID(),
      email: "admin@ideathon.local",
      passwordHash: await hashPassword("password123"),
      name: "Иван Организаторов",
    },
  });
  console.log(`  Created organizer: ${organizer.email}`);

  // 2. Create event
  const event = await prisma.event.create({
    data: {
      id: randomUUID(),
      organizerId: organizer.id,
      title: "Идеатон «Будущее технологий»",
      description:
        "Ежегодный идеатон для студентов и молодых специалистов. Участники представляют свои проекты в области технологий будущего.",
      date: new Date("2026-04-15T10:00:00Z"),
      status: "DRAFT",
      timerDuration: 300,
      uniqueTaskAssignment: false,
    },
  });
  console.log(`  Created event: ${event.title}`);

  // 3. Create criteria
  const criteria = await Promise.all([
    prisma.criterion.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: "Инновационность",
        description: "Оригинальность и новизна предложенного решения",
        maxScore: 10,
        sortOrder: 0,
      },
    }),
    prisma.criterion.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: "Реализуемость",
        description:
          "Техническая осуществимость и реалистичность внедрения проекта",
        maxScore: 10,
        sortOrder: 1,
      },
    }),
    prisma.criterion.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: "Презентация",
        description: "Качество выступления, наглядность и убедительность",
        maxScore: 5,
        sortOrder: 2,
      },
    }),
  ]);
  console.log(`  Created ${criteria.length} criteria`);

  // 4. Create tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        title: "Умный город",
        description:
          "Разработать концепцию решения для улучшения городской инфраструктуры с использованием IoT и AI",
        difficulty: "HIGH",
      },
    }),
    prisma.task.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        title: "EdTech платформа",
        description:
          "Предложить инновационное решение в сфере образовательных технологий",
        difficulty: "MEDIUM",
      },
    }),
  ]);
  console.log(`  Created ${tasks.length} tasks`);

  // 5. Create teams with participants
  const teamsData = [
    {
      name: "Команда «Альфа»",
      projectDescription: "Платформа для мониторинга качества воздуха в городе",
      taskId: tasks[0].id,
      presentationOrder: 1,
      participants: [
        { name: "Алексей Петров", email: "petrov@example.com" },
        { name: "Мария Иванова", email: "ivanova@example.com" },
        { name: "Дмитрий Сидоров", email: "sidorov@example.com" },
      ],
    },
    {
      name: "Команда «Бета»",
      projectDescription:
        "Адаптивная система обучения на основе машинного обучения",
      taskId: tasks[1].id,
      presentationOrder: 2,
      participants: [
        { name: "Елена Козлова", email: "kozlova@example.com" },
        { name: "Андрей Новиков", email: "novikov@example.com" },
      ],
    },
    {
      name: "Команда «Гамма»",
      projectDescription: "Система умного управления энергопотреблением зданий",
      taskId: tasks[0].id,
      presentationOrder: 3,
      participants: [
        { name: "Ольга Федорова", email: "fedorova@example.com" },
        { name: "Сергей Морозов", email: "morozov@example.com" },
        { name: "Анна Волкова", email: "volkova@example.com" },
        { name: "Игорь Лебедев", email: "lebedev@example.com" },
      ],
    },
  ];

  for (const teamData of teamsData) {
    const team = await prisma.team.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: teamData.name,
        projectDescription: teamData.projectDescription,
        taskId: teamData.taskId,
        presentationOrder: teamData.presentationOrder,
        participants: {
          create: teamData.participants.map((p) => ({
            id: randomUUID(),
            name: p.name,
            email: p.email,
          })),
        },
      },
    });
    console.log(
      `  Created team: ${team.name} (${teamData.participants.length} participants)`,
    );
  }

  // 6. Create jury members
  const juryMembers = await Promise.all([
    prisma.juryMember.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: "Профессор Смирнов А.В.",
        email: "smirnov@university.edu",
        token: generateJuryToken(),
      },
    }),
    prisma.juryMember.create({
      data: {
        id: randomUUID(),
        eventId: event.id,
        name: "Эксперт Кузнецова Е.М.",
        email: "kuznetsova@techcorp.com",
        token: generateJuryToken(),
      },
    }),
  ]);
  console.log(`  Created ${juryMembers.length} jury members`);
  for (const jury of juryMembers) {
    console.log(`    ${jury.name}: /jury/${jury.token}`);
  }

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
