import { useState, useEffect, useCallback } from "react";
import { useEmotionStore } from "@/lib/store";
import { supabase } from "@/services/supabaseClient";

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

  const fetch = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = String(data?.session?.access_token || "");
      const res = await window.fetch("/api/notifications", {
        headers: {
          "x-actor-id": user.id,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (res.ok) {
        const nextItems = await res.json();
        setNotifications((prev) => {
          const knownIds = new Set(prev.map((item) => item.id));
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            nextItems
              .filter((item: NotificationItem) => !item.is_read && !knownIds.has(item.id))
              .forEach((item: NotificationItem) => {
                const notification = new Notification(item.title, {
                  body: item.body,
                  icon: "/icon-192.png?v=20260317",
                  tag: item.id,
                });
                notification.onclick = () => {
                  window.focus();
                  if (item.url) window.location.href = item.url;
                  notification.close();
                };
              });
          }
          return nextItems;
        });
      }
    } catch {}
    finally {
      if (!silent) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetch();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE") fetch();
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    const poll = window.setInterval(() => {
      void fetch(true);
    }, 15000);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handler);
      window.clearInterval(poll);
    };
  }, [fetch]);

  const markRead = async (id: string) => {
    if (!user?.id) return;
    const { data } = await supabase.auth.getSession();
    const accessToken = String(data?.session?.access_token || "");
    await window.fetch(`/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: {
        "x-actor-id": user.id,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    const { data } = await supabase.auth.getSession();
    const accessToken = String(data?.session?.access_token || "");
    await window.fetch("/api/notifications/read-all", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": user.id,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return { notifications, unreadCount, loading, refetch: fetch, markRead, markAllRead };
}
