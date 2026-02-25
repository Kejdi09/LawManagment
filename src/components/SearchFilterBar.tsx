import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SearchFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  docFilter: "all" | "ok" | "missing";
  onDocFilterChange: (d: "all" | "ok" | "missing") => void;
}

export function SearchFilterBar({
  query, onQueryChange,
  docFilter, onDocFilterChange,
}: SearchFilterBarProps) {
  const hasFilters = query || docFilter !== "all";
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const activeFilters = [
    query ? { key: "query", label: `Search: ${query}`, onClear: () => onQueryChange("") } : null,
    docFilter !== "all" ? { key: "docs", label: `Docs: ${docFilter}`, onClear: () => onDocFilterChange("all") } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 sm:hidden mb-2">
        <Button variant="outline" size="sm" onClick={() => setShowMobileFilters((s) => !s)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {showMobileFilters ? "Close" : "Filters"}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { onQueryChange(""); onDocFilterChange("all"); }}>
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
                onDocFilterChange("all");
              }}
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.onClear}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-xs hover:bg-muted"
            >
              {filter.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
