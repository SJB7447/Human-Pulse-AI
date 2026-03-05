import { selectRecommendationMix, type RecommendationMixItem } from "../shared/recommendationMix.js";

type Row = { id: string; result: "PASS" | "FAIL"; notes: string };

type Item = RecommendationMixItem & {
  title: string;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeItem(id: string, category: string, emotion: string): Item {
  return { id, title: id, category, emotion };
}

function runCase01(): Row {
  const current = makeItem("a0", "economy", "clarity");
  const related = [
    makeItem("a1", "economy", "clarity"),
    makeItem("a2", "economy", "clarity"),
    makeItem("a3", "policy", "immersion"),
    makeItem("a4", "world", "serenity"),
  ];
  const result = selectRecommendationMix(current, related);
  assert(result.sameCategory.length === 2, "sameCategory must contain 2 items");
  assert(result.balance.length === 1, "balance must contain 1 item");
  assert(result.sameCategory.every((item) => item.category === "economy"), "sameCategory must keep same category");
  assert(result.balance[0]?.emotion !== "clarity", "balance must differ from current emotion");
  return { id: "REC-MIX-01", result: "PASS", notes: "기본 규칙 2+1 유지" };
}

function runCase02(): Row {
  const current = makeItem("b0", "science", "clarity");
  const related = [
    makeItem("b1", "science", "clarity"),
    makeItem("b2", "world", "clarity"),
    makeItem("b3", "policy", "immersion"),
  ];
  const result = selectRecommendationMix(current, related);
  assert(result.sameCategory.length === 2, "sameCategory fallback must fill up to 2");
  assert(result.sameCategory.some((item) => item.category !== "science"), "fallback can include same-emotion non-category item");
  assert(result.balance.length === 1, "balance must still exist");
  return { id: "REC-MIX-02", result: "PASS", notes: "sameCategory 부족 시 sameEmotion fallback 동작" };
}

function runCase03(): Row {
  const current = makeItem("c0", "gravity", "gravity");
  const related = [
    makeItem("c1", "gravity", "gravity"),
    makeItem("c2", "gravity", "gravity"),
    makeItem("c3", "policy", "clarity"),
    makeItem("c4", "culture", "serenity"),
  ];
  const result = selectRecommendationMix(current, related);
  assert(result.balance.length === 1, "gravity balance must exist");
  const emotion = String(result.balance[0]?.emotion || "");
  assert(emotion === "vibrance" || emotion === "serenity", "gravity balance must prefer vibrance/serenity");
  return { id: "REC-MIX-03", result: "PASS", notes: "gravity 예외(serenity/vibrance 우선) 유지" };
}

async function main() {
  console.log("# Recommendation Mix Regression");
  const rows: Row[] = [];
  const runners = [runCase01, runCase02, runCase03];

  for (const run of runners) {
    try {
      rows.push(run());
    } catch (error: any) {
      rows.push({
        id: String(rows.length + 1).padStart(2, "0"),
        result: "FAIL",
        notes: String(error?.message || "unknown"),
      });
    }
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
