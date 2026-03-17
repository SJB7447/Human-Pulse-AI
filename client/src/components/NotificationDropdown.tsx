import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useEmotionStore } from "@/lib/store";

const TYPE_ICON: Record<string, string> = {
  new_news: "📰",
  new_comment: "💬",
  admin_action: "🔔",
  article_publish: "✅",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function NotificationDropdown() {
  const { user } = useEmotionStore();
  const { notifications, unreadCount, loading, markRead, markAllRead, refetch } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const handleClickItem = async (n: typeof notifications[0]) => {
    await markRead(n.id);
    setOpen(false);
    if (n.url && n.url !== "/") setLocation(n.url);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "none",
          background: open ? "hsl(var(--muted))" : "transparent",
          cursor: "pointer",
          color: "hsl(var(--foreground))",
        }}
        aria-label="알림"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "hsl(var(--destructive))",
              color: "hsl(var(--destructive-foreground))",
              fontSize: 10,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: 440,
            overflowY: "auto",
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid hsl(var(--border))",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>
              알림 {unreadCount > 0 && <span style={{ color: "hsl(var(--destructive))" }}>({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", background: "none", border: "none", cursor: "pointer" }}
              >
                모두 읽음
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "hsl(var(--muted-foreground))" }}>불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              아직 알림이 없어요
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickItem(n)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 16px",
                  borderBottom: "1px solid hsl(var(--border))",
                  background: n.is_read ? "transparent" : "hsl(var(--muted) / 0.5)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {TYPE_ICON[n.type] || "🔔"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: n.is_read ? 400 : 500, color: "hsl(var(--foreground))", lineHeight: 1.4 }}>
                    {n.title}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.is_read && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(var(--primary))", flexShrink: 0, marginTop: 6 }} />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
