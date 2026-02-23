import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "react-router-dom";
import {
  Drawer,
  DrawerTrigger,
} from "@/components/ui/drawer";
import Nav from "./Nav";
import { DrawerContentLeft } from "./ui/drawer";
import { Menu } from "lucide-react";
import CaseAlerts from "./CaseAlerts";
import { Button } from "@/components/ui/button";

const GLOBAL_COLUMNS_MODE_KEY = "lm:show-more-columns";
const GLOBAL_COLUMNS_MODE_EVENT = "lm-columns-mode-change";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  const canSeeAlerts = Boolean(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showMoreColumns, setShowMoreColumns] = useState(false);
  const canToggleColumns = location.pathname === "/" || location.pathname.startsWith("/customers");

  useEffect(() => {
    try {
      setShowMoreColumns(localStorage.getItem(GLOBAL_COLUMNS_MODE_KEY) === "1");
    } catch {
      setShowMoreColumns(false);
    }
  }, []);

  const handleToggleColumns = () => {
    const next = !showMoreColumns;
    setShowMoreColumns(next);
    try {
      localStorage.setItem(GLOBAL_COLUMNS_MODE_KEY, next ? "1" : "0");
      window.dispatchEvent(new Event(GLOBAL_COLUMNS_MODE_EVENT));
    } catch {
      // ignore storage/event errors
    }
  };

  useEffect(() => {
    if (!drawerOpen) return;
    try {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    } catch {
      // ignore
    }
  }, [drawerOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-[1400px] items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Drawer direction="left" shouldScaleBackground={false} open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger
              className="inline-flex items-center gap-2 border rounded-md px-2 py-1 md:hidden"
              onClick={(e) => {
                try {
                  (e.currentTarget as HTMLElement).blur();
                } catch {
                  // ignore
                }
              }}
            >
              <Menu className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Menu</span>
            </DrawerTrigger>
            <DrawerContentLeft>
              <div className="flex flex-col p-2 gap-2">
                <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-muted/30 px-2 py-2">
                  <img src="/download.jpg" alt="Dafku" className="h-8 w-8 rounded-md object-cover border border-primary/20" />
                  <div>
                    <div className="text-sm font-semibold leading-tight">Dafku Management System</div>
                    <div className="text-[11px] text-muted-foreground">Dafku Law Firm</div>
                  </div>
                </div>
                <Nav onSelect={() => setDrawerOpen(false)} />
              </div>
            </DrawerContentLeft>
          </Drawer>
          <img src="/download.jpg" alt="Dafku" className="h-7 w-7 rounded-md object-cover border border-primary/20 md:hidden" />
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canToggleColumns && (
            <Button size="sm" variant="ghost" onClick={handleToggleColumns} className="hidden md:inline-flex">
              {showMoreColumns ? "Show fewer columns" : "Show more columns"}
            </Button>
          )}
          {canSeeAlerts && <CaseAlerts />}
          {right}
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
