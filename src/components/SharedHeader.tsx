import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const path = location.pathname || "/";
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {right}
          { !path.startsWith("/customers") && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/customers")}>Customers</Button>
          )}
          { !path.startsWith("/") && !path.startsWith("/customers") && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Cases</Button>
          )}
          <Button variant="outline" size="sm" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
