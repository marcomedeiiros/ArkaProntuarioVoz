// Cria uma clínica de demonstração com equipe, pacientes, consultas e lançamentos.
// Pode rodar quantas vezes quiser: a clínica demo anterior é apagada e recriada.
//
// Nenhuma senha fica no código. Use SEED_ADMIN_PASSWORD / SEED_SECRETARY_PASSWORD no .env
// ou deixe em branco para gerar senhas fortes a cada execução. As credenciais vão para
// server/.demo-credentials (ignorado pelo git) e nunca são impressas no terminal.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../src/lib/default-categories";

if (process.env.NODE_ENV === "production") {
  console.error("O seed de demonstração não roda em produção.");
  process.exit(1);
}

const prisma = new PrismaClient();

const CREDENTIALS_FILE = resolve(__dirname, "../.demo-credentials");
const strongPassword = () => randomBytes(18).toString("base64url");
const fromEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (value && value.length < 12) throw new Error(`${name} precisa ter pelo menos 12 caracteres.`);
  return value || undefined;
};

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@demo.local";
const ADMIN_PASSWORD = fromEnv("SEED_ADMIN_PASSWORD") ?? strongPassword();
const SECRETARY_EMAIL = process.env.SEED_SECRETARY_EMAIL?.trim().toLowerCase() || "secretaria@demo.local";
const SECRETARY_PASSWORD = fromEnv("SEED_SECRETARY_PASSWORD") ?? strongPassword();
// E-mails usados por versões antigas do seed: a clínica demo antiga também é apagada.
const LEGACY_EMAILS = ["admin@pedscribe.dev"];

const daysAgo = (n: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
/** Datas de lançamento são meia-noite UTC do dia (mesmo formato que a API grava). */
const dayUTC = (n: number) => {
  const d = daysAgo(n);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
const birth = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  const previous = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, SECRETARY_EMAIL, ...LEGACY_EMAILS] } },
    select: { clinicId: true },
  });
  const clinicIds = [...new Set(previous.map((u) => u.clinicId))];
  if (clinicIds.length) await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });

  const clinic = await prisma.clinic.create({
    data: {
      name: "Consultório Dra. Ana (demonstração)",
      categories: { create: DEFAULT_CATEGORIES.map((c) => ({ ...c })) },
      users: {
        create: [
          {
            name: "Dra. Ana Souza",
            email: ADMIN_EMAIL,
            passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
            role: "ADMIN",
          },
          {
            name: "Carla (secretária)",
            email: SECRETARY_EMAIL,
            passwordHash: await bcrypt.hash(SECRETARY_PASSWORD, 12),
            role: "SECRETARY",
          },
        ],
      },
    },
    include: { users: true, categories: true },
  });
  const doctor = clinic.users.find((u) => u.role === "ADMIN")!;
  const cat = (name: string) => clinic.categories.find((c) => c.name === name)!.id;

  const [joao, helena, miguel, laura, theo] = await Promise.all(
    [
      { name: "João Pedro Lima", birthDate: birth(dateMonthsAgo(3)), sex: "M", guardianName: "Mariana Lima", guardianPhone: "27998112233" },
      { name: "Helena Martins", birthDate: birth(dateMonthsAgo(26)), sex: "F", guardianName: "Rafael Martins", guardianPhone: "27997224455", allergies: "Dipirona" },
      { name: "Miguel Costa", birthDate: birth(dateMonthsAgo(58)), sex: "M", guardianName: "Juliana Costa", guardianPhone: "27996336677" },
      { name: "Laura Ferreira", birthDate: birth(dateMonthsAgo(9)), sex: "F", guardianName: "Patrícia Ferreira", guardianPhone: "27995448899", notes: "Prematura de 35 semanas" },
      { name: "Theo Almeida", birthDate: birth(dateMonthsAgo(14)), sex: "M", guardianName: "Bruna Almeida", guardianPhone: "27994551122" },
    ].map((p) => prisma.patient.create({ data: { ...p, sex: p.sex as "M" | "F", clinicId: clinic.id } })),
  );

  const base = { clinicId: clinic.id, doctorId: doctor.id };

  const puericultura = await prisma.consultation.create({
    data: {
      ...base,
      patientId: joao.id,
      template: "PUERICULTURA",
      status: "FINALIZED",
      weightKg: 6.2,
      heightCm: 61,
      createdAt: daysAgo(2, 9),
      generatedAt: daysAgo(2, 9),
      transcript:
        "Bom dia, mãe. Como ele está? Está ótimo, mamando só no peito, livre demanda, umas oito vezes por dia. Dorme bem, acorda duas vezes à noite para mamar. Faz xixi várias vezes e cocô amarelinho todo dia. Já sustenta a cabeça e sorri quando a gente conversa. Vacinas dos dois meses feitas. No exame: bom estado geral, fontanela anterior normotensa, ausculta cardíaca e pulmonar sem alterações, abdome sem alterações, quadril sem alterações. Peso 6,2 quilos, estatura 61 centímetros. Vamos manter aleitamento exclusivo, vitamina D 400 unidades, duas gotas ao dia, e retorno com quatro meses para as vacinas.",
      evolution:
        "IDENTIFICAÇÃO: lactente de 3 meses, acompanhado pela mãe.\n\nQUEIXAS E INTERCORRÊNCIAS: sem queixas. Sem intercorrências desde a última consulta.\n\nALIMENTAÇÃO: aleitamento materno exclusivo, em livre demanda, cerca de 8 mamadas ao dia.\n\nSONO: sono tranquilo, despertares noturnos (2x) para mamar.\n\nELIMINAÇÕES: diurese presente e frequente. Evacuações diárias, amareladas.\n\nDESENVOLVIMENTO NEUROPSICOMOTOR: sustento cefálico e sorriso social presentes. Adequado para a idade.\n\nVACINAÇÃO: vacinas dos 2 meses realizadas.\n\nEXAME FÍSICO E ANTROPOMETRIA: BEG. Fontanela anterior normotensa. Ausculta cardíaca e pulmonar sem alterações. Abdome sem alterações. Quadril sem alterações. Peso 6,2 kg, estatura 61 cm.\n\nAVALIAÇÃO: lactente eutrófico, com desenvolvimento adequado.\n\nCONDUTA E ORIENTAÇÕES: manter aleitamento materno exclusivo. Suplementação de vitamina D.\n\nRETORNO: aos 4 meses, para vacinação.",
      prescription: [{ medicamento: "Colecalciferol (vitamina D) 200 UI/gota", posologia: "2 gotas por via oral, 1x ao dia", duracao: "Uso contínuo" }],
      prescriptionNotes: "Manter aleitamento materno exclusivo em livre demanda. Retorno aos 4 meses.",
      parentGuide:
        "*Como foi a consulta do João hoje* 💙\n\nO João está crescendo lindamente! Ele está com 6,2 kg e 61 cm, e o desenvolvimento está certinho para a idade.\n\n*Alimentação*\n• Continue só com o peito, sempre que ele pedir. Não precisa de água, chá nem outro leite.\n\n*Vitamina D* ☀️\n• 2 gotinhas por dia, direto na boca, todos os dias.\n\n*Procure atendimento se*\n• Febre (38 °C ou mais)\n• Recusar mamar ou ficar muito sonolento\n• Dificuldade para respirar\n\n*Próxima consulta*\n• Aos 4 meses, para as vacinas.\n\nQualquer dúvida, é só chamar! 🤗",
      alerts: [],
    },
  });

  await prisma.consultation.create({
    data: {
      ...base,
      patientId: helena.id,
      template: "URGENCIA",
      status: "GENERATED",
      weightKg: 12.4,
      createdAt: daysAgo(0, 11),
      generatedAt: daysAgo(0, 11),
      transcript:
        "O que aconteceu com a Helena? Febre desde ontem, 38 e meio, e está puxando a orelha direita, chorando à noite. Está comendo pouco mas bebendo líquido. Sem vômito, sem diarreia. Lembrando que ela tem alergia a dipirona. Exame: otoscopia com membrana timpânica direita abaulada e hiperemiada, esquerda normal. Orofaringe sem alterações, pulmões limpos. Otite média aguda à direita. Vou passar amoxicilina 400 miligramas por 5 mL e paracetamol para febre e dor. Retorno se não melhorar em 48 a 72 horas.",
      evolution:
        "QUEIXA PRINCIPAL: febre e otalgia à direita.\n\nHISTÓRIA DA DOENÇA ATUAL: febre de até 38,5 °C há 1 dia, associada a otalgia à direita (leva a mão à orelha) e choro noturno. Hiporexia, com boa aceitação de líquidos. Nega vômitos e diarreia.\n\nANTECEDENTES, ALERGIAS E MEDICAÇÕES: alergia a dipirona.\n\nEXAME FÍSICO: otoscopia com membrana timpânica direita abaulada e hiperemiada; esquerda sem alterações. Orofaringe sem alterações. Ausculta pulmonar limpa.\n\nHIPÓTESE DIAGNÓSTICA: otite média aguda à direita.\n\nCONDUTA: antibioticoterapia com amoxicilina e analgesia/antitérmico com paracetamol.\n\nSINAIS DE ALARME ORIENTADOS: não abordado na consulta.\n\nRETORNO: se não houver melhora em 48 a 72 horas.",
      prescription: [
        { medicamento: "Amoxicilina 400 mg/5 mL suspensão oral", posologia: "A DEFINIR", duracao: "A DEFINIR" },
        { medicamento: "Paracetamol gotas", posologia: "A DEFINIR", duracao: "Se febre ou dor" },
      ],
      prescriptionNotes: "Oferecer bastante líquido. Retornar se não houver melhora em 48 a 72 horas.",
      parentGuide:
        "*Como foi a consulta da Helena hoje* 💙\n\nA Helena está com uma infecção no ouvido direito (otite). É comum nessa idade e tem tratamento!\n\n*Remédios* 💊\n• Amoxicilina: conforme a receita, até o fim, mesmo que ela melhore antes.\n• Paracetamol: conforme a receita, se tiver febre ou dor.\n• Lembrete: a Helena tem alergia a dipirona, não use.\n\n*Em casa*\n• Ofereça bastante líquido.\n\n*Volte ao consultório se*\n• Não melhorar em 2 a 3 dias.\n\nQualquer dúvida, estamos aqui! 🤗",
      alerts: [
        "Dose e intervalo da amoxicilina não foram ditos na consulta. Defina a posologia (peso registrado: 12,4 kg).",
        "Dose do paracetamol não foi dita.",
        "Sinais de alarme não foram verbalizados. Considere incluí-los no guia antes de enviar.",
      ],
    },
  });

  await prisma.consultation.create({
    data: {
      ...base,
      patientId: laura.id,
      template: "PUERICULTURA",
      status: "DRAFT",
      weightKg: 8.1,
      createdAt: daysAgo(0, 14),
      transcript:
        "Oi, mãe. Como a Laura está? Está bem. Começamos a introdução alimentar no mês passado, ela aceita bem papa de legumes e frutas, ainda mama no peito umas quatro vezes. Já senta sem apoio e está começando a engatinhar. Fala mamã e papá. Vacinas dos seis meses em dia, falta a de nove. Exame físico normal, peso 8,1 quilos. Vou orientar manter a introdução alimentar, oferecer água, e fazer a vacina de febre amarela hoje. Retorno com doze meses.",
    },
  });

  const income = (d: {
    amount: number; method: "PIX" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "DINHEIRO" | "CONVENIO";
    category: string; day: number; patientId?: string; consultationId?: string; status?: "PAID" | "PENDING";
  }) => ({
    clinicId: clinic.id, type: "INCOME" as const, amount: d.amount, method: d.method, categoryId: cat(d.category),
    date: dayUTC(d.day), patientId: d.patientId, consultationId: d.consultationId, status: d.status ?? "PAID",
  });
  const expense = (amount: number, category: string, day: number, description: string) => ({
    clinicId: clinic.id, type: "EXPENSE" as const, amount, method: "PIX" as const, categoryId: cat(category),
    date: dayUTC(day), description, status: "PAID" as const,
  });

  // Mantém tudo no mês corrente para aparecer no resumo.
  const dayOfMonth = new Date().getDate();
  const d = (n: number) => Math.min(n, dayOfMonth - 1);

  await prisma.transaction.createMany({
    data: [
      income({ amount: 350, method: "PIX", category: "Puericultura", day: d(2), patientId: joao.id, consultationId: puericultura.id }),
      income({ amount: 400, method: "CARTAO_CREDITO", category: "Consulta particular", day: 0, patientId: helena.id }),
      income({ amount: 350, method: "PIX", category: "Puericultura", day: 0, patientId: laura.id, status: "PENDING" }),
      income({ amount: 180, method: "CONVENIO", category: "Convênio", day: d(5), patientId: miguel.id }),
      income({ amount: 150, method: "DINHEIRO", category: "Retorno", day: d(6), patientId: theo.id }),
      income({ amount: 350, method: "CARTAO_DEBITO", category: "Puericultura", day: d(9), patientId: theo.id }),
      expense(2500, "Aluguel", d(10), "Aluguel da sala"),
      expense(289, "Softwares", d(8), "Assinaturas mensais"),
      expense(420, "Materiais e insumos", d(4), "Luvas, espátulas e abaixadores"),
    ],
  });

  writeFileSync(
    CREDENTIALS_FILE,
    [
      "# Credenciais da clínica de demonstração (somente desenvolvimento).",
      "# Gerado pelo seed. NÃO commite, NÃO compartilhe. Rodar o seed de novo troca as senhas.",
      `ADMIN_EMAIL=${ADMIN_EMAIL}`,
      `ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      `SECRETARY_EMAIL=${SECRETARY_EMAIL}`,
      `SECRETARY_PASSWORD=${SECRETARY_PASSWORD}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  console.log("\nClínica de demonstração criada.");
  console.log(`Credenciais salvas em ${CREDENTIALS_FILE} (arquivo local, ignorado pelo git).\n`);
}

function dateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
