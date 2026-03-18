import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendPushToUsers, supabaseAdmin } from "../_shared/sendPush.ts";

serve(async () => {
  try {
    const [{ count: newsCount }, { count: reportCount }, { data: admins }] = await Promise.all([
      supabaseAdmin.from("news_items").select("id", { count: "exact", head: true }).eq("is_published", true),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id").eq("role", "admin"),
    ]);

    const adminIds = (admins || []).map((row: any) => String(row.id || "")).filter(Boolean);
    await sendPushToUsers(adminIds, {
      type: "admin_daily_stats",
      title: "일일 운영 리포트",
      body: `오늘 게시 기사 ${Number(newsCount || 0).toLocaleString("ko-KR")}건, 누적 신고 ${Number(reportCount || 0).toLocaleString("ko-KR")}건입니다.`,
      url: "/admin",
      data: { total_articles: newsCount || 0, total_reports: reportCount || 0 },
    }, false);

    return new Response(JSON.stringify({ ok: true, adminCount: adminIds.length }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
