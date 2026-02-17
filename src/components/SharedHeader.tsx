import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import Nav from "./Nav";
import { DrawerContentLeft } from "./ui/drawer";
import { Menu } from "lucide-react";

export const SharedHeader = ({ title, right }: { title?: string; right?: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, isAuthLoading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    // Move focus into the drawer on open to avoid aria-hidden hiding a focused background element.
    const t = setTimeout(() => {
      try {
        const root = document.querySelector('[data-drawer-content]') as HTMLElement | null;
        const active = document.activeElement as HTMLElement | null;
        // If the active element is not inside the drawer, blur it so it won't become hidden
        if (active && root && !root.contains(active)) {
          try {
            active.blur();
          } catch (e) {
            // ignore
          }
        }
        if (!root) return;
        const firstFocusable = root.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          (root as HTMLElement).setAttribute('tabindex', '-1');
          (root as HTMLElement).focus();
        }
      } catch (e) {
        // ignore
      }
    }, 50);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  // Apply `inert` to any aria-hidden background containers when drawer opens to
  // ensure focused elements are not hidden from assistive tech. Remove on close.
  useEffect(() => {
    const applied: Element[] = [];
    if (drawerOpen) {
      try {
        // Prefer to target the main app container so we don't accidentally inert the drawer itself.
        const mainEl = document.querySelector('.min-h-screen.bg-background') as HTMLElement | null;
        const active = document.activeElement as HTMLElement | null;
        if (active && mainEl && !mainEl.contains(active)) {
          try { active.blur(); } catch (e) { /* ignore */ }
        }
        if (mainEl) {
          try {
            (mainEl as HTMLElement).setAttribute('data-inert-applied', 'true');
            // @ts-ignore
            (mainEl as any).inert = true;
            (mainEl as HTMLElement).setAttribute('inert', '');
            (mainEl as HTMLElement).setAttribute('aria-hidden', 'true');
            applied.push(mainEl);
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    }

    return () => {
      for (const el of applied) {
        try {
          (el as any).inert = false;
          (el as HTMLElement).removeAttribute('inert');
          (el as HTMLElement).removeAttribute('data-inert-applied');
        } catch (e) {
          // ignore
        }
      }
    };
  }, [drawerOpen]);
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
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger className="inline-flex items-center gap-2 border rounded-md px-2 py-1 md:hidden">
              <Menu className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Menu</span>
            </DrawerTrigger>
            <DrawerContentLeft>
              <DrawerHeader>
                <DrawerTitle>Navigation</DrawerTitle>
                <DrawerDescription>Quick access to pages</DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col p-2 gap-2">
                <Nav onSelect={() => setDrawerOpen(false)} />
              </div>
            </DrawerContentLeft>
          </Drawer>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
