import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export const Nav = ({ onSelect, showAccount = true }: { onSelect?: () => void; showAccount?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthLoading, logout } = useAuth();
  const onCustomers = location.pathname.startsWith("/customers");
  const onClients = location.pathname.startsWith("/clients");
  const onCalendar = location.pathname.startsWith("/calendar");
  const onActivity = location.pathname.startsWith("/activity");
  const onCases = !onCustomers && !onClients && !onCalendar && !onActivity;
  const displayName = user?.role === "admin"
    ? (user?.username || user?.consultantName || user?.lawyerName)
    : (user?.consultantName || user?.lawyerName || user?.username);

  const go = (path: string) => {
    navigate(path);
    onSelect?.();
  };

  const itemClass = "w-full flex items-center gap-2 justify-start text-sm px-3 py-2";

  return (
    <nav className="flex flex-col h-full">
      <div className="flex flex-col p-2 gap-2">
        {!isAuthLoading && user?.role !== "intake" && (
          <Button className={itemClass} variant={onCases ? "default" : "ghost"} onClick={() => go("/")}>Cases</Button>
        )}
        {!isAuthLoading && (user?.role === "intake" || user?.role === "manager" || user?.role === "admin") && (
          <Button className={itemClass} variant={onCustomers ? "default" : "ghost"} onClick={() => go("/customers")}>Customers</Button>
        )}
        {!isAuthLoading && user?.role !== "intake" && (
          <Button className={itemClass} variant={onClients ? "default" : "ghost"} onClick={() => go("/clients")}>Clients</Button>
        )}
        {!isAuthLoading && (
          <Button className={itemClass} variant={onCalendar ? "default" : "ghost"} onClick={() => go("/calendar")}>Calendar</Button>
        )}
        {user?.role === "admin" && (
          <Button className={itemClass} variant={onActivity ? "default" : "ghost"} onClick={() => go("/activity")}>Activity</Button>
        )}
      </div>
      {showAccount && (
        <div className="mt-auto p-4 border-t">
          <div className="flex flex-col gap-2">
            
            <div className="text-sm font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            <div className="pt-2">
              <Button className="w-full" variant="outline" size="sm" onClick={() => { logout(); onSelect?.(); }}>Sign Out</Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Nav;
