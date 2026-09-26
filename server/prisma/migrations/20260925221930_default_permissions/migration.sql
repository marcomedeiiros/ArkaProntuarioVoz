-- Matriz inicial = comportamento que o sistema já tinha:
-- Administração: tudo. Médico(a): pacientes, consultas e financeiro. Secretária: pacientes e financeiro.
INSERT INTO "RolePermission" ("role", "permission") VALUES
  ('ADMIN', 'PATIENTS'), ('ADMIN', 'CONSULTATIONS'), ('ADMIN', 'FINANCE'), ('ADMIN', 'TEAM'),
  ('DOCTOR', 'PATIENTS'), ('DOCTOR', 'CONSULTATIONS'), ('DOCTOR', 'FINANCE'),
  ('SECRETARY', 'PATIENTS'), ('SECRETARY', 'FINANCE')
ON CONFLICT DO NOTHING;
