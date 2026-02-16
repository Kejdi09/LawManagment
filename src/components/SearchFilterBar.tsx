import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Priority } from "@/lib/types";

interface SearchFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  priorityFilter: Priority | "all";
  onPriorityChange: (p: Priority | "all") => void;
  docFilter: "all" | "ok" | "missing";
  onDocFilterChange: (d: "all" | "ok" | "missing") => void;
}

export function SearchFilterBar({
  query, onQueryChange,
  priorityFilter, onPriorityChange,
  docFilter, onDocFilterChange,
}: SearchFilterBarProps) {
  const hasFilters = query || priorityFilter !== "all" || docFilter !== "all";
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 sm:hidden mb-2">
        <Button variant="outline" size="sm" onClick={() => setShowMobileFilters((s) => !s)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {showMobileFilters ? "Close" : "Filters"}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { onQueryChange(""); onPriorityChange("all"); onDocFilterChange("all"); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className={`${showMobileFilters ? "flex" : "hidden"} sm:flex flex-wrap items-center gap-3`}>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search cases, customers, lawyers..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>
        <div className="w-full sm:w-[130px]">
          <Select value={priorityFilter} onValueChange={(v) => onPriorityChange(v as Priority | "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[140px]">
          <Select value={docFilter} onValueChange={(v) => onDocFilterChange(v as "all" | "ok" | "missing")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Documents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Docs</SelectItem>
              <SelectItem value="ok">Docs OK</SelectItem>
              <SelectItem value="missing">Docs Missing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop clear button (mobile has it next to Filters toggle) */}
        <div className="hidden sm:block">
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onQueryChange("");
                onPriorityChange("all");
                onDocFilterChange("all");
              }}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
