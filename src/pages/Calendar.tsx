import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { createMeeting, deleteMeeting, getAllCustomers, getConfirmedClients, getMeetings, updateMeeting } from "@/lib/case-store";
import { LAWYERS, Meeting } from "@/lib/types";
import { formatDate, stripProfessionalTitle } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

type MeetingForm = {
  title: string;
  customerId: string;
  startsAt: string;
  endsAt: string;
  assignedTo: string;
  status: string;
  notes: string;
};

const initialForm: MeetingForm = {
  title: "Consultation",
  customerId: "",
  startsAt: "",
  endsAt: "",
  assignedTo: LAWYERS[0],
  status: "scheduled",
  notes: "",
};

const MeetingsCalendarPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [form, setForm] = useState<MeetingForm>({
    ...initialForm,
    assignedTo: stripProfessionalTitle(user?.consultantName || user?.lawyerName || LAWYERS[0]) || LAWYERS[0],
  });

  const isAdminLike = user?.role === "admin" || user?.role === "manager";

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
  };

  useEffect(() => {
    load().catch(() => {
      setMeetings([]);
      setCustomerNames({});
    });
  }, []);

  const meetingDays = useMemo(() => {
    return meetings.map((m) => new Date(m.startsAt));
  }, [meetings]);

  const selectedDayMeetings = useMemo(() => {
    if (!selectedDate) return meetings;
    const day = selectedDate.toDateString();
    return meetings.filter((m) => new Date(m.startsAt).toDateString() === day);
  }, [meetings, selectedDate]);

  const resetForm = () => {
    setEditingMeetingId(null);
    setForm({
      ...initialForm,
      assignedTo: stripProfessionalTitle(user?.consultantName || user?.lawyerName || LAWYERS[0]) || LAWYERS[0],
    });
  };

  const onSave = async () => {
    try {
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
        notes: form.notes || "",
      };

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
      notes: meeting.notes || "",
    });
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

  return (
    <MainLayout title="Consultations Calendar">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
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
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{editingMeetingId ? "Edit Consultation" : "Schedule Consultation"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={(value) => setForm((f) => ({ ...f, customerId: value === "none" ? "" : value }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No customer</SelectItem>
                    {Object.entries(customerNames).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name} ({id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Starts At</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ends At</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select
                  value={form.assignedTo}
                  onValueChange={(value) => setForm((f) => ({ ...f, assignedTo: value }))}
                  disabled={!isAdminLike}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAWYERS.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={onSave}>{editingMeetingId ? "Save Changes" : "Schedule"}</Button>
              {editingMeetingId && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>
              {selectedDate ? `Meetings for ${formatDate(selectedDate.toISOString(), false)}` : "All Meetings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedDayMeetings.length === 0 ? (
              <div className="text-sm text-muted-foreground">No meetings for this date.</div>
            ) : selectedDayMeetings.map((meeting) => (
              <div key={meeting.meetingId} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{meeting.title}</div>
                  <div className="text-sm text-muted-foreground">{formatDate(meeting.startsAt, true)} • {meeting.assignedTo}</div>
                  <div className="text-sm text-muted-foreground">{meeting.customerId ? `${customerNames[meeting.customerId] || "Customer"} (${meeting.customerId})` : "No customer linked"}</div>
                  {meeting.notes && <div className="text-sm mt-1">{meeting.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(meeting)}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(meeting.meetingId)}>Delete</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default MeetingsCalendarPage;
