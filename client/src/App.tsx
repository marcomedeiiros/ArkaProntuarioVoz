import { Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./auth";
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

export function App() {
  const { session, loading } = useAuth();

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
        <Route index element={<DashboardPage />} />
        <Route path="pacientes" element={<PatientsPage />} />
        <Route path="pacientes/:id" element={<PatientDetailPage />} />
        <Route path="consultas" element={<ConsultationsPage />} />
        <Route path="consultas/:id" element={<ConsultationPage />} />
        <Route path="financeiro" element={<FinancePage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="conta" element={<AccountPage />} />
      </Route>
      {/* O link do e-mail funciona mesmo com alguém conectado neste navegador. */}
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
