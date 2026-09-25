// Confere a configuração de e-mail e manda uma mensagem de teste, sem imprimir credenciais.
//   npm run mail:test -- --to voce@exemplo.com
import { env } from "../src/env";
import { sendMail, verifyMailer } from "../src/lib/mailer";

const i = process.argv.indexOf("--to");
const to = i >= 0 ? process.argv[i + 1] : undefined;
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error("Uso: npm run mail:test -- --to voce@exemplo.com");
  process.exit(1);
}

async function main() {
  if (!(await verifyMailer())) {
    console.log("SMTP não configurado: a mensagem vai para server/.mail-outbox. Rode: npm run setup:env -- --resend");
  } else {
    console.log(`Conexão e login no SMTP OK (${env.SMTP_HOST}:${env.SMTP_PORT}).`);
  }
  await sendMail({
    to: to!,
    subject: "Teste de e-mail do Prontuário por Voz",
    text: "Se você recebeu esta mensagem, o envio de e-mails está funcionando.",
    html: '<p style="font-family:Arial,sans-serif">Se você recebeu esta mensagem, o envio de e-mails do <b>Prontuário por Voz</b> está funcionando.</p>',
  });
  console.log(`Mensagem de teste enviada para ${to} (remetente: ${env.MAIL_FROM}).`);
}

main().catch((err) => {
  // Só a mensagem do erro: nunca o objeto inteiro (pode conter a configuração com a senha).
  console.error("Falha no envio:", (err as Error).message);
  process.exit(1);
});
