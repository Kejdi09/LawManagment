import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import {
  Briefcase, Users, UserSearch, UserCheck, CalendarDays, ActivitySquare,
  Receipt, MessageSquare, Trash2, ShieldCheck, ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getChatUnreadCounts } from "@/lib/case-store";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 pt-3 pb-1">
    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{children}</span>
  </div>
);

export const Nav = ({ onSelect, showAccount = true }: { onSelect?: () => void; showAccount?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthLoading, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(true);

  // Poll for total unread chat messages to show badge in nav
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const data = await getChatUnreadCounts();
        setChatUnread(data.reduce((s, d) => s + d.unreadCount, 0));
      } catch { /* ignore */ }
    };
    fetchUnread();
    const id = setInterval(fetchUnread, 15_000);
    return () => clearInterval(id);
  }, [user]);

  const onCustomers = location.pathname.startsWith("/customers");
  const onClients = location.pathname.startsWith("/clients");
  const onCalendar = location.pathname.startsWith("/calendar");
  const onActivity = location.pathname.startsWith("/activity");
  const onCustomerCases = location.pathname.startsWith("/customer-cases");
  const onInvoices = location.pathname.startsWith("/invoices");
  const onChat = location.pathname.startsWith("/chat");
  const onArchived = location.pathname.startsWith("/archived");
  const onStaff = location.pathname.startsWith("/staff");
  const onClientCases =
    location.pathname === "/" ||
    (!onCustomers && !onClients && !onCalendar && !onActivity && !onCustomerCases && !onInvoices && !onChat && !onArchived && !onStaff);

  const displayName =
    user?.role === "admin"
      ? user?.username || user?.consultantName || user?.lawyerName
      : user?.consultantName || user?.lawyerName || user?.username;

  const go = (path: string) => { navigate(path); onSelect?.(); };

  const itemBase = "w-full flex items-center gap-2.5 justify-start text-sm px-3 py-2 rounded-md transition-colors";
  const active = "bg-primary text-primary-foreground font-medium";
  const inactive = "text-foreground/80 hover:bg-muted hover:text-foreground";

  const NavBtn = ({
    path, icon, label, isActive,
  }: { path: string; icon: React.ReactNode; label: string; isActive: boolean }) => (
    <button
      type="button"
      className={`${itemBase} ${isActive ? active : inactive}`}
      onClick={() => go(path)}
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );

  const isIntake = user?.role === "intake" || user?.role === "manager" || user?.role === "admin";
  const isClientTeam = user?.role === "consultant" || user?.role === "admin";
  const isAdminRole = user?.role === "admin";

  return (
    <nav className="flex flex-col h-full gap-0.5">
      <div className="flex flex-col gap-0.5 px-1">

        {/* ── INTAKE section ─────────────────────────── */}
        {!isAuthLoading && isIntake && (
          <>
            <SectionLabel>Intake</SectionLabel>
            <NavBtn path="/customer-cases" icon={<Briefcase className="w-4 h-4" />} label="Customer Cases" isActive={onCustomerCases} />
            <NavBtn path="/customers" icon={<UserSearch className="w-4 h-4" />} label="Customers" isActive={onCustomers} />
          </>
        )}

        {/* ── CLIENTS section ────────────────────────── */}
        {!isAuthLoading && isClientTeam && (
          <>
            <SectionLabel>Clients</SectionLabel>
            <NavBtn path="/" icon={<Users className="w-4 h-4" />} label="Client Cases" isActive={onClientCases} />
            <NavBtn path="/clients" icon={<UserCheck className="w-4 h-4" />} label="Client Records" isActive={onClients} />
          </>
        )}

        {/* ── GENERAL section ────────────────────────── */}
        {!isAuthLoading && (
          <>
            <SectionLabel>General</SectionLabel>
            <NavBtn path="/calendar" icon={<CalendarDays className="w-4 h-4" />} label="Calendar" isActive={onCalendar} />
            <button
              type="button"
              className={`${itemBase} ${onChat ? active : inactive}`}
              onClick={() => go("/chat")}
            >
              <span className="shrink-0 w-4 h-4 flex items-center justify-center"><MessageSquare className="w-4 h-4" /></span>
              <span>Chat</span>
              {chatUnread > 0 && (
                <span className="ml-auto h-4 min-w-[1rem] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                  {chatUnread}
                </span>
              )}
            </button>
          </>
        )}

        {/* ── ADMIN section (collapsible) ─────────────── */}
        {!isAuthLoading && isAdminRole && (
          <>
            <button
              type="button"
              className="flex items-center gap-2 px-3 pt-3 pb-1 w-full text-left"
              onClick={() => setAdminOpen((o) => !o)}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex-1">Administration</span>
              <ChevronDown className={`w-3 h-3 text-muted-foreground/50 transition-transform duration-150 ${adminOpen ? "" : "-rotate-90"}`} />
            </button>
            {adminOpen && (
              <>
                <NavBtn path="/activity" icon={<ActivitySquare className="w-4 h-4" />} label="Activity Log" isActive={onActivity} />
                <NavBtn path="/invoices" icon={<Receipt className="w-4 h-4" />} label="Invoices" isActive={onInvoices} />
                <NavBtn path="/staff" icon={<ShieldCheck className="w-4 h-4" />} label="Staff" isActive={onStaff} />
                <NavBtn path="/archived" icon={<Trash2 className="w-4 h-4" />} label="Deleted Records" isActive={onArchived} />
              </>
            )}
          </>
        )}
      </div>

      {showAccount && (
        <div className="mt-auto p-4 border-t">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            <div className="pt-2">
              <Button className="w-full" variant="outline" size="sm" onClick={() => { logout(); onSelect?.(); }}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Nav;
