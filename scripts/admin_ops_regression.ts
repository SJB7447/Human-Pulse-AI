export {};

type OpsCase = {
  id: string;
  result: "PASS" | "FAIL";
  notes: string;
};

const BASE_URL = process.env.AI_BASE_URL || "http://localhost:5000";
const ACTOR_HEADERS = {
  "Content-Type": "application/json",
  "x-actor-id": "s5-6-regression-runner",
  "x-actor-role": "admin",
};

async function requestJson(path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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

function hasAction(logs: any[], action: string): boolean {
  return logs.some((row) => String(row?.action || "") === action);
}

async function main() {
  console.log("# Admin Ops Regression (S5-6)");
  console.log(`- baseUrl: ${BASE_URL}`);

  const rows: OpsCase[] = [];

  try {
    const baselineLogsRes = await requestJson("/api/admin/action-logs?limit=300");
    if (baselineLogsRes.status !== 200 || !Array.isArray(baselineLogsRes.data)) {
      rows.push({
        id: "OPS-00",
        result: "FAIL",
        notes: `failed to read baseline logs: status=${baselineLogsRes.status}`,
      });
      throw new Error("Baseline log read failed");
    }
    const baselineIds = new Set<string>(baselineLogsRes.data.map((row: any) => String(row?.id || "")));

    const articlesRes = await requestJson("/api/articles?all=true");
    if (articlesRes.status !== 200 || !Array.isArray(articlesRes.data) || articlesRes.data.length === 0) {
      rows.push({
        id: "OPS-01",
        result: "FAIL",
        notes: `no article for regression: status=${articlesRes.status}`,
      });
      throw new Error("No article");
    }
    const articleId = String(articlesRes.data[0].id);

    const hideRes = await requestJson(`/api/articles/${articleId}`, {
      method: "PUT",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ isPublished: false }),
    });
    rows.push({
      id: "OPS-02",
      result: hideRes.status === 200 ? "PASS" : "FAIL",
      notes: hideRes.status === 200 ? "hide article ok" : `hide failed status=${hideRes.status}`,
    });

    const publishRes = await requestJson(`/api/articles/${articleId}`, {
      method: "PUT",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ isPublished: true }),
    });
    rows.push({
      id: "OPS-03",
      result: publishRes.status === 200 ? "PASS" : "FAIL",
      notes: publishRes.status === 200 ? "publish article ok" : `publish failed status=${publishRes.status}`,
    });

    const reviewCompleteRes = await requestJson(`/api/admin/reviews/${articleId}`, {
      method: "PUT",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ completed: true }),
    });
    rows.push({
      id: "OPS-04",
      result: reviewCompleteRes.status === 200 ? "PASS" : "FAIL",
      notes: reviewCompleteRes.status === 200 ? "review complete ok" : `review complete failed status=${reviewCompleteRes.status}`,
    });

    const reviewReopenRes = await requestJson(`/api/admin/reviews/${articleId}`, {
      method: "PUT",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ completed: false }),
    });
    rows.push({
      id: "OPS-05",
      result: reviewReopenRes.status === 200 ? "PASS" : "FAIL",
      notes: reviewReopenRes.status === 200 ? "review reopen ok" : `review reopen failed status=${reviewReopenRes.status}`,
    });

    const issueText = `S5-6 regression issue ${new Date().toISOString()}`;
    const issueRes = await requestJson(`/api/admin/reviews/${articleId}/issues`, {
      method: "POST",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ issue: issueText }),
    });
    rows.push({
      id: "OPS-06",
      result: issueRes.status === 200 ? "PASS" : "FAIL",
      notes: issueRes.status === 200 ? "issue add ok" : `issue add failed status=${issueRes.status}`,
    });

    const reportRes = await requestJson("/api/admin/reports", {
      method: "POST",
      headers: ACTOR_HEADERS,
      body: JSON.stringify({ articleId, reason: `S5-6 report ${new Date().toISOString()}` }),
    });
    const reportId = String(reportRes.data?.id || "");
    rows.push({
      id: "OPS-07",
      result: reportRes.status === 201 && Boolean(reportId) ? "PASS" : "FAIL",
      notes: reportRes.status === 201 && reportId ? "report create ok" : `report create failed status=${reportRes.status}`,
    });

    if (!reportId) {
      rows.push({ id: "OPS-08", result: "FAIL", notes: "report id missing; skip status transition" });
      rows.push({ id: "OPS-09", result: "FAIL", notes: "report id missing; skip status transition" });
    } else {
      const reportReviewRes = await requestJson(`/api/admin/reports/${reportId}/status`, {
        method: "PUT",
        headers: ACTOR_HEADERS,
        body: JSON.stringify({ status: "in_review", resolution: "runner in_review" }),
      });
      rows.push({
        id: "OPS-08",
        result: reportReviewRes.status === 200 && String(reportReviewRes.data?.status || "") === "in_review" ? "PASS" : "FAIL",
        notes:
          reportReviewRes.status === 200 && String(reportReviewRes.data?.status || "") === "in_review"
            ? "report in_review ok"
            : `report in_review failed status=${reportReviewRes.status}`,
      });

      const reportResolvedRes = await requestJson(`/api/admin/reports/${reportId}/status`, {
        method: "PUT",
        headers: ACTOR_HEADERS,
        body: JSON.stringify({ status: "resolved", sanctionType: "hide_article", resolution: "runner resolved" }),
      });
      rows.push({
        id: "OPS-09",
        result: reportResolvedRes.status === 200 && String(reportResolvedRes.data?.status || "") === "resolved" ? "PASS" : "FAIL",
        notes:
          reportResolvedRes.status === 200 && String(reportResolvedRes.data?.status || "") === "resolved"
            ? "report resolved ok"
            : `report resolved failed status=${reportResolvedRes.status}`,
      });
    }

    const afterLogsRes = await requestJson("/api/admin/action-logs?limit=400");
    if (afterLogsRes.status !== 200 || !Array.isArray(afterLogsRes.data)) {
      rows.push({
        id: "OPS-10",
        result: "FAIL",
        notes: `failed to read logs after actions: status=${afterLogsRes.status}`,
      });
    } else {
      const deltaLogs = afterLogsRes.data.filter((row: any) => !baselineIds.has(String(row?.id || "")));
      const expectedActions = [
        "hide",
        "publish",
        "review_complete",
        "review_reopen",
        "issue_add",
        "report_create",
      ];
      const missing = expectedActions.filter((action) => !hasAction(deltaLogs, action));
      const reportStatusUpdates = deltaLogs.filter((row: any) => String(row?.action || "") === "report_status_update").length;
      const reportStatusOk = reportStatusUpdates >= 2;
      rows.push({
        id: "OPS-10",
        result: missing.length === 0 && reportStatusOk ? "PASS" : "FAIL",
        notes:
          missing.length === 0 && reportStatusOk
            ? "audit logs captured for all expected actions"
            : `missing=${missing.join(",") || "none"}, report_status_update_count=${reportStatusUpdates}`,
      });
    }
  } catch (error: any) {
    rows.push({
      id: "OPS-99",
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
