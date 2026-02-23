export {};

const BASE_URL = process.env.AI_BASE_URL || "http://localhost:5000";

async function requestJson(path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

async function main() {
  console.log("# Ops Alert Regression (S6-3)");
  console.log(`- baseUrl: ${BASE_URL}`);

  const testRes = await requestJson("/api/admin/alerts/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "s6-3-alert-runner",
      "x-actor-role": "admin",
    },
    body: JSON.stringify({ type: "ai_error" }),
  });

  const alertsRes = await requestJson("/api/admin/alerts?limit=10");
  const summaryRes = await requestJson("/api/admin/alerts/summary");

  const rows: Array<{ id: string; result: "PASS" | "FAIL"; notes: string }> = [];
  rows.push({
    id: "ALERT-01",
    result: testRes.status === 201 ? "PASS" : "FAIL",
    notes: `POST /api/admin/alerts/test status=${testRes.status}`,
  });
  rows.push({
    id: "ALERT-02",
    result: alertsRes.status === 200 && Array.isArray(alertsRes.data) ? "PASS" : "FAIL",
    notes: `GET /api/admin/alerts status=${alertsRes.status}`,
  });
  rows.push({
    id: "ALERT-03",
    result:
      summaryRes.status === 200 &&
      typeof summaryRes.data?.failureRate === "number" &&
      typeof summaryRes.data?.p95LatencyMs === "number" &&
      typeof summaryRes.data?.aiErrorCount === "number"
        ? "PASS"
        : "FAIL",
    notes: `GET /api/admin/alerts/summary status=${summaryRes.status}`,
  });

  console.log("| ID | Result | Notes |");
  console.log("|---|---|---|");
  rows.forEach((row) => {
    console.log(`| ${row.id} | ${row.result} | ${row.notes} |`);
  });

  if (rows.some((row) => row.result === "FAIL")) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
