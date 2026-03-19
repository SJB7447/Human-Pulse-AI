export type AdminEmotionKey = 'vibrance' | 'immersion' | 'clarity' | 'gravity' | 'serenity' | 'spectrum';

export const ADMIN_EMOTION_OPTIONS: AdminEmotionKey[] = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'];

export const ADMIN_CATEGORY_PRESETS: Record<AdminEmotionKey, string[]> = {
  vibrance: ['연예·미담', '문화·콘텐츠', '축제·행사', '스포츠 하이라이트'],
  immersion: ['정치·속보', '공적 논쟁', '사회 갈등', '정책 충돌'],
  clarity: ['경제·분석', '산업·기술', '정책 해설', '데이터 리포트'],
  gravity: ['사건·재난', '범죄·수사', '사회 안전', '리스크 분석'],
  serenity: ['웰빙·커뮤니티', '환경·기후', '건강·생활', '회복·돌봄'],
  spectrum: ['균형·다양성', '정책·산업·사회', '균형 브리핑'],
};

const ADMIN_CATEGORY_PRESET_KEYWORDS: Record<AdminEmotionKey, Array<{ preset: string; keywords: string[] }>> = {
  vibrance: [
    { preset: '연예·미담', keywords: ['연예', '아이돌', '드라마', '영화', '배우', '가수', '미담', '선행', 'kpop', 'k-pop', 'celebrity'] },
    { preset: '문화·콘텐츠', keywords: ['문화', '콘텐츠', '전시', '공연', '예술', '애니', '웹툰'] },
    { preset: '축제·행사', keywords: ['축제', '행사', '이벤트', '페스티벌', '박람회'] },
    { preset: '스포츠 하이라이트', keywords: ['스포츠', '축구', '야구', '농구', '배구', '올림픽'] },
  ],
  immersion: [
    { preset: '정치·속보', keywords: ['정치', '속보', '국회', '정부', '선거', '외교'] },
    { preset: '공적 논쟁', keywords: ['논쟁', '공방', '여론', '시위', '토론'] },
    { preset: '사회 갈등', keywords: ['사회', '갈등', '충돌', '분쟁', '노사'] },
    { preset: '정책 충돌', keywords: ['정책', '규제', '개혁', '법안'] },
  ],
  clarity: [
    { preset: '경제·분석', keywords: ['경제', '금융', '증시', '시장', '부동산', '분석'] },
    { preset: '산업·기술', keywords: ['산업', '기술', 'it', 'ai', '과학', '반도체', '스타트업'] },
    { preset: '정책 해설', keywords: ['정책', '해설', '브리핑', '행정'] },
    { preset: '데이터 리포트', keywords: ['데이터', '리포트', '통계', '지표', '보고서'] },
  ],
  gravity: [
    { preset: '사건·재난', keywords: ['사건', '재난', '사고'] },
    { preset: '범죄·수사', keywords: ['범죄', '수사', '경찰', '검찰', '법원'] },
    { preset: '사회 안전', keywords: ['안전', '보안', '산업안전', '의료', '보건'] },
    { preset: '리스크 분석', keywords: ['위기', '리스크', '경고', '위험', '안보'] },
  ],
  serenity: [
    { preset: '웰빙·커뮤니티', keywords: ['웰빙', '커뮤니티', '휴식', '명상', '동네'] },
    { preset: '환경·기후', keywords: ['환경', '기후', '생태'] },
    { preset: '건강·생활', keywords: ['건강', '생활', '라이프', '여행', '푸드'] },
    { preset: '회복·돌봄', keywords: ['회복', '돌봄', '치유', '상담', '수면'] },
  ],
  spectrum: [
    { preset: '균형·다양성', keywords: ['균형', '다양성', '중립', '모아보기'] },
    { preset: '정책·산업·사회', keywords: ['정책', '산업', '사회', '교육', '기술', '환경'] },
    { preset: '균형 브리핑', keywords: ['브리핑', '종합', '비교', '해설'] },
  ],
};

export function normalizeAdminEmotion(value: string | undefined): AdminEmotionKey {
  const key = String(value || '').trim().toLowerCase();
  return ADMIN_EMOTION_OPTIONS.includes(key as AdminEmotionKey) ? (key as AdminEmotionKey) : 'spectrum';
}

export function getCategoryPresetForEmotion(emotion: string | undefined): string[] {
  return ADMIN_CATEGORY_PRESETS[normalizeAdminEmotion(emotion)];
}

export function mapAdminCategoryToPreset(emotion: string | undefined, category: string | undefined): string {
  const emotionKey = normalizeAdminEmotion(emotion);
  const raw = String(category || '').trim().toLowerCase();
  const presets = ADMIN_CATEGORY_PRESET_KEYWORDS[emotionKey] || [];
  if (raw) {
    for (const row of presets) {
      if (row.keywords.some((keyword) => raw.includes(String(keyword).toLowerCase()))) {
        return row.preset;
      }
    }
  }
  return getCategoryPresetForEmotion(emotionKey)[0] || '분야 미지정';
}

export function isAiGeneratedCategory(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('ai generated') ||
    normalized.includes('ai-generated') ||
    normalized.includes('ai 생성')
  );
}

export function getCategoryFieldLabel(emotion: string | undefined, category: string | undefined): string {
  const preset = mapAdminCategoryToPreset(emotion, category);
  if (preset) return preset;
  const label = String(category || '').trim();
  if (label && !isAiGeneratedCategory(label)) return label;
  return '분야 미지정';
}
