import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { globalSearch } from "@/lib/case-store";
import { SearchResult } from "@/lib/types";
import { Input } from "@/components/ui/input";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) { setResults(null); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearch(query);
        setResults(res);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const total = results ? results.customers.length + results.clients.length + results.cases.length : 0;

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  return (
    <div ref={containerRef} className="relative hidden md:block w-56 lg:w-72">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cases, customers…"
          className="pl-8 pr-8 h-8 text-sm"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults(null); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[320px] z-50 rounded-md border bg-popover shadow-lg overflow-hidden text-sm">
          {loading && <div className="p-3 text-muted-foreground text-xs">Searching…</div>}
          {!loading && total === 0 && <div className="p-3 text-muted-foreground text-xs">No results for "{query}"</div>}

          {!loading && results && results.cases.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground tracking-wide border-b bg-muted/30">Cases</div>
              {results.cases.map((c) => (
                <button
                  key={c.caseId}
                  onClick={() => go(c.caseType === "customer" ? "/customer-cases" : "/")}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted transition-colors text-left"
                >
                  <div>
                    <span className="font-mono text-xs font-medium">{c.caseId}</span>
                    {c.title && <span className="ml-2 text-muted-foreground">{c.title}</span>}
                  </div>
                  <span className={`text-[10px] rounded px-1.5 py-0.5 font-semibold ${
                    c.caseType === "client" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>{c.caseType === "client" ? "Client" : "Customer"}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && results && results.clients.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground tracking-wide border-b bg-muted/30">Clients</div>
              {results.clients.map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => go("/clients")}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted transition-colors text-left"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{c.status}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && results && results.customers.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground tracking-wide border-b bg-muted/30">Customers</div>
              {results.customers.map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => go("/customers")}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted transition-colors text-left"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
