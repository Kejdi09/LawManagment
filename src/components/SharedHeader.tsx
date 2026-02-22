import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Drawer,
  DrawerTrigger,
} from "@/components/ui/drawer";
import Nav from "./Nav";
import { DrawerContentLeft } from "./ui/drawer";
import { Menu } from "lucide-react";
import CaseAlerts from "./CaseAlerts";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const { user } = useAuth();
  const canSeeAlerts = Boolean(user);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
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
                <Nav onSelect={() => setDrawerOpen(false)} />
              </div>
            </DrawerContentLeft>
          </Drawer>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canSeeAlerts && <CaseAlerts />}
          {right}
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
