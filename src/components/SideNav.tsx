import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Zap, Settings, LogOut,
  ChevronDown, Bot, BarChart2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface SubItem {
  to: string;
  label: string;
  badge?: string;
}

interface NavGroup {
  icon: React.ElementType;
  label: string;
  items: SubItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboards",
    items: [
      { to: "/dashboard/kommo", label: "Kommo CRM" },
      { to: "/dashboard/ia", label: "IA R2Z", badge: "Em breve" },
      { to: "/dashboard/facebook", label: "Facebook Ads", badge: "Em breve" },
    ],
  },
  {
    icon: MessageCircle,
    label: "Conversas",
    items: [
      { to: "/chat/kommo", label: "Kommo" },
      { to: "/chat/uaizap", label: "Uaizap" },
    ],
  },
];

function NavGroup({ group }: { group: NavGroup }) {
  const location = useLocation();
  const isGroupActive = group.items.some((i) => location.pathname.startsWith(i.to));
  const [open, setOpen] = useState(isGroupActive);
  const Icon = group.icon;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
        style={{
          color: isGroupActive ? "var(--green)" : "var(--muted)",
          background: isGroupActive && !open ? "var(--green-dim)" : "transparent",
        }}
      >
        <Icon size={16} className="flex-shrink-0" />
        <span className="flex-1 text-sm font-medium">{group.label}</span>
        <ChevronDown
          size={13}
          className="flex-shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div className="mt-0.5 ml-3 pl-4 border-l space-y-0.5" style={{ borderColor: "var(--border)" }}>
          {group.items.map((item) => (
            item.badge ? (
              <div
                key={item.to}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                style={{ color: "var(--muted)", opacity: 0.6, cursor: "default" }}
              >
                <span className="flex-1">{item.label}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--green-dim)", color: "var(--green)", fontSize: "10px" }}
                >
                  {item.badge}
                </span>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
                style={({ isActive }) => ({
                  color: isActive ? "var(--green)" : "var(--muted)",
                  background: isActive ? "var(--green-dim)" : "transparent",
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                {item.label}
              </NavLink>
            )
          ))}
        </div>
      )}
    </div>
  );
}

export default function SideNav() {
  const { signOut } = useAuth();

  return (
    <nav
      className="flex flex-col py-3 flex-shrink-0"
      style={{
        width: "220px",
        background: "var(--card)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="flex-1 px-2 space-y-1 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} group={group} />
        ))}
      </div>

      <div className="px-2 pt-2 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
        <NavLink
          to="/config"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={({ isActive }) => ({
            color: isActive ? "var(--green)" : "var(--muted)",
            background: isActive ? "var(--green-dim)" : "transparent",
          })}
        >
          <Settings size={16} />
          <span>Configurações</span>
        </NavLink>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:opacity-80"
          style={{ color: "var(--muted)" }}
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </nav>
  );
}
