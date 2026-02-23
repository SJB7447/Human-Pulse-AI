export type DraftMode = "draft" | "interactive-longform";

export type SelectedReference = {
  title: string;
  summary: string;
  url: string;
  source: string;
} | null;

export function normalizeDraftMode(mode: string): DraftMode {
  return mode === "interactive-longform" ? "interactive-longform" : "draft";
}

export function buildDraftGenerationPrompt(input: {
  keyword: string;
  mode: string;
  selectedArticle: SelectedReference;
}): string {
  const mode = normalizeDraftMode(input.mode);
  const selectedArticle = input.selectedArticle;

  const globalRules = [
    "You are HueBrief newsroom AI assistant.",
    "기사 사실관계는 참고 이슈를 기준으로 유지하고, 과장/선동/단정 표현을 금지한다.",
    "Reference article is context only. Do not copy title wording, sentence flow, or paragraph rhythm.",
    "반드시 JSON only로 응답한다. 설명 문장, 마크다운, 코드블록을 출력하지 않는다.",
  ];

  const schemaLine = `{"title":"...","content":"...","sections":{"core":"...","deepDive":"...","conclusion":"..."},"mediaSlots":[{"id":"m1","type":"image","anchorLabel":"core","position":"after","caption":"..."}],"sourceCitation":{"title":"...","url":"...","source":"..."}}`;

  const modeRules =
    mode === "interactive-longform"
      ? [
        "- mode: interactive-longform",
        "- content: 최소 15문장 이상, 맥락/해설 중심의 심층 구조",
        "- sections.core/deepDive/conclusion 각각 독립 문단으로 채울 것",
        "- mediaSlots: 3~5개 (image/video, anchorLabel: core/deepDive/conclusion)",
      ]
      : [
        "- mode: draft",
        "- content: 간결한 기사 본문",
        "- 분량 목표: 500자 내외",
        "- mediaSlots: 1~3개 (image/video, anchorLabel: core/deepDive/conclusion)",
      ];

  const commonRules = [
    "- title: 60자 이내, 사실형 제목",
    "- structure: 핵심 사실 -> 배경/맥락 -> 결론/다음 확인 포인트",
    "- 본문은 균형적이고 중립적인 문체 유지",
    "- 첫 단락에 현재 쟁점과 사실 요약을 명확히 제시",
    "- 결론에서 후속 확인 포인트 2~3개 제시",
    "- URL 텍스트를 본문에 그대로 반복하지 않기",
    "- sourceCitation은 반드시 포함",
  ];

  return [
    ...globalRules,
    "Return schema:",
    schemaLine,
    "Writing rules:",
    ...modeRules,
    ...commonRules,
    `입력 키워드: ${input.keyword}`,
    `참고 기사 제목: ${selectedArticle?.title || ""}`,
    `참고 기사 요약: ${selectedArticle?.summary || ""}`,
    `참고 기사 출처: ${selectedArticle?.source || ""}`,
    `참고 기사 URL: ${selectedArticle?.url || ""}`,
  ].join("\n");
}
