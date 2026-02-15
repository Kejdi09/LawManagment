import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const onCustomers = location.pathname.startsWith("/customers");
  const onClients = location.pathname.startsWith("/clients");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <Button variant={!onCustomers && !onClients ? "default" : "ghost"} size="sm" onClick={() => navigate("/")}>Cases</Button>
          <Button variant={onCustomers ? "default" : "ghost"} size="sm" onClick={() => navigate("/customers")}>Customers</Button>
          <Button variant={onClients ? "default" : "ghost"} size="sm" onClick={() => navigate("/clients")}>Confirmed Clients</Button>
          <Button variant="outline" size="sm" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
