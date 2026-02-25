import { useEffect, useRef } from "react";
import { Send, Trash2, Loader2, AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { PortalMessage } from "@/lib/types";

interface PortalChatPanelProps {
  messages: PortalMessage[];
  text: string;
  onTextChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  /** If true, renders in admin/lawyer mode (right-side bubbles for lawyer, delete buttons) */
  isAdmin?: boolean;
  /** Admin-only: called when the trash icon is clicked on a message */
  onDelete?: (messageId: string) => void;
  /** Number of consecutive client messages at the tail of the thread */
  trailingClientCount: number;
  /** Max consecutive client messages before they must wait (default 3) */
  maxConsecutive?: number;
  /** When the portal link has expired — history is read-only */
  linkExpired?: boolean;
  /** Whether messages are still loading */
  loading?: boolean;
  /** When true the panel fills its flex parent instead of using a fixed 340 px height */
  fillHeight?: boolean;
}

function countTrailingClient(messages: PortalMessage[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderType === "client") n++;
    else break;
  }
  return n;
}

export function PortalChatPanel({
  messages,
  text,
  onTextChange,
  onSend,
  sending,
  isAdmin = false,
  onDelete,
  trailingClientCount,
  maxConsecutive = 3,
  linkExpired = false,
  loading = false,
  fillHeight = false,
}: PortalChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll the message list container — NOT the whole page
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const clientCapped = !isAdmin && trailingClientCount >= maxConsecutive;
  const remaining = Math.max(0, maxConsecutive - trailingClientCount);
  const canSend = !sending && !clientCapped && !linkExpired && text.trim().length > 0;

  return (
    <div
      className={`flex flex-col border rounded-lg overflow-hidden bg-background${fillHeight ? " flex-1" : ""}`}
      style={fillHeight ? undefined : { height: 340 }}
    >
      {/* Message list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-20" />
            <p className="text-xs">No messages yet. Start the conversation.</p>
          </div>
        )}
        {!loading &&
          messages.map((m) => {
            // isMyMessage: lawyer's messages are "mine" when in admin mode; client's messages are "mine" on the portal
            const isMyMessage = isAdmin ? m.senderType === "lawyer" : m.senderType === "client";
            return (
              <div
                key={m.messageId}
                className={`flex items-end gap-2 ${!isMyMessage ? "justify-start" : "justify-end"} group`}
              >
                {/* Avatar — other person's side (left) */}
                {!isMyMessage && (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 mb-4">
                    {m.senderName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}

                <div className="flex flex-col max-w-[72%]">
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      !isMyMessage
                        ? "bg-muted text-foreground rounded-bl-sm"
                        : "bg-primary text-primary-foreground rounded-br-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                  <div
                    className={`flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground ${
                      !isMyMessage ? "pl-1" : "justify-end pr-1"
                    }`}
                  >
                    <span>{m.senderName}</span>
                    <span className="opacity-50">·</span>
                    <span>{formatDate(m.createdAt, true)}</span>
                    {isAdmin && onDelete && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 ml-1 hover:text-destructive transition-all"
                        onClick={() => onDelete(m.messageId)}
                        title="Delete message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Avatar — my side (right) */}
                {isMyMessage && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0 mb-4">
                    {m.senderName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Status banners */}
      {linkExpired && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/60 border-t border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Your link has expired. Message history is preserved but you cannot send new messages. Contact your lawyer for a
          new link.
        </div>
      )}
      {!linkExpired && clientCapped && !isAdmin && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/60 border-t border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          You have sent {maxConsecutive} messages in a row. Please wait for your lawyer to reply before sending more.
        </div>
      )}
      {!linkExpired && !isAdmin && !clientCapped && trailingClientCount > 0 && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground text-center border-t shrink-0">
          {remaining} message{remaining !== 1 ? "s" : ""} remaining before waiting for a reply
        </div>
      )}

      {/* Input bar — hidden when expired (client) or capped */}
      {!linkExpired && (isAdmin || !clientCapped) && (
        <div className="border-t p-2 flex gap-2 shrink-0">
          <Textarea
            className="resize-none text-sm flex-1 min-h-[40px] max-h-24"
            placeholder={isAdmin ? "Reply as lawyer…" : "Type a message…"}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
          />
          <Button size="sm" className="self-end h-10 px-3" disabled={!canSend} onClick={onSend}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Utility re-exported so callers don't have to import from types */
export { countTrailingClient };
