import React, { useState } from "react";
import Nav from "./Nav";
import { useAuth } from "@/lib/auth-context";
import { Copy, Check } from "lucide-react";

const INTAKE_LINK = "https://lawmanagment.onrender.com/join/dafku-intake-2026-xK9mQr7p";

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyIntakeLink = () => {
    navigator.clipboard.writeText(INTAKE_LINK).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const displayName = user?.role === "admin"
    ? (user?.username || user?.consultantName || user?.lawyerName)
    : (user?.consultantName || user?.lawyerName || user?.username);
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-56 md:flex-col md:border-r md:border-primary/20 md:bg-card md:shadow-sm">
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-primary/20 bg-muted/20">
          <div className="flex items-center gap-3">
            <img src="/download.jpg" alt="Dafku" className="h-9 w-9 rounded-md object-cover border border-primary/20" />
            <div>
              <h1 className="text-sm font-semibold leading-tight">Dafku Management System</h1>
              <div className="text-xs text-muted-foreground">Dafku Law Firm</div>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t">
            <div className="text-xs text-muted-foreground">Account</div>
            <div className="text-sm font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Nav showAccount={false} />
        </div>

        <div className="p-4 border-t space-y-2">
          {user?.role === 'admin' && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Client Intake Link</div>
              <button
                onClick={copyIntakeLink}
                className="w-full flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                title={INTAKE_LINK}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{copied ? 'Copied!' : 'Copy Registration Link'}</span>
              </button>
            </div>
          )}
          <button className="w-full text-left rounded-md border px-3 py-2 text-sm" onClick={() => { logout(); }}>
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
