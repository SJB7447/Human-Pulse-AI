import { readFile } from "node:fs/promises";

const files = {
  routes: "server/routes.ts",
  prompt: "server/services/articlePrompt.ts",
  contract: "docs/article_generation_contract_v1.md",
  tickets: "docs/article_generation_tickets_v1.md",
  baseline: "docs/article_generation_total_2026-02-23.md",
};

async function load(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function mustContain(haystack: string, needle: string, label: string): string[] {
  return haystack.includes(needle) ? [] : [`missing ${label}: ${needle}`];
}

async function main() {
  const [routes, prompt, contract, tickets, baseline] = await Promise.all([
    load(files.routes),
    load(files.prompt),
    load(files.contract),
    load(files.tickets),
    load(files.baseline),
  ]);

  const issues: string[] = [];
  issues.push(...mustContain(routes, 'const DRAFT_PROMPT_VERSION = "article_generation_contract_v1"', "prompt version binding"));
  issues.push(...mustContain(routes, 'app.post("/api/ai/generate-draft"', "generate-draft endpoint"));
  issues.push(...mustContain(routes, 'app.post("/api/ai/regenerate-draft-section"', "regenerate section endpoint"));
  issues.push(...mustContain(routes, 'app.post("/api/ai/regenerate-draft-paragraph"', "regenerate paragraph endpoint"));
  issues.push(...mustContain(routes, '"AI_DRAFT_COPY_BLOCKED"', "copy-block reason code"));
  issues.push(...mustContain(routes, "sourceCitation", "source citation contract"));
  issues.push(...mustContain(prompt, "Creative reconstruction is allowed", "creative reconstruction prompt rule"));
  issues.push(...mustContain(contract, "Copy-Integrity Gate", "contract gate definition"));
  issues.push(...mustContain(tickets, "T3. Copy-Integrity Gate", "tickets T3 rename"));
  issues.push(...mustContain(baseline, "Gate order: `parse -> schema -> similarity -> compliance`", "baseline gate order"));

  if (issues.length > 0) {
    console.error("# Article Generation Sync Check: FAIL");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("# Article Generation Sync Check: PASS");
  console.log("- prompt/docs/tickets/routes are aligned on required guardrails");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

