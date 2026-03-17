import { useState, useEffect, useCallback } from "react";
import { useEmotionStore } from "@/lib/store";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useEmotionStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetch = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await window.fetch("/api/notifications", {
        headers: { "x-actor-id": user.id },
      });
      if (res.ok) setNotifications(await res.json());
    } catch {}
    finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetch();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE") fetch();
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [fetch]);

  const markRead = async (id: string) => {
    await window.fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    await window.fetch("/api/notifications/read-all", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-actor-id": user.id },
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return { notifications, unreadCount, loading, refetch: fetch, markRead, markAllRead };
}
