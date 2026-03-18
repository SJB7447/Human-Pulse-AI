import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type PushPayload = {
  type: string;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
};

type NotificationPrefsRow = {
  user_id: string;
  breaking?: boolean | null;
  emotion?: boolean | null;
  keyword?: boolean | null;
  digest?: boolean | null;
  reporter_comment?: boolean | null;
  reporter_reply?: boolean | null;
  reporter_share_spike?: boolean | null;
  reporter_view_milestone?: boolean | null;
  reporter_article_published?: boolean | null;
  reporter_edit_requested?: boolean | null;
  reporter_weekly_summary?: boolean | null;
  admin_report?: boolean | null;
  admin_new_reporter?: boolean | null;
  admin_signup_spike?: boolean | null;
  admin_push_fail?: boolean | null;
  admin_edge_error?: boolean | null;
  admin_daily_stats?: boolean | null;
  admin_keyword_abuse?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
};

const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";
const PREF_SELECT = [
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
].join(", ");

const PREF_KEY_BY_TYPE: Record<string, keyof NotificationPrefsRow | undefined> = {
  breaking: "breaking",
  emotion: "emotion",
  keyword: "keyword",
  digest: "digest",
  reporter_comment: "reporter_comment",
  reporter_reply: "reporter_reply",
  reporter_share_spike: "reporter_share_spike",
  reporter_view_milestone: "reporter_view_milestone",
  reporter_article_published: "reporter_article_published",
  reporter_edit_requested: "reporter_edit_requested",
  reporter_weekly_summary: "reporter_weekly_summary",
  admin_report: "admin_report",
  admin_new_reporter: "admin_new_reporter",
  admin_signup_spike: "admin_signup_spike",
  admin_push_fail: "admin_push_fail",
  admin_edge_error: "admin_edge_error",
  admin_daily_stats: "admin_daily_stats",
  admin_keyword_abuse: "admin_keyword_abuse",
  new_news: "breaking",
  new_comment: "reporter_comment",
  article_publish: "reporter_article_published",
};

const BYPASS_QUIET_HOURS = new Set([
  "breaking",
  "admin_report",
  "admin_push_fail",
  "admin_edge_error",
  "reporter_edit_requested",
]);

const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:admin@huebrief.com", vapidPublicKey, vapidPrivateKey);
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
  const start = parseMinutes(row.quiet_hours_start, DEFAULT_QUIET_START);
  const end = parseMinutes(row.quiet_hours_end, DEFAULT_QUIET_END);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

function isPreferenceEnabled(row: NotificationPrefsRow | undefined, type: string): boolean {
  if (!row) return true;
  const key = PREF_KEY_BY_TYPE[type];
  if (!key) return true;
  return row[key] !== false;
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  bypassQuietHours = false,
): Promise<void> {
  const uniqueUserIds = Array.from(new Set((userIds || []).map((userId) => String(userId || "").trim()).filter(Boolean)));
  if (!uniqueUserIds.length) return;

  const { data: prefsRows } = await supabaseAdmin
    .from("notification_prefs")
    .select(PREF_SELECT)
    .in("user_id", uniqueUserIds);

  const prefsMap = new Map<string, NotificationPrefsRow>(
    (prefsRows || []).map((row: NotificationPrefsRow) => [String(row.user_id), row]),
  );

  const deliverableUsers = uniqueUserIds.filter((userId) => {
    const pref = prefsMap.get(userId);
    if (!isPreferenceEnabled(pref, payload.type)) return false;
    if (bypassQuietHours || BYPASS_QUIET_HOURS.has(payload.type)) return true;
    return pref ? !isQuietHoursActive(pref) : true;
  });

  if (!deliverableUsers.length) return;

  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth, is_active")
    .in("user_id", deliverableUsers)
    .eq("is_active", true);

  const subscriptionRows = subscriptions || [];

  await Promise.allSettled(
    deliverableUsers.map(async (userId) => {
      await supabaseAdmin.from("notification_inbox").insert({
        user_id: userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        url: payload.url || "/",
      });

      const rows = subscriptionRows.filter((row: any) => String(row.user_id) === userId);
      if (!rows.length) {
        await supabaseAdmin.from("notification_logs").insert({
          user_id: userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          url: payload.url || "/",
          payload,
          success: true,
        });
        return;
      }

      await Promise.allSettled(rows.map(async (row: any) => {
        try {
          await webpush.sendNotification({
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          }, JSON.stringify(payload));

          await supabaseAdmin.from("notification_logs").insert({
            user_id: userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
            payload,
            success: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabaseAdmin.from("notification_logs").insert({
            user_id: userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
            payload,
            success: false,
            error: message,
          });

          const statusCode = String((error as { statusCode?: number })?.statusCode || "");
          if (statusCode === "404" || statusCode === "410") {
            await supabaseAdmin.from("push_subscriptions").update({ is_active: false }).eq("endpoint", row.endpoint);
          }
        }
      }));
    }),
  );
}
