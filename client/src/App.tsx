import { Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth, useCan } from "./auth";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientDetailPage } from "./pages/PatientDetailPage";
import { ConsultationsPage } from "./pages/ConsultationsPage";
import { ConsultationPage } from "./pages/ConsultationPage";
import { FinancePage } from "./pages/FinancePage";
import { TeamPage } from "./pages/TeamPage";
import { AccountPage } from "./pages/AccountPage";
import { AgendaPage } from "./pages/AgendaPage";
import { ApprovalsPage } from "./pages/arka/ApprovalsPage";
import { SettingsPage } from "./pages/arka/SettingsPage";
import { ClinicDetailPage } from "./pages/arka/ClinicDetailPage";
import type { ReactElement } from "react";

/** Só mostra a tela se a permissão deixar; senão volta para o início. A API confere de novo. */
const only = (allowed: boolean, page: ReactElement) => (allowed ? page : <Navigate to="/" replace />);

export function App() {
  const { session, loading } = useAuth();
  const can = useCan();

  if (loading)
    return (
      <div className="full-loader">
        <LoaderCircle className="spin" size={28} />
      </div>
    );

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {/* A conta da Arka começa na liberação de clínicas; ela não tem painel de clínica. */}
        <Route index element={can.arka ? <Navigate to="/arka/liberacao" replace /> : <DashboardPage />} />
        <Route path="agenda" element={only(can.has("SCHEDULE"), <AgendaPage />)} />
        <Route path="pacientes" element={only(can.patients, <PatientsPage />)} />
        <Route path="pacientes/:id" element={only(can.patients, <PatientDetailPage />)} />
        <Route path="consultas" element={only(can.consultations, <ConsultationsPage />)} />
        <Route path="consultas/:id" element={only(can.consultations, <ConsultationPage />)} />
        <Route path="financeiro" element={only(can.finance, <FinancePage />)} />
        <Route path="equipe" element={only(can.team, <TeamPage />)} />
        <Route path="conta" element={<AccountPage />} />
        <Route path="arka/liberacao" element={only(can.arka, <ApprovalsPage />)} />
        <Route path="arka/clinicas/:id" element={only(can.arka, <ClinicDetailPage />)} />
        <Route path="arka/configuracoes" element={only(can.arka, <SettingsPage />)} />
      </Route>
      {/* O link do e-mail funciona mesmo com alguém conectado neste navegador. */}
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
