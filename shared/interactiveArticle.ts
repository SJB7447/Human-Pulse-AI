export type StoryBlockIntent =
  | "intro"
  | "context"
  | "tension"
  | "interpretation"
  | "closure";

export type HighlightType = "issue" | "emotion";
export type InteractionTrigger = "scroll" | "click" | "hover";
export type InteractionAction =
  | "reveal"
  | "focus"
  | "annotate"
  | "cameraMove3d"
  | "objectPulse3d";

export interface InteractiveGenerationInput {
  keywords: string[];
  tone: "neutral" | "analytical" | "urgent" | "empathetic" | "investigative";
  targetAudience: string;
  platform: "web" | "mobile" | "immersive";
  interactionIntensity: "low" | "medium" | "high";
  language?: string;
  constraints?: {
    minBlocks?: number;
    maxCharsPerBlock?: number;
  };
}

export interface InteractiveStoryBlock {
  id: string;
  intent: StoryBlockIntent;
  text: string;
}

export interface InteractiveScrollMapItem {
  blockId: string;
  start: number;
  end: number;
}

export interface InteractiveHighlight {
  id: string;
  blockId: string;
  type: HighlightType;
  label: string;
  anchorText: string;
  payload: Record<string, unknown>;
}

export interface InteractiveHint {
  id: string;
  blockId: string;
  trigger: InteractionTrigger;
  action: InteractionAction;
  target: string;
  params?: Record<string, unknown>;
}

export interface InteractiveQualityMeta {
  intentCoverage: Record<StoryBlockIntent, boolean>;
  readabilitySafe: boolean;
  immersionSafe: boolean;
  highlightDensity: number;
  validationPassed: boolean;
  notes: string;
}

export interface InteractiveArticle {
  specVersion: "interactive-generation.v1";
  articleMeta: {
    title: string;
    subtitle?: string;
    topic: string;
    tone: InteractiveGenerationInput["tone"];
    targetAudience: string;
    platform: InteractiveGenerationInput["platform"];
    interactionIntensity: InteractiveGenerationInput["interactionIntensity"];
  };
  storyBlocks: InteractiveStoryBlock[];
  scrollMap: InteractiveScrollMapItem[];
  highlights: InteractiveHighlight[];
  interactionHints: InteractiveHint[];
  qualityMeta: InteractiveQualityMeta;
}

const REQUIRED_INTENTS: StoryBlockIntent[] = [
  "intro",
  "context",
  "tension",
  "interpretation",
  "closure",
];

export function validateInteractiveArticle(article: InteractiveArticle): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const blocks = article.storyBlocks || [];

  if (article.specVersion !== "interactive-generation.v1") {
    errors.push("specVersion must be interactive-generation.v1");
  }

  if (blocks.length < 5) {
    errors.push("storyBlocks must contain at least 5 blocks.");
  }

  const intentSet = new Set(blocks.map((b) => b.intent));
  for (const intent of REQUIRED_INTENTS) {
    if (!intentSet.has(intent)) {
      errors.push(`Missing required intent: ${intent}`);
    }
  }

  const scrollMap = article.scrollMap || [];
  if (scrollMap.length !== blocks.length) {
    errors.push("scrollMap length must match storyBlocks length.");
  }

  const sorted = [...scrollMap].sort((a, b) => a.start - b.start);
  if (sorted[0] && sorted[0].start !== 0) {
    errors.push("scrollMap must start at 0.");
  }
  if (sorted.length > 0 && sorted[sorted.length - 1].end !== 100) {
    errors.push("scrollMap must end at 100.");
  }

  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].start < 0 || sorted[i].end > 100) {
      errors.push(`Scroll range out of bounds for blockId=${sorted[i].blockId}`);
    }
    if (sorted[i].start >= sorted[i].end) {
      errors.push(`Invalid scroll range for blockId=${sorted[i].blockId}`);
    }
    if (i > 0 && sorted[i - 1].end > sorted[i].start) {
      errors.push("scrollMap ranges must not overlap.");
    }
    if (i > 0 && sorted[i - 1].end < sorted[i].start) {
      errors.push("scrollMap ranges must not contain gaps.");
    }
  }

  const ids = new Set(blocks.map((b) => b.id));
  for (const m of scrollMap) {
    if (!ids.has(m.blockId)) {
      errors.push(`scrollMap references unknown blockId=${m.blockId}`);
    }
  }
  for (const h of article.highlights || []) {
    if (!ids.has(h.blockId)) {
      errors.push(`highlights references unknown blockId=${h.blockId}`);
    }
  }
  if ((article.highlights || []).length === 0) {
    errors.push("At least one highlight is required.");
  }
  for (const h of article.interactionHints || []) {
    if (!ids.has(h.blockId)) {
      errors.push(`interactionHints references unknown blockId=${h.blockId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
