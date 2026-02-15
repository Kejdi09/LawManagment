import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const onCustomers = location.pathname.startsWith("/customers");
  const onClients = location.pathname.startsWith("/clients");
  const onActivity = location.pathname.startsWith("/activity");
  const onCases = !onCustomers && !onClients && !onActivity;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {right}
          <div className="flex items-center gap-2 border rounded-md px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Pages</span>
            <Button variant={onCases ? "default" : "ghost"} size="sm" onClick={() => navigate("/")}>Cases</Button>
            <Button variant={onCustomers ? "default" : "ghost"} size="sm" onClick={() => navigate("/customers")}>Customers</Button>
            <Button variant={onClients ? "default" : "ghost"} size="sm" onClick={() => navigate("/clients")}>Confirmed Clients</Button>
            {user?.role === "admin" && (
              <Button variant={onActivity ? "default" : "ghost"} size="sm" onClick={() => navigate("/activity")}>Activity</Button>
            )}
          </div>
          <div className="flex items-center gap-2 border rounded-md px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Account</span>
            {user?.role && <span className="text-xs text-muted-foreground capitalize">{user.role}</span>}
            <span className="text-xs text-muted-foreground">{user?.consultantName || user?.lawyerName || user?.username || ""}</span>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
