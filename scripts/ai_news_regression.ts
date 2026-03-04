export {};

const BASE_URL = process.env.AI_BASE_URL || "http://localhost:5000";
const TODAY_UTC = new Date().toISOString().slice(0, 10);

type AdminStatsSnapshot = {
  aiNewsOps?: {
    reasonCodes?: Record<string, number>;
    trends?: {
      last7d?: Array<{
        date?: string;
        totals?: {
          requests?: number;
          success?: number;
          parseFailures?: number;
          qualityBlocks?: number;
          fallbackRecoveries?: number;
          modelEmpty?: number;
        };
      }>;
      last30d?: Array<{
        date?: string;
        totals?: {
          requests?: number;
          success?: number;
          parseFailures?: number;
          qualityBlocks?: number;
          fallbackRecoveries?: number;
          modelEmpty?: number;
        };
      }>;
    };
  };
};

async function requestJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

function isValidItem(item: any): boolean {
  const citations = Array.isArray(item?.sourceCitation) ? item.sourceCitation : [];
  const validCitation = citations.some((citation: any) =>
    typeof citation?.title === "string" &&
    citation.title.trim().length > 0 &&
    typeof citation?.source === "string" &&
    citation.source.trim().length > 0 &&
    typeof citation?.url === "string" &&
    /^https?:\/\//i.test(citation.url.trim()),
  );
  return Boolean(
    item &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    typeof item.summary === "string" &&
    item.summary.trim().length > 0 &&
    typeof item.content === "string" &&
    item.content.trim().length > 0 &&
    typeof item.source === "string" &&
    item.source.trim().length > 0 &&
    validCitation &&
    typeof item.fallbackUsed === "boolean",
  );
}

function getTodayRequests(rows: Array<{ date?: string; totals?: { requests?: number } }> | undefined): number {
  const todayRow = (rows || []).find((row) => String(row?.date || "") === TODAY_UTC);
  return Number(todayRow?.totals?.requests || 0);
}

function sumReasonCodes(reasonCodes: Record<string, number> | undefined): number {
  return Object.values(reasonCodes || {}).reduce((acc, value) => acc + Number(value || 0), 0);
}

async function main() {
  console.log("# AI News Regression");
  console.log(`- baseUrl: ${BASE_URL}`);
  const rows: Array<{ id: string; result: "PASS" | "FAIL"; notes: string }> = [];

  try {
    const beforeStatsRes = await requestJson("/api/admin/stats");
    const beforeStats = (beforeStatsRes.data || {}) as AdminStatsSnapshot;
    const beforeTrend7d = beforeStats.aiNewsOps?.trends?.last7d || [];
    const beforeTrend30d = beforeStats.aiNewsOps?.trends?.last30d || [];
    const beforeToday7dRequests = getTodayRequests(beforeTrend7d);
    const beforeToday30dRequests = getTodayRequests(beforeTrend30d);
    const beforeReasonCodeTotal = sumReasonCodes(beforeStats.aiNewsOps?.reasonCodes);

    const trendShapeOk =
      beforeStatsRes.status === 200 &&
      beforeTrend7d.length === 7 &&
      beforeTrend30d.length === 30 &&
      beforeTrend7d.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || ""))) &&
      beforeTrend30d.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")));
    rows.push({
      id: "AI-NEWS-00",
      result: trendShapeOk ? "PASS" : "FAIL",
      notes: trendShapeOk ? "admin stats trend shape valid (7d/30d)" : `status=${beforeStatsRes.status}, trend7d=${beforeTrend7d.length}, trend30d=${beforeTrend30d.length}`,
    });

    const forbiddenRes = await requestJson("/api/ai/generate-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emotion: "serenity" }),
    });
    const forbiddenOk =
      forbiddenRes.status === 403 &&
      String(forbiddenRes.data?.code || "") === "AI_NEWS_FORBIDDEN";
    rows.push({
      id: "AI-NEWS-01",
      result: forbiddenOk ? "PASS" : "FAIL",
      notes: forbiddenOk ? "unauthorized blocked" : `status=${forbiddenRes.status}, code=${String(forbiddenRes.data?.code || "")}`,
    });

    const successRes = await requestJson("/api/ai/generate-news", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": "ai-news-regression-runner",
        "x-actor-role": "journalist",
      },
      body: JSON.stringify({ emotion: "clarity" }),
    });
    const items = Array.isArray(successRes.data) ? successRes.data : [];
    const hasThree = items.length === 3;
    const allValid = items.every((item: any) => isValidItem(item) && String(item.emotion || "") === "clarity");
    const noDemoSource = items.every((item: any) => !/demo/i.test(String(item.source || "")));
    const fallbackReasonOk = items.every((item: any) => item.fallbackUsed ? Boolean(String(item.reasonCode || "").trim()) : true);
    const successOk = successRes.status === 200 && hasThree && allValid && noDemoSource && fallbackReasonOk;
    rows.push({
      id: "AI-NEWS-02",
      result: successOk ? "PASS" : "FAIL",
      notes: successOk ? "authorized generation returns 3 valid items" : `status=${successRes.status}, count=${items.length}`,
    });

    const afterStatsRes = await requestJson("/api/admin/stats");
    const afterStats = (afterStatsRes.data || {}) as AdminStatsSnapshot;
    const afterTrend7d = afterStats.aiNewsOps?.trends?.last7d || [];
    const afterTrend30d = afterStats.aiNewsOps?.trends?.last30d || [];
    const afterToday7dRequests = getTodayRequests(afterTrend7d);
    const afterToday30dRequests = getTodayRequests(afterTrend30d);
    const afterReasonCodeTotal = sumReasonCodes(afterStats.aiNewsOps?.reasonCodes);

    const trendIncrementOk =
      afterStatsRes.status === 200 &&
      afterToday7dRequests >= beforeToday7dRequests + 1 &&
      afterToday30dRequests >= beforeToday30dRequests + 1;
    rows.push({
      id: "AI-NEWS-03",
      result: trendIncrementOk ? "PASS" : "FAIL",
      notes: trendIncrementOk
        ? `today request trend incremented (7d: ${beforeToday7dRequests}->${afterToday7dRequests}, 30d: ${beforeToday30dRequests}->${afterToday30dRequests})`
        : `trend did not increment (7d: ${beforeToday7dRequests}->${afterToday7dRequests}, 30d: ${beforeToday30dRequests}->${afterToday30dRequests})`,
    });

    const reasonCodes = afterStats.aiNewsOps?.reasonCodes || {};
    const reasonCodeShapeOk = Object.entries(reasonCodes).every(
      ([code, count]) =>
        String(code || "").trim().length > 0 &&
        Number.isFinite(Number(count)) &&
        Number(count) >= 0,
    );
    rows.push({
      id: "AI-NEWS-04",
      result: reasonCodeShapeOk ? "PASS" : "FAIL",
      notes: reasonCodeShapeOk
        ? `reasonCode map shape valid (total=${afterReasonCodeTotal}, delta=${afterReasonCodeTotal - beforeReasonCodeTotal})`
        : "reasonCode map contains invalid key/value",
    });

    const responseReasonCodes = Array.from(new Set(
      items
        .map((item: any) => String(item?.reasonCode || "").trim())
        .filter(Boolean),
    ));
    const reasonCodeSyncOk = responseReasonCodes.length === 0 || responseReasonCodes.every((code) => Number(reasonCodes[code] || 0) > 0);
    rows.push({
      id: "AI-NEWS-05",
      result: reasonCodeSyncOk ? "PASS" : "FAIL",
      notes: reasonCodeSyncOk
        ? (responseReasonCodes.length > 0
          ? `response reasonCode tracked in admin stats (${responseReasonCodes.join(", ")})`
          : "response had no reasonCode (normal path)")
        : `response reasonCode missing in admin stats (${responseReasonCodes.join(", ")})`,
    });
  } catch (error: any) {
    rows.push({
      id: "AI-NEWS-99",
      result: "FAIL",
      notes: error?.message || "unexpected runtime error",
    });
  }

  console.log("| ID | Result | Notes |");
  console.log("|---|---|---|");
  for (const row of rows) {
    console.log(`| ${row.id} | ${row.result} | ${row.notes} |`);
  }

  if (rows.some((row) => row.result === "FAIL")) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
