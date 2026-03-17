import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

webpush.setVapidDetails(
  "mailto:admin@huebrief.com",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || "",
);

export type PushNotificationType =
  | "new_news"
  | "new_comment"
  | "admin_action"
  | "article_publish";

export interface PushPayload {
  type: PushNotificationType;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const { data: subs, error } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);

  if (error || !subs?.length) return;

  const deadEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        try {
          await supabase.from("notification_inbox").insert({
            user_id: userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
          });
        } catch {}
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          deadEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }
}

export async function broadcastPush(payload: PushPayload): Promise<void> {
  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");

  if (error || !subs?.length) return;

  const deadEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        try {
          await supabase.from("notification_inbox").insert({
            user_id: sub.user_id,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
          });
        } catch {}
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          deadEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (deadEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }
}
