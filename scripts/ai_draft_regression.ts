export {};

type DraftCase = {
  id: string;
  mode: "draft" | "interactive-longform";
  scenario: "draft-success" | "draft-schema-block" | "longform-success" | "longform-schema-block";
  expectStatus: number;
  expectCode?: string;
};

const BASE_URL = process.env.AI_BASE_URL || "http://localhost:5000";

const cases: DraftCase[] = [
  { id: "DRAFT-SUCCESS", mode: "draft", scenario: "draft-success", expectStatus: 200 },
  { id: "DRAFT-BLOCK", mode: "draft", scenario: "draft-schema-block", expectStatus: 502, expectCode: "AI_DRAFT_SCHEMA_INVALID" },
  { id: "LONGFORM-SUCCESS", mode: "interactive-longform", scenario: "longform-success", expectStatus: 200 },
  { id: "LONGFORM-BLOCK", mode: "interactive-longform", scenario: "longform-schema-block", expectStatus: 502, expectCode: "AI_DRAFT_SCHEMA_INVALID" },
];

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

function getCounters(statsData: any) {
  const ai = statsData?.aiDraftOps;
  const totals = ai?.totals || {};
  const byMode = ai?.byMode || {};
  return {
    totals: {
      requests: Number(totals.requests || 0),
      success: Number(totals.success || 0),
      schemaBlocks: Number(totals.schemaBlocks || 0),
    },
    draft: {
      requests: Number(byMode?.draft?.requests || 0),
      success: Number(byMode?.draft?.success || 0),
      schemaBlocks: Number(byMode?.draft?.schemaBlocks || 0),
    },
    longform: {
      requests: Number(byMode?.["interactive-longform"]?.requests || 0),
      success: Number(byMode?.["interactive-longform"]?.success || 0),
      schemaBlocks: Number(byMode?.["interactive-longform"]?.schemaBlocks || 0),
    },
  };
}

async function main() {
  console.log("# AI Draft Regression");
  console.log(`- baseUrl: ${BASE_URL}`);
  console.log("- requirement: server must run with ENABLE_AI_DRAFT_TEST_SCENARIO=1");
  const rows: Array<{ id: string; result: "PASS" | "FAIL"; notes: string }> = [];

  try {
    const settingsBeforeRes = await requestJson("/api/admin/ai-draft/settings");
    if (settingsBeforeRes.status !== 200) {
      throw new Error(`failed to read /api/admin/ai-draft/settings (status=${settingsBeforeRes.status})`);
    }
    const originalSettings = settingsBeforeRes.data?.values || {};
    const nextTitleMax = Math.max(30, Math.min(140, Number(originalSettings.titleMaxLength || 60) + 1));

    const settingsUpdateRes = await requestJson("/api/admin/ai-draft/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": "ai-draft-regression-runner",
        "x-actor-role": "admin",
      },
      body: JSON.stringify({ titleMaxLength: nextTitleMax }),
    });

    const settingsUpdateOk =
      settingsUpdateRes.status === 200 &&
      Number(settingsUpdateRes.data?.values?.titleMaxLength || 0) === nextTitleMax;
    rows.push({
      id: "DRAFT-SETTINGS-UPDATE",
      result: settingsUpdateOk ? "PASS" : "FAIL",
      notes: settingsUpdateOk
        ? `titleMaxLength updated to ${nextTitleMax}`
        : `settings update failed status=${settingsUpdateRes.status}`,
    });

    const settingsRestoreRes = await requestJson("/api/admin/ai-draft/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": "ai-draft-regression-runner",
        "x-actor-role": "admin",
      },
      body: JSON.stringify({ titleMaxLength: Number(originalSettings.titleMaxLength || 60) }),
    });
    const settingsRestoreOk =
      settingsRestoreRes.status === 200 &&
      Number(settingsRestoreRes.data?.values?.titleMaxLength || 0) === Number(originalSettings.titleMaxLength || 60);
    rows.push({
      id: "DRAFT-SETTINGS-RESTORE",
      result: settingsRestoreOk ? "PASS" : "FAIL",
      notes: settingsRestoreOk ? "titleMaxLength restored" : `settings restore failed status=${settingsRestoreRes.status}`,
    });

    const beforeStats = await requestJson("/api/admin/stats");
    if (beforeStats.status !== 200) {
      throw new Error(`failed to read /api/admin/stats before run (status=${beforeStats.status})`);
    }
    const before = getCounters(beforeStats.data);

    for (const c of cases) {
      const payload = {
        keyword: `regression-${c.id.toLowerCase()}`,
        mode: c.mode,
        selectedArticle: {
          title: "Reference headline",
          summary: "Reference summary",
          url: "https://example.com/reference",
          source: "Regression Source",
        },
      };
      const response = await requestJson("/api/ai/generate-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-draft-scenario": c.scenario,
        },
        body: JSON.stringify(payload),
      });

      const statusOk = response.status === c.expectStatus;
      const codeOk = c.expectCode ? String(response.data?.code || "") === c.expectCode : true;
      const successFieldsOk = c.expectStatus === 200
        ? Boolean(
          response.data?.title &&
          response.data?.content &&
          response.data?.sections &&
          response.data?.compliance &&
          response.data?.sourceCitation?.url &&
          response.data?.sourceCitation?.source,
        )
        : true;
      const sourceSeparatedOk = c.expectStatus === 200
        ? !/\[출처\]/.test(String(response.data?.content || ""))
        : true;
      const issuesFieldOk = c.expectCode
        ? Array.isArray(response.data?.issues) && response.data.issues.length > 0
        : true;

      const pass = statusOk && codeOk && successFieldsOk && sourceSeparatedOk && issuesFieldOk;
      rows.push({
        id: c.id,
        result: pass ? "PASS" : "FAIL",
        notes: pass
          ? `${c.scenario} status=${response.status}`
          : `status=${response.status}, code=${String(response.data?.code || "")}`,
      });
    }

    const modeSwitchLongform = await requestJson("/api/ai/generate-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-draft-scenario": "longform-success",
      },
      body: JSON.stringify({
        keyword: "regression-mode-switch-longform",
        mode: "interactive-longform",
        selectedArticle: {
          title: "Reference headline",
          summary: "Reference summary",
          url: "https://example.com/reference",
          source: "Regression Source",
        },
      }),
    });
    const modeSwitchDraft = await requestJson("/api/ai/generate-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-draft-scenario": "draft-success",
      },
      body: JSON.stringify({
        keyword: "regression-mode-switch-draft",
        mode: "draft",
        selectedArticle: {
          title: "Reference headline",
          summary: "Reference summary",
          url: "https://example.com/reference",
          source: "Regression Source",
        },
      }),
    });
    const modeSwitchOk =
      modeSwitchLongform.status === 200 &&
      modeSwitchDraft.status === 200 &&
      Array.isArray(modeSwitchLongform.data?.mediaSlots) &&
      modeSwitchLongform.data.mediaSlots.length >= 3 &&
      Array.isArray(modeSwitchDraft.data?.mediaSlots) &&
      modeSwitchDraft.data.mediaSlots.length <= 1;
    rows.push({
      id: "DRAFT-MODE-SWITCH",
      result: modeSwitchOk ? "PASS" : "FAIL",
      notes: modeSwitchOk ? "longform->draft mode switch contract stable" : "media slot carryover detected",
    });

    const paragraphInvalidRes = await requestJson("/api/ai/regenerate-draft-paragraph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: "regression-paragraph",
        mode: "draft",
        title: "테스트",
        paragraphIndex: 4,
        paragraphs: ["a", "b"],
        selectedArticle: {
          title: "Reference headline",
          summary: "Reference summary",
          url: "https://example.com/reference",
          source: "Regression Source",
        },
      }),
    });
    const paragraphInvalidOk =
      paragraphInvalidRes.status === 400 &&
      String(paragraphInvalidRes.data?.code || "") === "AI_DRAFT_PARAGRAPH_INVALID";
    rows.push({
      id: "DRAFT-PARAGRAPH-ENDPOINT",
      result: paragraphInvalidOk ? "PASS" : "FAIL",
      notes: paragraphInvalidOk ? "invalid paragraph guard works" : `status=${paragraphInvalidRes.status}, code=${String(paragraphInvalidRes.data?.code || "")}`,
    });

    const afterStats = await requestJson("/api/admin/stats");
    if (afterStats.status !== 200) {
      throw new Error(`failed to read /api/admin/stats after run (status=${afterStats.status})`);
    }
    const after = getCounters(afterStats.data);

    const telemetryOk =
      after.totals.requests - before.totals.requests >= 4 &&
      after.totals.success - before.totals.success >= 2 &&
      after.totals.schemaBlocks - before.totals.schemaBlocks >= 2 &&
      after.draft.success - before.draft.success >= 1 &&
      after.longform.success - before.longform.success >= 1 &&
      after.draft.schemaBlocks - before.draft.schemaBlocks >= 1 &&
      after.longform.schemaBlocks - before.longform.schemaBlocks >= 1;

    rows.push({
      id: "DRAFT-TELEMETRY",
      result: telemetryOk ? "PASS" : "FAIL",
      notes: telemetryOk
        ? "aiDraftOps counters updated for both modes (success + schemaBlocks)"
        : "aiDraftOps delta mismatch after regression run",
    });
  } catch (error: any) {
    rows.push({ id: "DRAFT-99", result: "FAIL", notes: error?.message || "unexpected runtime error" });
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
