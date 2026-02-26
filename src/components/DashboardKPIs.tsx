import { useEffect, useState } from "react";
import { getKPIs } from "@/lib/case-store";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Clock, FileX, Flame, ListTodo } from "lucide-react";

export function DashboardKPIs() {
  const [kpis, setKpis] = useState({
    totalCases: 0,
    urgentCases: 0,
    overdue: 0,
    missingDocs: 0,
    pendingTasks: 0,
  });

  useEffect(() => {
    getKPIs().then((data) => setKpis(data as typeof kpis)).catch(() => setKpis((prev) => prev));
  }, []);

  const items = [
    { label: "Total Cases", value: kpis.totalCases, icon: Briefcase, accent: "text-primary" },
    { label: "Urgent / High", value: kpis.urgentCases, icon: Flame, accent: "text-orange-500" },
    { label: "Overdue", value: kpis.overdue, icon: Clock, accent: "text-destructive" },
    { label: "Missing Docs", value: kpis.missingDocs, icon: FileX, accent: "text-yellow-600" },
    { label: "Pending Tasks", value: kpis.pendingTasks, icon: ListTodo, accent: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <item.icon className={`h-8 w-8 ${item.accent}`} />
            <div>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
