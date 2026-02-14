import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {right}
          <Button variant="ghost" size="sm" onClick={() => navigate("/customers")}>Customers</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>Clients</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/archived")}>Archived</Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>Dashboard</Button>
          <Button variant="outline" size="sm" onClick={logout}>Sign Out</Button>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
