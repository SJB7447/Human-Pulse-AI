export type RecommendationMixItem = {
  id: string;
  category?: string | null;
  emotion?: string | null;
};

export type RecommendationMixResult<T> = {
  sameCategory: T[];
  balance: T[];
};

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function selectRecommendationMix<T extends RecommendationMixItem>(
  current: T | null | undefined,
  related: T[],
): RecommendationMixResult<T> {
  if (!current) {
    return { sameCategory: [], balance: [] };
  }

  const candidates = related.filter((item) => item.id !== current.id);
  const normalizedCurrentCategory = normalizeText(current.category);
  const currentEmotion = normalizeText(current.emotion);

  const sameCategoryStrict = candidates.filter((item) => {
    const category = normalizeText(item.category);
    return Boolean(normalizedCurrentCategory) && Boolean(category) && category === normalizedCurrentCategory;
  });

  const sameEmotionFallback = candidates.filter((item) => {
    const emotion = normalizeText(item.emotion);
    return Boolean(currentEmotion) && Boolean(emotion) && emotion === currentEmotion;
  });

  const sameCategory = [...sameCategoryStrict];
  if (sameCategory.length < 2) {
    for (const item of sameEmotionFallback) {
      if (sameCategory.some((picked) => picked.id === item.id)) continue;
      sameCategory.push(item);
      if (sameCategory.length >= 2) break;
    }
  }
  const sameCategoryPicked = sameCategory.slice(0, 2);
  const selectedIds = new Set(sameCategoryPicked.map((item) => item.id));

  let balanceCandidate = candidates.find((item) => {
    if (selectedIds.has(item.id)) return false;
    const category = normalizeText(item.category);
    const emotion = normalizeText(item.emotion);
    const sameCategoryLabel = normalizedCurrentCategory ? category === normalizedCurrentCategory : false;
    const sameEmotion = emotion === currentEmotion;
    return !sameCategoryLabel && !sameEmotion;
  }) || null;

  if (!balanceCandidate) {
    balanceCandidate = candidates.find((item) => {
      if (selectedIds.has(item.id)) return false;
      return normalizeText(item.emotion) !== currentEmotion;
    }) || null;
  }

  if (normalizedCurrentCategory === "gravity" || currentEmotion === "gravity") {
    const needsGravityBalance =
      !balanceCandidate ||
      (normalizeText(balanceCandidate.emotion) !== "vibrance" && normalizeText(balanceCandidate.emotion) !== "serenity");
    if (needsGravityBalance) {
      const gravityFallback = candidates.find((item) => {
        if (selectedIds.has(item.id)) return false;
        const emotion = normalizeText(item.emotion);
        return emotion === "vibrance" || emotion === "serenity";
      });
      if (gravityFallback) balanceCandidate = gravityFallback;
    }
  }

  if (!balanceCandidate) {
    balanceCandidate = candidates.find((item) => {
      if (selectedIds.has(item.id)) return false;
      return normalizeText(item.category) !== normalizedCurrentCategory;
    }) || null;
  }

  return {
    sameCategory: sameCategoryPicked,
    balance: balanceCandidate ? [balanceCandidate] : [],
  };
}
