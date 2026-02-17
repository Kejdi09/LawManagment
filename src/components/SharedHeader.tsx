import React, { useState, useEffect } from "react";
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
        const root = document.querySelector('[data-drawer-content]');
        if (!root) return;
        const firstFocusable = root.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        // If the currently focused element is inside an aria-hidden ancestor, blur it first
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          const hiddenAncestor = active.closest('[aria-hidden="true"]');
          if (hiddenAncestor) {
            try { active.blur(); } catch (e) { /* ignore */ }
          }
        }
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          // Fallback: focus the drawer content container so assistive tech moves into it
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
        const hiddenEls = Array.from(document.querySelectorAll('[aria-hidden="true"]')) as Element[];
        hiddenEls.forEach((el) => {
          try {
            // Mark so we know to remove later
            (el as HTMLElement).setAttribute('data-inert-applied', 'true');
            // Some browsers support inert; set it regardless
            // @ts-ignore
            (el as any).inert = true;
            // Also set attribute for browsers/tools
            (el as HTMLElement).setAttribute('inert', '');
            applied.push(el);
          } catch (e) {
            // ignore per-element failures
          }
        });
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
