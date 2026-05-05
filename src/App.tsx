import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ClientConfigProvider } from "./contexts/ClientConfigContext";
import ProtectedRoute from "./components/ProtectedRoute";
import SideNav from "./components/SideNav";
import Dashboard from "./pages/Dashboard";
import KommoChat from "./pages/KommoChat";
import UaizapChat from "./pages/UaizapChat";
import ConfigPage from "./pages/ConfigPage";
import Login from "./pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClientConfigProvider>
          <AppShell />
        </ClientConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const { user } = useAuth();

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      {user && (
        <header
          className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{ background: "var(--green)", color: "#000" }}
          >
            C
          </div>
          <span className="font-semibold text-sm tracking-tight" style={{ color: "var(--text)" }}>
            CRM White Label
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--green-dim)", color: "var(--green)" }}
          >
            SaaS
          </span>
        </header>
      )}

      {/* ── Body: icon nav + conteúdo ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {user && <SideNav />}

        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/kommo"
              element={
                <ProtectedRoute>
                  <KommoChat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/uaizap"
              element={
                <ProtectedRoute>
                  <UaizapChat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/config"
              element={
                <ProtectedRoute>
                  <ConfigPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
