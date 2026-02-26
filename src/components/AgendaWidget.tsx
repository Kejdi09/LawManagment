import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllCases, getMeetings } from "@/lib/case-store";
import { Case, Meeting } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Clock, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { stripProfessionalTitle } from "@/lib/utils";

function isTodayOrTomorrow(iso: string): "today" | "tomorrow" | null {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0 && diffDays > -1) return "today"; // overdue today
  if (diffDays >= 0 && diffDays < 1) return "today";
  if (diffDays >= 1 && diffDays < 2) return "tomorrow";
  return null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isTomorrow(iso: string): boolean {
  const d = new Date(iso);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function AgendaWidget({ customerNames }: { customerNames?: Record<string, string> }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayMeetings, setTodayMeetings] = useState<Meeting[]>([]);
  const [tomorrowMeetings, setTomorrowMeetings] = useState<Meeting[]>([]);
  const [dueCases, setDueCases] = useState<Case[]>([]);
  const [tomorrowCases, setTomorrowCases] = useState<Case[]>([]);

  useEffect(() => {
    Promise.all([getMeetings(), getAllCases()]).then(([meetings, cases]) => {
      const myName = stripProfessionalTitle(user?.consultantName || user?.lawyerName || "") || "";
      const isAdmin = user?.role === "admin" || user?.role === "manager";

      const myMeetings = isAdmin
        ? meetings
        : meetings.filter((m) => stripProfessionalTitle(m.assignedTo) === myName || m.assignedTo === user?.username);

      setTodayMeetings(myMeetings.filter((m) => isToday(m.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setTomorrowMeetings(myMeetings.filter((m) => isTomorrow(m.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

      const myCases = cases.filter(
        (c) => c.state !== "FINALIZED" && (isAdmin || stripProfessionalTitle(c.assignedTo) === myName || c.assignedTo === user?.username)
      );

      setDueCases(myCases.filter((c) => c.deadline && isTodayOrTomorrow(c.deadline) === "today"));
      setTomorrowCases(myCases.filter((c) => c.deadline && isTodayOrTomorrow(c.deadline) === "tomorrow"));
    }).catch(() => {});
  }, [user]);

  const total = todayMeetings.length + tomorrowMeetings.length + dueCases.length + tomorrowCases.length;
  if (total === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" />
          Agenda
          <Badge variant="secondary" className="ml-auto">{total} item{total !== 1 ? "s" : ""}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {(todayMeetings.length > 0 || dueCases.length > 0) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Today</p>
            <ul className="space-y-1.5">
              {todayMeetings.map((m) => (
                <li key={m.meetingId} className="flex items-start gap-2 text-sm">
                  <Users className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                  <span className="flex-1 leading-snug">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted-foreground"> · {formatTime(m.startsAt)}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">Meeting</Badge>
                </li>
              ))}
              {dueCases.map((c) => {
                const overdue = c.deadline && new Date(c.deadline).getTime() < Date.now();
                return (
                  <li key={c.caseId}
                    className={`flex items-start gap-2 text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50 ${overdue ? "text-destructive" : ""}`}
                    onClick={() => navigate("/")}
                  >
                    <Clock className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${overdue ? "text-destructive" : "text-amber-500"}`} />
                    <span className="flex-1 leading-snug">
                      <span className="font-medium">{customerNames?.[c.customerId] || c.customerId}</span>
                      {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                    </span>
                    <Badge variant={overdue ? "destructive" : "secondary"} className="text-[10px] shrink-0">{overdue ? "Overdue" : "Due today"}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {(tomorrowMeetings.length > 0 || tomorrowCases.length > 0) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tomorrow</p>
            <ul className="space-y-1.5">
              {tomorrowMeetings.map((m) => (
                <li key={m.meetingId} className="flex items-start gap-2 text-sm">
                  <Users className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
                  <span className="flex-1 leading-snug">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted-foreground"> · {formatTime(m.startsAt)}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">Meeting</Badge>
                </li>
              ))}
              {tomorrowCases.map((c) => (
                <li key={c.caseId}
                  className="flex items-start gap-2 text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50"
                  onClick={() => navigate("/")}
                >
                  <Clock className="h-3.5 w-3.5 mt-0.5 text-yellow-500 shrink-0" />
                  <span className="flex-1 leading-snug">
                    <span className="font-medium">{customerNames?.[c.customerId] || c.customerId}</span>
                    {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">Due tomorrow</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
