export {};

const BASE_URL = process.env.AI_BASE_URL || "http://localhost:5000";

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

async function main() {
  console.log("# AI News Regression");
  console.log(`- baseUrl: ${BASE_URL}`);
  const rows: Array<{ id: string; result: "PASS" | "FAIL"; notes: string }> = [];

  try {
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
