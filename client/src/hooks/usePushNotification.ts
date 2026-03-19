import { useEffect, useState } from "react";
import { supabase } from "@/services/supabaseClient";

export function usePushNotification(userId: string | null) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  useEffect(() => {
    setIsSupported("serviceWorker" in navigator && "PushManager" in window);
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    if (!userId) return;
    void checkSubscription();
  }, [userId]);

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  };

  const subscribe = async (): Promise<boolean> => {
    if (!userId || !isSupported) return false;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = String(data?.session?.access_token || "");

      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) {
        throw new Error("VAPID 공개 키를 불러오지 못했습니다.");
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        throw new Error("푸시 공개 키가 설정되지 않았습니다.");
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": userId,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          userId,
          endpoint: json.endpoint,
          p256dh: (json.keys as any)?.p256dh,
          auth: (json.keys as any)?.auth,
        }),
      });
      if (!response.ok) {
        throw new Error("푸시 구독 저장에 실패했습니다.");
      }

      setPermission(typeof Notification !== "undefined" ? Notification.permission : "granted");
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[Push] 구독 실패:", err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = String(data?.session?.access_token || "");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return true;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": userId || "",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!response.ok) {
        throw new Error("푸시 구독 해제에 실패했습니다.");
      }

      await sub.unsubscribe();
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
      setIsSubscribed(false);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { isSupported, isSubscribed, loading, permission, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData.split("").map((char) => char.charCodeAt(0)));
}
