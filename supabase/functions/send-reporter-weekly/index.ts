import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendPushToUsers, supabaseAdmin } from "../_shared/sendPush.ts";

serve(async () => {
  try {
    const { data: rows } = await supabaseAdmin
      .from("article_stats")
      .select("reporter_id, view_count, share_count, comment_count")
      .order("updated_at", { ascending: false })
      .limit(500);

    const byReporter = new Map<string, { views: number; shares: number; comments: number }>();
    for (const row of rows || []) {
      const reporterId = String((row as any)?.reporter_id || "").trim();
      if (!reporterId) continue;
      const current = byReporter.get(reporterId) || { views: 0, shares: 0, comments: 0 };
      current.views += Number((row as any)?.view_count || 0);
      current.shares += Number((row as any)?.share_count || 0);
      current.comments += Number((row as any)?.comment_count || 0);
      byReporter.set(reporterId, current);
    }

    for (const [reporterId, stats] of byReporter.entries()) {
      await sendPushToUsers([reporterId], {
        type: "reporter_weekly_summary",
        title: "주간 성과 리포트가 도착했어요",
        body: `이번 주 조회수 ${stats.views.toLocaleString("ko-KR")}, 공유 ${stats.shares.toLocaleString("ko-KR")}, 댓글 ${stats.comments.toLocaleString("ko-KR")}개를 기록했어요.`,
        url: "/reporter",
        data: stats,
      }, false);
    }

    return new Response(JSON.stringify({ ok: true, reporterCount: byReporter.size }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
