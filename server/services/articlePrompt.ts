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
    "Facts must remain unchanged and neutral. Do not exaggerate or sensationalize.",
    "Reference article is context only. Do not copy title wording, sentence flow, or paragraph rhythm.",
    "Use only provided reference metadata (title/summary/source/url) as evidence grounding.",
    "Never copy reference title/body phrases verbatim. Always paraphrase with new wording and structure.",
    "Return JSON only. Do not output markdown, explanations, or code fences.",
  ];

  const schemaLine =
    '{"title":"...","content":"...","sections":{"core":"...","deepDive":"...","conclusion":"..."},"mediaSlots":[{"id":"m1","type":"image","anchorLabel":"core","position":"after","caption":"..."}],"sourceCitation":{"title":"...","url":"...","source":"..."}}';

  const modeRules =
    mode === "interactive-longform"
      ? [
          "- mode: interactive-longform",
          "- content: at least 15 Korean sentences with clear intro/body/conclusion depth",
          "- sections.core/deepDive/conclusion must each contain meaningful standalone paragraphs",
          "- mediaSlots: 3~5 (image/video, anchorLabel in core/deepDive/conclusion)",
        ]
      : [
          "- mode: draft",
          "- content: concise text-first news draft",
          "- target length: around 500 Korean chars",
          "- mediaSlots: 1~3 (image/video, anchorLabel in core/deepDive/conclusion)",
        ];

  const commonRules = [
    "- title: factual and concise, <= 60 chars",
    "- structure: core fact -> context/implication -> next verification points",
    "- style: neutral and informative newsroom prose",
    "- first paragraph must clearly state what happened and why it matters",
    "- conclusion must include 2~3 concrete follow-up checkpoints",
    "- do not paste raw URL text repeatedly in body",
    "- sourceCitation is mandatory",
    "- sourceCitation.url must match provided reference URL",
    "- direct phrase reuse from reference title/summary is prohibited",
  ];

  return [
    ...globalRules,
    "Return schema:",
    schemaLine,
    "Writing rules:",
    ...modeRules,
    ...commonRules,
    `keyword: ${input.keyword}`,
    `reference title: ${selectedArticle?.title || ""}`,
    `reference summary: ${selectedArticle?.summary || ""}`,
    `reference source: ${selectedArticle?.source || ""}`,
    `reference URL: ${selectedArticle?.url || ""}`,
  ].join("\n");
}
