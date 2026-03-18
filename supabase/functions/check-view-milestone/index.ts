import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendPushToUsers, supabaseAdmin } from "../_shared/sendPush.ts";

const MILESTONES = [10000, 50000, 100000, 500000];

serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const row = payload?.record || payload?.new || {};
    const oldRow = payload?.old || {};
    const articleId = String(row?.article_id || "").trim();
    const reporterId = String(row?.reporter_id || "").trim();
    const nextViews = Number(row?.view_count || 0);
    const previousViews = Number(oldRow?.view_count || row?.last_milestone || 0);
    const crossed = MILESTONES.filter((milestone) => previousViews < milestone && nextViews >= milestone).sort((a, b) => b - a)[0];

    if (!articleId || !reporterId || !crossed) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("article_stats").update({ last_milestone: crossed, updated_at: new Date().toISOString() }).eq("article_id", articleId);

    const { data: article } = await supabaseAdmin.from("news_items").select("title").eq("id", articleId).maybeSingle();

    await sendPushToUsers([reporterId], {
      type: "reporter_view_milestone",
      title: `기사 ${crossed.toLocaleString("ko-KR")}뷰 달성!`,
      body: `${String(article?.title || "기사")}가 조회수 마일스톤을 돌파했어요.`,
      url: "/reporter",
      data: { article_id: articleId, milestone: crossed },
    }, false);

    return new Response(JSON.stringify({ ok: true, milestone: crossed }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
