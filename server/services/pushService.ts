import webpush from "web-push";
import { supabase } from "../supabase.js";
import {
  resolveNotificationPrefKey,
  shouldBypassQuietHours,
  type NotificationType,
} from "../../shared/notification.types.js";

const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const hasVapidConfig = Boolean(vapidPublicKey && vapidPrivateKey);
const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

if (hasVapidConfig) {
  webpush.setVapidDetails(
    "mailto:admin@huebrief.com",
    vapidPublicKey,
    vapidPrivateKey,
  );
}

export type PushNotificationType =
  | "new_news"
  | "new_comment"
  | "admin_action"
  | "article_publish"
  | "breaking"
  | "emotion"
  | "keyword"
  | "digest"
  | "reporter_edit_requested"
  | "reporter_comment"
  | "reporter_article_published"
  | "admin_new_reporter"
  | "admin_report"
  | "admin_signup_spike"
  | "admin_push_fail"
  | "admin_edge_error"
  | "admin_daily_stats"
  | "admin_keyword_abuse";

export interface PushPayload {
  type: PushNotificationType;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export type DemoNotificationInboxItem = {
  id: string;
  user_id: string;
  type: PushNotificationType;
  title: string;
  body: string;
  url: string;
  is_read: boolean;
  created_at: string;
};

type NotificationPrefsRow = {
  user_id: string;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  [key: string]: unknown;
};

const demoNotificationInbox = new Map<string, DemoNotificationInboxItem[]>();

function isDemoUserId(userId: string): boolean {
  return String(userId || "").trim().startsWith("demo-");
}

function buildDemoNotificationItem(userId: string, payload: PushPayload): DemoNotificationInboxItem {
  return {
    id: `demo-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    is_read: false,
    created_at: new Date().toISOString(),
  };
}

export function addDemoNotification(userId: string, payload: PushPayload): DemoNotificationInboxItem {
  const item = buildDemoNotificationItem(userId, payload);
  const current = demoNotificationInbox.get(userId) || [];
  demoNotificationInbox.set(userId, [item, ...current].slice(0, 50));
  return item;
}

export function getDemoNotifications(userId: string): DemoNotificationInboxItem[] {
  return [...(demoNotificationInbox.get(userId) || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function markDemoNotificationRead(userId: string, notificationId: string): void {
  const current = demoNotificationInbox.get(userId) || [];
  demoNotificationInbox.set(
    userId,
    current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)),
  );
}

export function markAllDemoNotificationsRead(userId: string): void {
  const current = demoNotificationInbox.get(userId) || [];
  demoNotificationInbox.set(
    userId,
    current.map((item) => ({ ...item, is_read: true })),
  );
}

function parseMinutes(value: string | null | undefined, fallback: string): number {
  const source = String(value || fallback || "").trim();
  const [hourText, minuteText] = source.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function getKstMinutesNow(): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

function isQuietHoursActive(row: NotificationPrefsRow): boolean {
  const now = getKstMinutesNow();
  const start = parseMinutes(String(row.quiet_hours_start || ""), DEFAULT_QUIET_START);
  const end = parseMinutes(String(row.quiet_hours_end || ""), DEFAULT_QUIET_END);
  if (start === end) return false;
  if (start < end) {
    return now >= start && now < end;
  }
  return now >= start || now < end;
}

function isPreferenceEnabled(row: NotificationPrefsRow | null, type: PushNotificationType): boolean {
  if (!row) return true;
  const key = resolveNotificationPrefKey(type as NotificationType);
  if (!key) return true;
  return row[key] !== false;
}

async function fetchNotificationPrefs(userIds: string[]): Promise<Map<string, NotificationPrefsRow>> {
  if (!userIds.length) return new Map();
  const { data } = await supabase
    .from("notification_prefs")
    .select([
      "user_id",
      "breaking",
      "emotion",
      "keyword",
      "digest",
      "reporter_comment",
      "reporter_reply",
      "reporter_share_spike",
      "reporter_view_milestone",
      "reporter_article_published",
      "reporter_edit_requested",
      "reporter_weekly_summary",
      "admin_report",
      "admin_new_reporter",
      "admin_signup_spike",
      "admin_push_fail",
      "admin_edge_error",
      "admin_daily_stats",
      "admin_keyword_abuse",
      "quiet_hours_start",
      "quiet_hours_end",
    ].join(", "))
    .in("user_id", userIds);

  return new Map((data || []).map((row: any) => [String(row.user_id || ""), row as NotificationPrefsRow]));
}

async function logNotificationAttempt(userId: string, payload: PushPayload, success: boolean, error?: string) {
  try {
    await supabase.from("notification_logs").insert({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      payload,
      success,
      error: error || null,
    });
  } catch {}
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!userId) return;

  const prefsMap = await fetchNotificationPrefs([userId]);
  const pref = prefsMap.get(userId) || null;
  if (!isPreferenceEnabled(pref, payload.type)) return;
  if (!shouldBypassQuietHours(payload.type as NotificationType) && pref && isQuietHoursActive(pref)) return;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (isDemoUserId(userId)) {
    addDemoNotification(userId, payload);
    await logNotificationAttempt(userId, payload, true, "demo inbox fallback");
    return;
  }

  if (error) return;

  try {
    await supabase.from("notification_inbox").insert({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
    });
  } catch {}

  if (!subs?.length) {
    await logNotificationAttempt(userId, payload, true);
    return;
  }

  if (!hasVapidConfig) {
    await logNotificationAttempt(userId, payload, true, "web push not configured");
    return;
  }

  await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        await logNotificationAttempt(userId, payload, true);
      } catch (err: any) {
        await logNotificationAttempt(userId, payload, false, err?.message || String(err));
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await supabase
              .from("push_subscriptions")
              .update({ is_active: false })
              .eq("endpoint", sub.endpoint);
          } catch {}
        }
      }
    }),
  );
}

export async function broadcastPush(payload: PushPayload): Promise<void> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("is_active", true);

  if (error || !subs?.length) return;

  const userIds = Array.from(new Set(subs.map((sub) => String(sub.user_id || "")).filter(Boolean)));
  const prefsMap = await fetchNotificationPrefs(userIds);

  const deliverableSubs = subs.filter((sub) => {
    const userId = String(sub.user_id || "");
    const pref = prefsMap.get(userId) || null;
    if (!isPreferenceEnabled(pref, payload.type)) return false;
    if (!shouldBypassQuietHours(payload.type as NotificationType) && pref && isQuietHoursActive(pref)) return false;
    return true;
  });

  const inboxInserted = new Set<string>();
  await Promise.allSettled(
    deliverableSubs.map(async (sub) => {
      const userId = String(sub.user_id || "");
      if (!userId) return;

      if (!inboxInserted.has(userId)) {
        inboxInserted.add(userId);
        try {
          await supabase.from("notification_inbox").insert({
            user_id: userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
          });
        } catch {}
      }

      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        if (!hasVapidConfig) {
          await logNotificationAttempt(userId, payload, true, "web push not configured");
          return;
        }
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        await logNotificationAttempt(userId, payload, true);
      } catch (err: any) {
        await logNotificationAttempt(userId, payload, false, err?.message || String(err));
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try {
            await supabase
              .from("push_subscriptions")
              .update({ is_active: false })
              .eq("endpoint", sub.endpoint);
          } catch {}
        }
      }
    }),
  );
}
