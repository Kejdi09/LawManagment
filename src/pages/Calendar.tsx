import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { createMeeting, deleteMeeting, getAllCustomers, getConfirmedClients, getMeetings, updateMeeting } from "@/lib/case-store";
import { LAWYERS, INTAKE_LAWYERS, CLIENT_LAWYERS, Meeting } from "@/lib/types";
import { formatDate, stripProfessionalTitle } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  User, Clock, MapPin, StickyNote, CalendarCheck, CalendarX2, CalendarClock,
  ChevronDown, ChevronUp, Pencil, Trash2, Plus,
} from "lucide-react";

type MeetingForm = {
  title: string;
  customerId: string;
  startsAt: string;
  endsAt: string;
  assignedTo: string;
  status: string;
  location: string;
  notes: string;
};

const initialForm: MeetingForm = {
  title: "Consultation",
  customerId: "",
  startsAt: "",
  endsAt: "",
  assignedTo: LAWYERS[0],
  status: "scheduled",
  location: "",
  notes: "",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function calcDuration(startsAt: string, endsAt: string | null | undefined) {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.round((diff % 3_600_000) / 60_000);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; border: string; bg: string }> = {
  scheduled: { label: "Scheduled", dot: "bg-blue-500",  border: "border-l-blue-400",  bg: "" },
  done:       { label: "Done",      dot: "bg-green-500", border: "border-l-green-500", bg: "bg-green-50/40 dark:bg-green-900/10" },
  cancelled:  { label: "Cancelled", dot: "bg-gray-400",  border: "border-l-gray-300",  bg: "opacity-60" },
};

function MeetingCard({
  meeting, customerNames, onEdit, onDelete,
}: {
  meeting: Meeting;
  customerNames: Record<string, string>;
  onEdit: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[meeting.status] ?? STATUS_CONFIG.scheduled;
  const dur = calcDuration(meeting.startsAt, meeting.endsAt);
  const customerName = meeting.customerId ? (customerNames[meeting.customerId] ?? meeting.customerId) : null;
  const isPast = new Date(meeting.startsAt) < new Date();

  return (
    <div className={`rounded-lg border border-l-4 ${cfg.border} ${cfg.bg} p-4 space-y-3 transition-shadow hover:shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <span className="font-semibold text-sm">{meeting.title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
            meeting.status === "done"
              ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              : meeting.status === "cancelled"
                ? "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400"
                : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
          }`}>{cfg.label}</span>
          {isPast && meeting.status === "scheduled" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 font-medium">Past</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(meeting)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(meeting.meetingId)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
          <span>
            {fmtTime(meeting.startsAt)}
            {meeting.endsAt && ` — ${fmtTime(meeting.endsAt)}`}
            {dur && <span className="ml-2 text-xs font-mono text-muted-foreground/60">({dur})</span>}
          </span>
        </div>
        {customerName && (
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
            <span className="font-medium text-foreground/80">{customerName}</span>
            <span className="text-xs font-mono text-muted-foreground/40">{meeting.customerId}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
          <span>{meeting.assignedTo}</span>
        </div>
        {meeting.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
            <span>{meeting.location}</span>
          </div>
        )}
        {meeting.notes && (
          <div className="flex items-start gap-2">
            <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />
            <span className="whitespace-pre-wrap break-words">{meeting.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingGroup({
  title, icon, meetings, customerNames, defaultOpen = true, onEdit, onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  meetings: Meeting[];
  customerNames: Record<string, string>;
  defaultOpen?: boolean;
  onEdit: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (meetings.length === 0) return null;
  return (
    <div className="space-y-2">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold w-full text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-muted-foreground/60">{icon}</span>
        {title}
        <Badge variant="secondary" className="text-xs ml-1">{meetings.length}</Badge>
        <span className="ml-auto text-muted-foreground/40">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className="space-y-2 pl-1">
          {meetings.map((m) => (
            <MeetingCard key={m.meetingId} meeting={m} customerNames={customerNames} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

const MeetingsCalendarPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [customerIdSet, setCustomerIdSet] = useState<Set<string>>(new Set());
  const [clientIdSet, setClientIdSet] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MeetingForm>({
    ...initialForm,
    assignedTo: stripProfessionalTitle(user?.consultantName || user?.lawyerName || LAWYERS[0]) || LAWYERS[0],
  });

  const isAdmin = user?.role === "admin";
  const isAdminLike = isAdmin || user?.role === "manager";

  const selectedPersonTeam = form.customerId
    ? (customerIdSet.has(form.customerId) ? "customer" : clientIdSet.has(form.customerId) ? "client" : null)
    : null;

  const meetingAssigneePicker = isAdmin
    ? (selectedPersonTeam === "customer" ? INTAKE_LAWYERS
      : selectedPersonTeam === "client" ? CLIENT_LAWYERS
      : LAWYERS)
    : user?.role === "manager" ? INTAKE_LAWYERS : [];

  const load = async () => {
    const [rows, customers, confirmed] = await Promise.all([
      getMeetings(),
      getAllCustomers(),
      getConfirmedClients(),
    ]);
    setMeetings(rows);
    const map = [...customers, ...confirmed].reduce<Record<string, string>>((acc, row) => {
      acc[row.customerId] = row.name;
      return acc;
    }, {});
    setCustomerNames(map);
    setCustomerIdSet(new Set(customers.map((c) => c.customerId)));
    setClientIdSet(new Set(confirmed.map((c) => c.customerId)));
  };

  useEffect(() => { load().catch(() => {}); }, []);

  useEffect(() => {
    if (!isAdmin || !form.customerId) return;
    const allowedTeam = customerIdSet.has(form.customerId) ? INTAKE_LAWYERS
      : clientIdSet.has(form.customerId) ? CLIENT_LAWYERS
      : null;
    if (allowedTeam && !allowedTeam.includes(form.assignedTo)) {
      setForm((f) => ({ ...f, assignedTo: allowedTeam[0] }));
    }
  }, [form.customerId, customerIdSet, clientIdSet]);

  const meetingDays = useMemo(() => meetings.map((m) => new Date(m.startsAt)), [meetings]);

  const grouped = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const wkLater = new Date(now.getTime() + 7 * 86_400_000);
    const base = selectedDate
      ? meetings.filter((m) => new Date(m.startsAt).toDateString() === selectedDate.toDateString())
      : meetings;
    const todays: Meeting[] = [];
    const upcoming: Meeting[] = [];
    const past: Meeting[] = [];
    for (const m of base) {
      const d = new Date(m.startsAt);
      if (d.toDateString() === todayStr) todays.push(m);
      else if (d > now && d <= wkLater) upcoming.push(m);
      else if (d < now) past.push(m);
      else upcoming.push(m);
    }
    return { todays, upcoming, past };
  }, [meetings, selectedDate]);

  const resetForm = () => {
    setEditingMeetingId(null);
    setShowForm(false);
    setForm({
      ...initialForm,
      assignedTo: stripProfessionalTitle(user?.consultantName || user?.lawyerName || LAWYERS[0]) || LAWYERS[0],
    });
  };

  const onSave = async () => {
    if (!form.startsAt) {
      toast({ title: "Missing date", description: "Please choose consultation date and time", variant: "destructive" });
      return;
    }
    const assignedTo = isAdminLike
      ? (stripProfessionalTitle(form.assignedTo) || form.assignedTo)
      : (stripProfessionalTitle(user?.consultantName || user?.lawyerName || form.assignedTo) || form.assignedTo);

    const payload = {
      title: form.title || "Consultation",
      customerId: form.customerId || null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      assignedTo,
      status: form.status || "scheduled",
      location: form.location || null,
      notes: form.notes || "",
    };

    try {
      if (editingMeetingId) {
        await updateMeeting(editingMeetingId, payload);
        toast({ title: "Meeting updated" });
      } else {
        await createMeeting(payload);
        toast({ title: "Meeting scheduled" });
      }
      resetForm();
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Could not save meeting", variant: "destructive" });
    }
  };

  const onEdit = (meeting: Meeting) => {
    setEditingMeetingId(meeting.meetingId);
    setForm({
      title: meeting.title || "Consultation",
      customerId: meeting.customerId || "",
      startsAt: meeting.startsAt ? meeting.startsAt.slice(0, 16) : "",
      endsAt: meeting.endsAt ? meeting.endsAt.slice(0, 16) : "",
      assignedTo: stripProfessionalTitle(meeting.assignedTo) || meeting.assignedTo || LAWYERS[0],
      status: meeting.status || "scheduled",
      location: meeting.location || "",
      notes: meeting.notes || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (meetingId: string) => {
    if (!window.confirm("Delete this meeting?")) return;
    try {
      await deleteMeeting(meetingId);
      toast({ title: "Meeting deleted" });
      if (editingMeetingId === meetingId) resetForm();
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Could not delete meeting", variant: "destructive" });
    }
  };

  const dateLabel = selectedDate
    ? (selectedDate.toDateString() === new Date().toDateString() ? "Today" : formatDate(selectedDate.toISOString(), false))
    : "All dates";
  const totalShown = grouped.todays.length + grouped.upcoming.length + grouped.past.length;

  return (
    <MainLayout
      title="Consultations Calendar"
      right={
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Meeting
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Mini calendar */}
        <Card className="lg:col-span-1 self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pick Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={{ hasMeeting: meetingDays }}
              modifiersClassNames={{ hasMeeting: "bg-primary/15 text-primary font-semibold" }}
              className="rounded-md border"
            />
            {selectedDate && (
              <Button variant="ghost" size="sm" className="mt-2 w-full text-xs text-muted-foreground" onClick={() => setSelectedDate(undefined)}>
                Show all dates
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Right column: form + list */}
        <div className="lg:col-span-2 space-y-4">

          {/* Schedule / Edit form */}
          {showForm && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{editingMeetingId ? "Edit Meeting" : "Schedule Meeting"}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Client / Customer</Label>
                    <Select value={form.customerId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No one linked</SelectItem>
                        {Object.entries(customerNames).map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name} ({id})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Starts At</Label>
                    <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ends At</Label>
                    <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Assigned To</Label>
                    <Select value={form.assignedTo} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))} disabled={!isAdminLike}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {meetingAssigneePicker.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    placeholder="e.g. Office – Tirana, Room 3 / Google Meet"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    placeholder="Agenda, reminders, documents needed…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={onSave}>{editingMeetingId ? "Save Changes" : "Schedule Meeting"}</Button>
                  <Button variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Meeting list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">
                  {dateLabel}
                  {totalShown > 0 && <Badge variant="secondary" className="ml-2 text-xs">{totalShown}</Badge>}
                </CardTitle>
                {!showForm && (
                  <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Schedule
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {totalShown === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No meetings for {dateLabel.toLowerCase()}.</div>
              ) : (
                <div className="space-y-5">
                  <MeetingGroup title="Today" icon={<CalendarCheck className="w-4 h-4" />} meetings={grouped.todays} customerNames={customerNames} defaultOpen={true} onEdit={onEdit} onDelete={onDelete} />
                  <MeetingGroup title="Upcoming (next 7 days)" icon={<CalendarClock className="w-4 h-4" />} meetings={grouped.upcoming} customerNames={customerNames} defaultOpen={true} onEdit={onEdit} onDelete={onDelete} />
                  <MeetingGroup title="Past" icon={<CalendarX2 className="w-4 h-4" />} meetings={grouped.past} customerNames={customerNames} defaultOpen={false} onEdit={onEdit} onDelete={onDelete} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default MeetingsCalendarPage;
