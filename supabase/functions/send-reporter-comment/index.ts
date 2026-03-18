import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendPushToUsers, supabaseAdmin } from "../_shared/sendPush.ts";

serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const row = payload?.record || payload?.new || {};
    const articleId = String(row?.article_id || row?.articleId || "").trim();
    if (!articleId) {
      return new Response(JSON.stringify({ ok: true, skipped: "missing_article_id" }), { headers: { "Content-Type": "application/json" } });
    }

    const { data: article } = await supabaseAdmin
      .from("news_items")
      .select("id, title, author_id")
      .eq("id", articleId)
      .maybeSingle();

    const reporterId = String(article?.author_id || row?.reporter_id || "").trim();
    if (!reporterId) {
      return new Response(JSON.stringify({ ok: true, skipped: "missing_reporter_id" }), { headers: { "Content-Type": "application/json" } });
    }

    const isReply = Boolean(row?.parent_comment_id || row?.parent_id);
    await sendPushToUsers([reporterId], {
      type: isReply ? "reporter_reply" : "reporter_comment",
      title: isReply ? "내 기사 댓글에 답글이 달렸어요" : "내 기사에 댓글이 달렸어요",
      body: `${String(article?.title || "기사")}에 새로운 반응이 도착했어요.`,
      url: "/reporter",
      data: { article_id: articleId },
    }, false);

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
