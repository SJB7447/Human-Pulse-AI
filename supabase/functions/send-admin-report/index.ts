import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendPushToUsers, supabaseAdmin } from "../_shared/sendPush.ts";

serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const row = payload?.record || payload?.new || {};
    const articleId = String(row?.article_id || "").trim();
    if (!articleId) {
      return new Response(JSON.stringify({ ok: true, skipped: "missing_article_id" }), { headers: { "Content-Type": "application/json" } });
    }

    const { count } = await supabaseAdmin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("article_id", articleId);

    if ((count || 0) < 5) {
      return new Response(JSON.stringify({ ok: true, skipped: "threshold_not_reached", count: count || 0 }), { headers: { "Content-Type": "application/json" } });
    }

    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    const { data: article } = await supabaseAdmin
      .from("news_items")
      .select("title, author_name")
      .eq("id", articleId)
      .maybeSingle();

    await sendPushToUsers(
      (admins || []).map((admin: any) => String(admin.id || "")).filter(Boolean),
      {
        type: "admin_report",
        title: "콘텐츠 신고 5건 접수",
        body: `${String(article?.author_name || "기자")}의 기사에 신고가 누적됐어요. 즉시 검토가 필요합니다.`,
        url: "/admin",
        data: { article_id: articleId, report_count: count || 0, severity: "high" },
      },
      true,
    );

    return new Response(JSON.stringify({ ok: true, count: count || 0 }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
