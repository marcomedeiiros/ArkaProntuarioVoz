import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ConsultationTemplate, Sex } from "@prisma/client";
import { HttpError } from "../lib/http-error";

const client = new Anthropic();

export const ScribeOutputSchema = z.object({
  evolucao: z
    .string()
    .describe("Evolução clínica em texto corrido com seções, pronta para colar no prontuário (iClinic)."),
  prescricao: z
    .array(
      z.object({
        medicamento: z.string().describe("Nome do medicamento e apresentação/concentração, se citada"),
        posologia: z.string().describe("Dose, via e intervalo exatamente como ditos; 'A DEFINIR' se não foi dito"),
        duracao: z.string().describe("Duração do tratamento; 'A DEFINIR' se não foi dita"),
      }),
    )
    .describe("Medicamentos prescritos na consulta, para transcrever no Memed. Vazio se nenhum."),
  orientacoesReceita: z
    .string()
    .describe("Orientações não medicamentosas para acompanhar a receita (cuidados, dieta, retorno)."),
  guiaPais: z.string().describe("Guia de orientações aos pais formatado para WhatsApp."),
  alertas: z
    .array(z.string())
    .describe("Pontos que a médica precisa revisar: doses ausentes, informações ambíguas ou faltantes."),
});

export type ScribeOutput = z.infer<typeof ScribeOutputSchema>;

const TEMPLATE_SECTIONS: Record<ConsultationTemplate, string> = {
  PUERICULTURA: `Consulta de PUERICULTURA. Estruture a evolução com as seções:
- Identificação (idade atual, acompanhante)
- Queixas e intercorrências desde a última consulta
- Alimentação (aleitamento materno exclusivo/misto, fórmula, introdução alimentar, dificuldades)
- Sono
- Eliminações (diurese e evacuações)
- Desenvolvimento neuropsicomotor (marcos citados e se estão adequados para a idade)
- Vacinação (situação do cartão, vacinas aplicadas/pendentes)
- Exame físico e antropometria (peso, estatura, perímetro cefálico, se citados)
- Avaliação
- Conduta e orientações
- Retorno`,
  URGENCIA: `Consulta GERAL / URGÊNCIA. Estruture a evolução com as seções:
- Queixa principal
- História da doença atual
- Antecedentes relevantes, alergias e medicações em uso
- Exame físico
- Hipótese diagnóstica
- Conduta
- Sinais de alarme orientados
- Retorno`,
};

const SYSTEM_PROMPT = `Você é um assistente de documentação clínica para consultórios de pediatria no Brasil. Recebe a transcrição automática (voz para texto, com possíveis erros) de uma consulta entre a pediatra, a criança e os responsáveis, e produz rascunhos que a médica vai revisar antes de usar.

Regras clínicas:
- Use apenas informações presentes na transcrição. Não invente achados de exame, diagnósticos, doses, vacinas ou marcos. Se uma seção não foi abordada, escreva "Não abordado na consulta".
- Nunca calcule nem sugira doses por conta própria. Se a médica citou o medicamento sem a dose, a posologia é "A DEFINIR" e isso vira um alerta.
- A transcrição por voz erra nomes de medicamentos e números. Quando algo parecer um erro de transcrição, mantenha o que é mais provável e registre em "alertas" para a médica conferir.
- Escreva a evolução em linguagem técnica médica, em português do Brasil, em terceira pessoa, com as seções como títulos em maiúsculas seguidos de dois-pontos. Sem markdown.

Guia dos pais (guiaPais):
- Destinado aos responsáveis, enviado por WhatsApp. Linguagem simples, calorosa e acolhedora, sem jargão médico, tratando pelo nome da criança.
- Formatação de WhatsApp: *negrito* para títulos curtos, listas com "•", poucos emojis (no máximo um por seção).
- Inclua: resumo do que foi visto, como dar cada medicamento (horários e duração, como prescrito), cuidados em casa, sinais de alarme que exigem voltar ou ir ao pronto-socorro, e data/orientação de retorno. Omita o que não foi abordado.
- Se houver posologia "A DEFINIR", escreva "conforme a receita" nesse item em vez de inventar.`;

function formatAge(birthDate: Date, at: Date): string {
  let months = (at.getFullYear() - birthDate.getFullYear()) * 12 + (at.getMonth() - birthDate.getMonth());
  if (at.getDate() < birthDate.getDate()) months--;
  if (months < 1) {
    const days = Math.floor((at.getTime() - birthDate.getTime()) / 86_400_000);
    return `${days} dia(s)`;
  }
  if (months < 24) return `${months} mes(es)`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} ano(s) e ${rest} mes(es)` : `${years} ano(s)`;
}

export interface ScribeInput {
  template: ConsultationTemplate;
  transcript: string;
  patient: { name: string; birthDate: Date; sex: Sex; guardianName: string; allergies: string | null };
  weightKg: number | null;
  heightCm: number | null;
  consultationDate: Date;
}

export async function generateClinicalDocs(input: ScribeInput): Promise<ScribeOutput> {
  const { patient } = input;
  const context = [
    `Paciente: ${patient.name}`,
    `Sexo: ${patient.sex === "M" ? "masculino" : "feminino"}`,
    `Idade: ${formatAge(patient.birthDate, input.consultationDate)}`,
    `Responsável: ${patient.guardianName}`,
    `Alergias cadastradas: ${patient.allergies || "nenhuma informada"}`,
    input.weightKg != null && `Peso aferido: ${input.weightKg} kg`,
    input.heightCm != null && `Estatura aferida: ${input.heightCm} cm`,
    `Data da consulta: ${input.consultationDate.toLocaleDateString("pt-BR")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${TEMPLATE_SECTIONS[input.template]}

<dados_paciente>
${context}
</dados_paciente>

<transcricao>
${input.transcript}
</transcricao>`,
      },
    ],
    output_config: { format: zodOutputFormat(ScribeOutputSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "A IA não conseguiu processar esta transcrição. Revise o texto e tente novamente.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new HttpError(502, "A resposta da IA veio incompleta. Tente gerar novamente.");
  }
  return response.parsed_output;
}
