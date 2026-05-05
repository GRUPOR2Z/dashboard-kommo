import { NavLink } from "react-router-dom";
import { LayoutDashboard, MessageCircle, Zap, Settings, LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chat/kommo", icon: MessageCircle, label: "Conversas Kommo" },
  { to: "/chat/uaizap", icon: Zap, label: "Conversas Uaizap" },
];

export default function SideNav() {
  const { signOut } = useAuth();

  return (
    <nav
      className="flex flex-col items-center py-3 gap-1 flex-shrink-0"
      style={{
        width: "56px",
        background: "var(--card)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Main nav items */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all"
            style={({ isActive }) => ({
              background: isActive ? "var(--green-dim)" : "transparent",
              color: isActive ? "var(--green)" : "var(--muted)",
            })}
          >
            <Icon size={18} />
            {/* Tooltip */}
            <span
              className="absolute left-14 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
              style={{
                background: "var(--card)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              {label}
            </span>
          </NavLink>
        ))}
      </div>

      {/* Bottom: Config + Logout */}
      <div className="flex flex-col items-center gap-1">
        <NavLink
          to="/config"
          title="Configurações"
          className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all"
          style={({ isActive }) => ({
            background: isActive ? "var(--green-dim)" : "transparent",
            color: isActive ? "var(--green)" : "var(--muted)",
          })}
        >
          <Settings size={18} />
          <span
            className="absolute left-14 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
            style={{
              background: "var(--card)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            Configurações
          </span>
        </NavLink>

        <button
          onClick={signOut}
          title="Sair"
          className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:opacity-80"
          style={{ color: "var(--muted)" }}
        >
          <LogOut size={16} />
          <span
            className="absolute left-14 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
            style={{
              background: "var(--card)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            Sair
          </span>
        </button>
      </div>
    </nav>
  );
}
