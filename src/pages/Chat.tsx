import { useCallback, useEffect, useState } from "react";
import MainLayout from "@/components/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarPlus,
  Copy,
  Link2,
  Loader2,
  MessageSquare,
  Search,
  Trash2,
  UserX,
  Users,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import {
  getAllCustomers,
  getConfirmedClients,
  generatePortalToken,
  revokePortalToken,
  extendPortalToken,
  getPortalToken,
  getAdminChat,
  sendAdminMessage,
  markChatRead,
  deletePortalChatMessage,
  deletePortalChat,
  getChatUnreadCounts,
  deleteCustomer,
} from "@/lib/case-store";
import { PortalChatPanel, countTrailingClient } from "@/components/PortalChatPanel";
import { Customer, LEAD_STATUS_LABELS, PortalMessage } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

type PersonEntry = {
  customerId: string;
  name: string;
  status: string;
  type: "client" | "customer";
};

const Chat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Portal link state
  const [portalToken, setPortalToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [portalLinkLoading, setPortalLinkLoading] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);
  const [revokingPortal, setRevokingPortal] = useState(false);
  const [extendingPortal, setExtendingPortal] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<PortalMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);

  // Unread counts per person
  const [chatUnreadCounts, setChatUnreadCounts] = useState<Record<string, number>>({});

  // Mobile: toggle between people list and chat pane
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // ── Load people list ────────────────────────────────────────────────────────
  const loadPeople = useCallback(async () => {
    try {
      setListLoading(true);
      const canSeeClients = user?.role === "consultant" || user?.role === "admin";
      const canSeeCustomers =
        user?.role === "intake" || user?.role === "manager" || user?.role === "admin";

      const [clients, customers] = await Promise.all([
        canSeeClients ? getConfirmedClients() : Promise.resolve([] as Customer[]),
        canSeeCustomers ? getAllCustomers() : Promise.resolve([] as Customer[]),
      ]);

      const seen = new Set<string>();
      const merged: PersonEntry[] = [];

      for (const c of clients as Customer[]) {
        if (!seen.has(c.customerId)) {
          seen.add(c.customerId);
          merged.push({ customerId: c.customerId, name: c.name, status: c.status, type: "client" });
        }
      }
      for (const c of customers as Customer[]) {
        if (!seen.has(c.customerId)) {
          seen.add(c.customerId);
          merged.push({ customerId: c.customerId, name: c.name, status: c.status, type: "customer" });
        }
      }

      merged.sort((a, b) => a.name.localeCompare(b.name));
      setPeople(merged);
    } catch {
      setPeople([]);
    } finally {
      setListLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Auto-refresh people list every 15s so new contacts appear without manual refresh
  useEffect(() => {
    const id = setInterval(() => loadPeople().catch(() => {}), 15_000);
    return () => clearInterval(id);
  }, [loadPeople]);

  // ── Select a person ─────────────────────────────────────────────────────────
  const selectPerson = useCallback(async (customerId: string) => {
    setSelectedId(customerId);
    setMobileShowChat(true);
    setPortalToken(null);
    setPortalLinkCopied(false);
    setChatMessages([]);
    setChatText("");
    setChatLoading(true);
    try {
      const [token, msgs] = await Promise.all([
        getPortalToken(customerId).catch(() => null),
        getAdminChat(customerId).catch(() => [] as PortalMessage[]),
      ]);
      setPortalToken(token);
      setChatMessages(msgs);
      markChatRead(customerId).catch(() => {});
      setChatUnreadCounts((prev) => ({ ...prev, [customerId]: 0 }));
    } finally {
      setChatLoading(false);
    }
  }, []);

  // ── Poll for new messages (every 8s while a person is selected) ─────────────
  useEffect(() => {
    if (!selectedId) return;
    const id = setInterval(async () => {
      try {
        const msgs = await getAdminChat(selectedId);
        setChatMessages(msgs);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(id);
  }, [selectedId]);
  // ── Poll unread counts every 10s ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadUnread = async () => {
      try {
        const data = await getChatUnreadCounts();
        setChatUnreadCounts(
          Object.fromEntries(data.map((d) => [d.customerId, d.unreadCount]))
        );
      } catch { /* ignore */ }
    };
    loadUnread();
    const id = setInterval(loadUnread, 5_000);
    return () => clearInterval(id);
  }, []);
  // ── Derived portal link URL ──────────────────────────────────────────────────
  const portalLink = portalToken
    ? `${window.location.href.split("#")[0]}#/portal/${portalToken.token}`
    : null;

  // ── Portal link handlers ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedId) return;
    setPortalLinkLoading(true);
    try {
      const result = await generatePortalToken(selectedId, 30);
      setPortalToken(result);
      toast({ title: "Link generated", description: "Portal link is now active." });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setPortalLinkLoading(false);
    }
  };

  const handleCopy = () => {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    setPortalLinkCopied(true);
    setTimeout(() => setPortalLinkCopied(false), 2000);
    toast({ title: "Copied!", description: "Portal link copied to clipboard." });
  };

  const handleRevoke = async () => {
    if (
      !selectedId ||
      !window.confirm(
        "Revoke this portal link? The client will no longer be able to access the portal with this link."
      )
    )
      return;
    setRevokingPortal(true);
    try {
      await revokePortalToken(selectedId);
      setPortalToken(null);
      toast({ title: "Link revoked", description: "The portal link has been destroyed." });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setRevokingPortal(false);
    }
  };

  const handleExtend = async () => {
    if (!selectedId) return;
    setExtendingPortal(true);
    try {
      const result = await extendPortalToken(selectedId, 30);
      setPortalToken(result);
      toast({ title: "Link extended", description: "+30 days added to portal link." });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setExtendingPortal(false);
    }
  };

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filteredPeople = people
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aUnread = (chatUnreadCounts[a.customerId] ?? 0) > 0;
      const bUnread = (chatUnreadCounts[b.customerId] ?? 0) > 0;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const selectedPerson = people.find((p) => p.customerId === selectedId);
  const unreadCount = chatMessages.filter(
    (m) => m.senderType === "client" && !m.readByLawyer
  ).length;

  return (
    <MainLayout title="Chat">
      <div className="flex h-[calc(100vh-4.5rem)] overflow-hidden -mx-4 -mt-4 md:-mx-6 md:-mt-6">
        {/* ── Left: person list ─────────────────────────────────────────────── */}
        <div className={`border-r flex flex-col bg-card shrink-0 w-full md:w-64 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!listLoading && filteredPeople.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Users className="h-8 w-8 opacity-20" />
                <p className="text-xs">No people found</p>
              </div>
            )}
            {!listLoading &&
              filteredPeople.map((p) => (
                <button
                  key={p.customerId}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                    selectedId === p.customerId ? "bg-muted" : ""
                  }`}
                  onClick={() => selectPerson(p.customerId)}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    {p.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.type} · {LEAD_STATUS_LABELS[p.status] || p.status}
                    </div>
                  </div>
                  {(chatUnreadCounts[p.customerId] ?? 0) > 0 && (
                    <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {chatUnreadCounts[p.customerId]}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* ── Right: portal link + chat ─────────────────────────────────────── */}
        <div className={`flex-col overflow-hidden flex-1 ${mobileShowChat ? 'flex' : 'hidden md:flex'}`}>
          {!selectedId || !selectedPerson ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Select a person to start chatting</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-3 md:px-6 py-3 border-b flex items-center gap-3 bg-card shrink-0">
                <button
                  className="md:hidden flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted shrink-0"
                  onClick={() => setMobileShowChat(false)}
                  aria-label="Back to contacts"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                  {selectedPerson.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <div className="font-semibold text-sm">{selectedPerson.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {selectedPerson.type} ·{" "}
                    {LEAD_STATUS_LABELS[selectedPerson.status] || selectedPerson.status}
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadCount} new
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                    <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                    disabled={deletingContact}
                    onClick={async () => {
                      if (!selectedId) return;
                      if (!window.confirm(`Permanently delete contact "${selectedPerson?.name}"?\n\nThis will delete the customer record and ALL associated data (chat history, portal link, documents, etc.).\n\nThis action CANNOT be undone.`)) return;
                      setDeletingContact(true);
                      try {
                        await deleteCustomer(selectedId);
                        const deletedId = selectedId;
                        setChatMessages([]);
                        setChatUnreadCounts((prev) => { const next = { ...prev }; delete next[deletedId]; return next; });
                        setPeople((prev) => prev.filter((p) => p.customerId !== deletedId));
                        setSelectedId(null);
                        setMobileShowChat(false);
                        toast({ title: "Contact deleted", description: `${selectedPerson?.name} has been permanently removed.` });
                      } catch (err) {
                        toast({ title: "Error", description: String(err), variant: "destructive" });
                      } finally {
                        setDeletingContact(false);
                      }
                    }}
                  >
                    {deletingContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                    Delete Contact
                  </Button>
                </div>
              </div>

              {/* Portal link bar */}
              <div className="px-3 md:px-6 py-2 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground">Portal Link</span>

                  {portalLink ? (
                    <>
                      <span className="font-mono text-[11px] truncate max-w-[140px] sm:max-w-xs border rounded px-1.5 py-0.5 bg-background select-all">
                        {portalLink}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={handleCopy}
                      >
                        <Copy className="h-3 w-3" />
                        {portalLinkCopied ? "Copied!" : "Copy"}
                      </Button>
                      {/* Generate disabled when link already active */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs opacity-50 cursor-not-allowed"
                        disabled
                        title="A link is already active — revoke it first to generate a new one"
                      >
                        Link active
                      </Button>
                      {/* Only admin can revoke */}
                      {isAdmin && (
                        <>
                          {portalToken?.expiresAt && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              Expires {new Date(portalToken.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs gap-1"
                            disabled={extendingPortal}
                            onClick={handleExtend}
                          >
                            {extendingPortal ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CalendarPlus className="h-3 w-3" />
                            )}
                            +30d
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs gap-1"
                            disabled={revokingPortal}
                            onClick={handleRevoke}
                          >
                            {revokingPortal ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Revoke
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    /* No link yet — any user may generate */
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs gap-1"
                      disabled={portalLinkLoading}
                      onClick={handleGenerate}
                    >
                      {portalLinkLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      Generate Link
                    </Button>
                  )}
                </div>
              </div>

              {/* Chat panel fills remaining space */}
              <div className="flex-1 overflow-hidden p-4 flex flex-col">
                <PortalChatPanel
                  messages={chatMessages}
                  text={chatText}
                  onTextChange={setChatText}
                  onSend={async () => {
                    if (!selectedId || !chatText.trim() || chatSending) return;
                    setChatSending(true);
                    try {
                      const msg = await sendAdminMessage(selectedId, chatText.trim());
                      setChatMessages((prev) => [...prev, msg]);
                      setChatText("");
                    } catch (e) {
                      toast({
                        title: "Failed to send",
                        description: String(e),
                        variant: "destructive",
                      });
                    } finally {
                      setChatSending(false);
                    }
                  }}
                  sending={chatSending}
                  isAdmin
                  onDelete={async (messageId) => {
                    await deletePortalChatMessage(selectedId, messageId).catch(() => {});
                    setChatMessages((prev) => prev.filter((m) => m.messageId !== messageId));
                  }}
                  trailingClientCount={countTrailingClient(chatMessages)}
                  loading={chatLoading}
                  fillHeight
                />
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Chat;
