import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // show warning when < 5 min remaining

export function SessionTimeoutWarning() {
  const { isAuthenticated, sessionExpiresIn, refreshSession, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (
      isAuthenticated &&
      sessionExpiresIn !== null &&
      sessionExpiresIn > 0 &&
      sessionExpiresIn < WARNING_THRESHOLD_MS
    ) {
      setOpen(true);
    } else if (sessionExpiresIn !== null && sessionExpiresIn <= 0 && isAuthenticated) {
      // Token already expired — force logout
      logout();
    }
  }, [sessionExpiresIn, isAuthenticated, logout]);

  const handleStayLoggedIn = async () => {
    setRefreshing(true);
    await refreshSession();
    setRefreshing(false);
    setOpen(false);
  };

  const handleLogOut = async () => {
    setOpen(false);
    await logout();
  };

  const minutesLeft =
    sessionExpiresIn !== null && sessionExpiresIn > 0
      ? Math.max(1, Math.ceil(sessionExpiresIn / 60_000))
      : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Your session is about to expire</DialogTitle>
          <DialogDescription>
            You will be logged out in approximately{" "}
            <strong>{minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}</strong>. Would you like to
            stay logged in?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleLogOut}>Log Out</Button>
          <Button onClick={handleStayLoggedIn} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Stay Logged In"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
