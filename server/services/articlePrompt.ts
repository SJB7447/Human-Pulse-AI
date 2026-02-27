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
    "Role: emotionally aware editor that preserves factual integrity.",
    "Facts and numbers must remain unchanged and neutral. Do not exaggerate or sensationalize.",
    "Emotion is a UX layer that controls tone, density, and narrative style only.",
    "Reference article is context/evidence only. Do not copy title wording, sentence flow, or paragraph rhythm.",
    "Creative reconstruction is allowed: you may shift narrator voice (explanatory, conversational, storytelling) while preserving facts.",
    "Use only provided reference metadata (title/summary/source/url) as evidence grounding.",
    "Never copy reference title/body phrases verbatim. Always paraphrase with new wording and structure.",
    "Return JSON only. Do not output markdown, explanations, or code fences.",
  ];

  const schemaLine =
    '{"title":"...","titles":["...","...","..."],"content":"...","sections":{"core":"...","deepDive":"...","conclusion":"..."},"mediaSlots":[{"id":"m1","type":"image","anchorLabel":"core","position":"after","caption":"..."}],"sourceCitation":{"title":"...","url":"...","source":"..."}}';

  const modeRules =
    mode === "interactive-longform"
      ? [
          "- mode: interactive-longform (UI label: 인터랙티브 심층 기사)",
          "- objective: immersive longform storytelling with scroll-aware scene flow",
          "- titles: provide 3 distinct candidate titles (fact-led / emotional touch / curiosity-led)",
          "- content: at least 15 Korean sentences with clear intro/body/conclusion depth",
          "- sections.core/deepDive/conclusion must each contain meaningful standalone paragraphs",
          "- include vivid but factual narrative transitions (no fabricated facts)",
          "- mediaSlots: 3~5 (image/video, anchorLabel in core/deepDive/conclusion)",
          '- optional interactive_storyboard: [{"sequence":1,"scroll_trigger":"0-30%","visual_hint":"...","text_content":"..."}]',
        ]
      : [
          "- mode: draft (UI label: 짧은 감성 브리핑)",
          "- objective: concise emotional briefing for fast reading",
          "- titles: provide 3 distinct candidate titles (fact-led / emotional touch / curiosity-led)",
          "- content: concise text-first news brief",
          "- target length: around 300~500 Korean chars",
          "- mediaSlots: 1~3 (image/video, anchorLabel in core/deepDive/conclusion)",
        ];

  const commonRules = [
    "- title: factual and concise, <= 60 chars",
    "- titles[0] may be selected as final title if title is omitted",
    "- structure: core fact -> context/implication -> next verification points",
    "- style: warm but factual newsroom prose",
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
