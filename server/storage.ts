
import { type User, type InsertUser, type NewsItem, type InsertNewsItem, emotionTypes, type EmotionType, type Report, type ArticleReview, type InsertUserConsent, type UserConsent, type AdminActionLog, type InsertUserInsight, type UserInsight, type InsertUserComposedArticle, type UserComposedArticle } from "../shared/schema.js";
import { randomUUID } from "crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeUuidOrNull = (value: unknown): string | null => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return UUID_REGEX.test(normalized) ? normalized : null;
};

const canonicalizeNewsSource = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return raw;

  try {
    const parsed = new URL(raw);
    parsed.hash = "";

    if (parsed.hostname === "news.google.com" && parsed.pathname.includes("/rss/articles/")) {
      parsed.pathname = parsed.pathname.replace("/rss/articles/", "/articles/");
    }

    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "ved",
      "usg",
      "oc",
      "hl",
      "gl",
      "ceid",
    ].forEach((key) => parsed.searchParams.delete(key));

    return parsed.toString();
  } catch {
    return raw;
  }
};

const normalizeEmotion = (value: unknown, fallback: EmotionType = "spectrum"): EmotionType => {
  const normalized = String(value || "").trim().toLowerCase();
  return emotionTypes.includes(normalized as EmotionType) ? (normalized as EmotionType) : fallback;
};

const getNewsRowTimestamp = (row: any): number => {
  const raw = row?.updatedAt ?? row?.updated_at ?? row?.createdAt ?? row?.created_at ?? 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getNewsRowScore = (row: any): number => {
  let score = 0;
  if (isPublishedVisible(row)) score += 8;
  if (String(row?.image || "").trim()) score += 4;
  if (String(row?.summary || "").trim()) score += 2;
  score += Math.min(String(row?.content || "").trim().length, 4000) / 1000;
  score += Math.min(String(row?.title || "").trim().length, 300) / 100;
  score += getNewsRowTimestamp(row) / 1_000_000_000_000;
  return score;
};

const pickPreferredNewsRow = (left: NewsItem, right: NewsItem): NewsItem => {
  return getNewsRowScore(right) >= getNewsRowScore(left) ? right : left;
};

const collapseDuplicateNewsRows = (rows: NewsItem[]): NewsItem[] => {
  const bySource = new Map<string, NewsItem>();
  const withoutSourceKey: NewsItem[] = [];

  for (const row of rows) {
    const sourceKey = canonicalizeNewsSource((row as any)?.source);
    if (!sourceKey || !/^https?:\/\//i.test(sourceKey)) {
      withoutSourceKey.push(row);
      continue;
    }

    const existing = bySource.get(sourceKey);
    bySource.set(sourceKey, existing ? pickPreferredNewsRow(existing, row) : row);
  }

  return withoutSourceKey.concat(Array.from(bySource.values()));
};

const isPublishedVisible = (row: any): boolean => {
  if (typeof row?.isPublished === "boolean") return row.isPublished;
  if (typeof row?.is_published === "boolean") return row.is_published;
  return true;
};

export interface AdminStats {
  totalViews: number;
  totalSaves: number;
  activeUsers: number;
  articlesPublished: number;
  publishedCount: number;
  hiddenCount: number;
  issueCount: number;
  reviewCompletedCount: number;
  reviewPendingCount: number;
  reviewSlaTargetHours: number;
  reviewSlaMetCount: number;
  reviewSlaMetRate: number;
}

export interface AdminArticleListQuery {
  page: number;
  pageSize: number;
  includeHidden?: boolean;
  emotion?: string | null;
  category?: string | null;
  search?: string | null;
}

export interface AdminArticleListResult {
  items: NewsItem[];
  total: number;
  page: number;
  pageSize: number;
  availableCategories?: string[];
}

export interface AdminReviewUpdateInput {
  completed?: boolean;
  memo?: string;
  issues?: string[];
}

export interface AdminActionLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId: string;
  detail?: string | null;
}

export interface ReaderArticleDecisionInput {
  submissionStatus: "pending" | "approved" | "rejected";
  moderationMemo?: string | null;
  reviewedBy?: string | null;
}

export type ReportWorkflowStatus = "reported" | "in_review" | "resolved" | "rejected";
export type ReportSanctionType = "none" | "hide_article" | "delete_article" | "warn_author";

export interface ReportStatusUpdateInput {
  status: ReportWorkflowStatus;
  resolution?: string | null;
  sanctionType?: ReportSanctionType | null;
  reviewedBy?: string | null;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getNewsItemById(id: string): Promise<NewsItem | null>;
  getNewsByEmotion(emotion: EmotionType): Promise<NewsItem[]>;
  getAllNews(includeHidden?: boolean): Promise<NewsItem[]>;
  getAdminArticlesPage(input: AdminArticleListQuery): Promise<AdminArticleListResult>;
  createNewsItem(item: InsertNewsItem): Promise<NewsItem>;
  updateNewsItem(id: string, updates: Partial<NewsItem>): Promise<NewsItem | null>;
  deleteNewsItem(id: string): Promise<boolean>;

  // Admin & Interaction Methods
  incrementView(id: string): Promise<void>;
  toggleSave(id: string, userId: string): Promise<boolean>; // Returns true if saved, false if unsaved
  createReport(articleId: string, reason: string): Promise<Report>;
  getReports(): Promise<Report[]>;
  updateReportStatus(reportId: string, input: ReportStatusUpdateInput): Promise<Report | null>;
  getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }>;
  getAdminReviews(): Promise<ArticleReview[]>;
  upsertAdminReview(articleId: string, updates: AdminReviewUpdateInput): Promise<ArticleReview>;
  addAdminReviewIssue(articleId: string, issue: string): Promise<ArticleReview>;
  createAdminActionLog(input: AdminActionLogInput): Promise<AdminActionLog>;
  getAdminActionLogs(limit?: number): Promise<AdminActionLog[]>;
  saveUserConsent(input: InsertUserConsent): Promise<UserConsent>;
  getUserInsights(userId: string): Promise<UserInsight[]>;
  createUserInsight(input: InsertUserInsight): Promise<UserInsight>;
  deleteUserInsight(userId: string, insightId: string): Promise<boolean>;
  getUserComposedArticles(userId: string): Promise<UserComposedArticle[]>;
  createUserComposedArticle(input: InsertUserComposedArticle): Promise<UserComposedArticle>;
  deleteUserComposedArticle(userId: string, articleId: string): Promise<boolean>;
  updateUserComposedArticle(userId: string, articleId: string, updates: Partial<InsertUserComposedArticle>): Promise<UserComposedArticle | null>;
  resubmitUserComposedArticle(userId: string, articleId: string): Promise<UserComposedArticle | null>;
  getReaderComposedArticles(status?: "pending" | "approved" | "rejected"): Promise<UserComposedArticle[]>;
  updateReaderComposedArticleDecision(articleId: string, input: ReaderArticleDecisionInput): Promise<UserComposedArticle | null>;
  deleteReaderComposedArticle(articleId: string): Promise<boolean>;
}

const REVIEW_SLA_TARGET_HOURS = 24;
const NEWS_LIST_CACHE_TTL_MS = 15_000;
const ADMIN_STATS_CACHE_TTL_MS = 30_000;

type DemoNewsSeedInput = {
  id: string;
  title: string;
  summary: string;
  content: string;
  source: string;
  image: string;
  category: string;
  emotion: EmotionType;
  intensity: number;
};

const DEMO_NEWS_SEED_DATA: DemoNewsSeedInput[] = [
  { id: "demo-vibrance-1", title: "서울 야간 러닝 축제가 한강 일대를 활기찬 축제장으로 바꿨다", summary: "도심 속 야간 러닝과 음악 공연이 결합된 축제가 젊은 참가자들을 끌어모았다.", content: "서울 한강공원에서 열린 야간 러닝 축제는 운동과 공연, 푸드트럭을 한 번에 즐길 수 있는 행사로 주목받았다. 참가자들은 기록 경쟁보다 함께 달리는 분위기와 현장 에너지를 더 크게 이야기했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200", category: "축제·라이프", emotion: "vibrance", intensity: 86 },
  { id: "demo-vibrance-2", title: "부산 청년 예술가 마켓에 주말 관람객이 몰리며 지역 상권도 웃었다", summary: "핸드메이드 작품과 버스킹이 어우러진 야외 마켓이 지역 문화 소비를 키웠다.", content: "부산 전포 일대에서 열린 청년 예술가 마켓은 굿즈 판매를 넘어 관람객이 오래 머무는 체험형 공간으로 운영됐다. 상인들은 문화 행사와 로컬 소비가 자연스럽게 연결됐다고 평가했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200", category: "문화·전시", emotion: "vibrance", intensity: 82 },
  { id: "demo-vibrance-3", title: "고교 밴드 경연 우승팀의 자작곡이 온라인에서 빠르게 확산됐다", summary: "학교 축제 무대에서 공개한 곡이 세대를 넘어 공감을 얻으며 화제가 됐다.", content: "고교 밴드 경연에서 우승한 팀의 자작곡은 공연 직후 SNS에서 빠르게 공유됐다. 심사위원들은 완성도보다 관객을 움직인 진정성과 자신감이 더 큰 힘을 가졌다고 평가했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200", category: "연예·공연", emotion: "vibrance", intensity: 84 },
  { id: "demo-vibrance-4", title: "프로야구 복귀전에서 끝내기 안타가 터지며 홈구장이 들썩였다", summary: "후반기 첫 홈경기에서 나온 끝내기 승리가 팬들의 기대감을 끌어올렸다.", content: "프로야구 복귀전에서 나온 끝내기 안타는 경기장을 가득 채운 관중의 열기를 한층 키웠다. 구단은 단순한 승리보다 다시 야구장에 모인 팬들의 반응을 시즌 반등 신호로 해석했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=1200", category: "스포츠", emotion: "vibrance", intensity: 88 },
  { id: "demo-vibrance-5", title: "신작 애니메이션 공개 하루 만에 팬아트와 해석 글이 쏟아졌다", summary: "첫 공개만으로도 커뮤니티 참여가 폭발하며 기대작 분위기를 만들었다.", content: "신작 애니메이션의 티저 공개 직후 주요 커뮤니티에는 팬아트와 설정 해석이 빠르게 올라왔다. 제작사는 작품 자체의 완성도와 별개로 팬들의 자발적 참여가 콘텐츠 초반 확산에 큰 역할을 했다고 봤다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=1200", category: "콘텐츠", emotion: "vibrance", intensity: 80 },
  { id: "demo-immersion-1", title: "총선을 앞두고 공천 잡음이 커지며 정당 내부 긴장감이 높아졌다", summary: "계파 갈등과 전략 공천 논란이 겹치며 정치권이 강하게 출렁이고 있다.", content: "공천을 둘러싼 내부 갈등은 단순한 인사 문제가 아니라 당의 노선과 권력 재편 문제로 번지고 있다. 여야 모두 승리 전략을 말하지만 현장에서는 책임 공방과 불신이 동시에 커지는 분위기다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200", category: "시사", emotion: "immersion", intensity: 91 },
  { id: "demo-immersion-2", title: "대형 개발 사업 설명회가 주민 반발 속에 조기 종료됐다", summary: "보상 기준과 교통 대책을 둘러싼 갈등이 현장에서 한꺼번에 폭발했다.", content: "개발 계획 설명회는 미래 가치보다 지금의 생활권이 무너질 수 있다는 주민들의 불안이 더 크게 표출된 자리였다. 시행사와 지자체는 일정 지연 비용을 우려했지만 주민들은 정보 공개 방식 자체를 문제 삼았다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200", category: "사회", emotion: "immersion", intensity: 87 },
  { id: "demo-immersion-3", title: "국제 정상회담을 앞두고 외교 메시지 수위가 눈에 띄게 올라갔다", summary: "공개 발언마다 압박과 견제가 섞이며 외교전 긴장감이 짙어지고 있다.", content: "회담 전 공개되는 각국의 발언은 협상 카드이자 국내 지지층을 겨냥한 신호로 해석된다. 문제는 발언 경쟁이 실제 협상 공간을 좁히고 결과 예측 가능성을 낮춘다는 점이다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200", category: "국제", emotion: "immersion", intensity: 85 },
  { id: "demo-immersion-4", title: "원자재 가격 급등 우려가 제조업 현장 전반으로 번지고 있다", summary: "납기 지연과 추가 비용 가능성이 겹치며 업계가 잔뜩 긴장하고 있다.", content: "제조업 현장에서는 원자재 가격 상승이 단순한 비용 증가가 아니라 생산 차질로 이어질 수 있다는 우려가 커지고 있다. 중소 협력사들은 버틸 여력이 크지 않아 더 빠르게 체감한다고 말한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1496247749665-49cf5b1022e9?w=1200", category: "산업", emotion: "immersion", intensity: 89 },
  { id: "demo-immersion-5", title: "플랫폼 규제 논의를 두고 업계와 이용자 간 균열이 커지고 있다", summary: "혁신 보호와 책임 강화 사이에서 논쟁이 격화되는 모습이다.", content: "플랫폼 규제를 둘러싼 갈등은 산업 성장과 공정성 문제를 동시에 건드린다. 이용자 보호를 강화해야 한다는 주장과 시장 위축을 우려하는 목소리가 정면으로 맞서며 타협점을 찾기 어려운 상황이 이어지고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200", category: "IT·정책", emotion: "immersion", intensity: 84 },
  { id: "demo-clarity-1", title: "반도체 장비 수주 흐름이 하반기 업황의 방향을 가르는 지표로 떠올랐다", summary: "발주 시점과 규모가 겹치며 산업 회복 속도를 읽을 단서가 되고 있다.", content: "반도체 장비 발주는 단순한 공급 계약이 아니라 기업들이 미래 수요를 얼마나 자신 있게 보는지 보여주는 신호다. 시장은 숫자보다 발주가 어느 공정에 집중되는지에 더 주목하고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200", category: "경제", emotion: "clarity", intensity: 77 },
  { id: "demo-clarity-2", title: "전세 시장 변화가 무주택자의 선택지를 다시 좁히고 있다", summary: "매물 감소와 금리 변수로 실수요자의 계산이 더 복잡해졌다.", content: "전세 시장의 변화는 단순한 가격 문제를 넘어 거주 계획 전체를 흔든다. 전문가들은 숫자보다 계약 가능 물량과 지역별 편차를 함께 봐야 실제 판단에 도움이 된다고 설명한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200", category: "부동산", emotion: "clarity", intensity: 73 },
  { id: "demo-clarity-3", title: "기업의 AI 도입 성패는 기술보다 업무 설계에 달렸다는 분석이 나왔다", summary: "도구를 넣는 것보다 어떤 과정을 바꿀지 정하는 일이 더 중요하다는 뜻이다.", content: "AI 도입은 모델 성능만으로 완성되지 않는다. 반복 업무를 어디까지 자동화하고 사람이 어떤 판단을 맡을지 설계하지 않으면 기대한 생산성 향상도 오래가지 못한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200", category: "기술·과학", emotion: "clarity", intensity: 79 },
  { id: "demo-clarity-4", title: "고령화가 지역 의료 체계 재편을 앞당긴다는 진단이 이어지고 있다", summary: "환자 이동과 진료 공백 문제가 동시에 커지며 구조 개편 필요성이 부각됐다.", content: "고령화는 단순한 인구 변화가 아니라 의료 수요의 방향 자체를 바꾸고 있다. 병상 숫자보다 의료 인력이 실제 수요 지역과 얼마나 맞물리는지를 따져야 한다는 지적이 많다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200", category: "헬스", emotion: "clarity", intensity: 74 },
  { id: "demo-clarity-5", title: "구독 경제의 다음 경쟁력은 가격보다 관리 경험이라는 평가가 나온다", summary: "해지 방지보다 이용자가 왜 남는지 설명하는 서비스가 살아남는다는 뜻이다.", content: "구독 서비스 시장은 양적 확장 이후 유지율 경쟁으로 빠르게 이동하고 있다. 기업들은 이용자가 비용보다 경험의 단순함과 만족도를 기준으로 서비스를 재평가한다고 분석한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?w=1200", category: "비즈니스", emotion: "clarity", intensity: 72 },
  { id: "demo-gravity-1", title: "집중호우 취약 지역에서 반복된 침수 징후가 다시 확인됐다", summary: "배수 체계와 안내 체계 미비가 겹치며 사전 대응의 한계가 드러났다.", content: "집중호우 위험은 늘 예고되지만 취약 지역의 구조적 문제는 쉽게 바뀌지 않는다. 전문가들은 단순 복구보다 실제 생활권 기준의 예방 투자와 훈련이 더 시급하다고 말한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1200", category: "재난·안전", emotion: "gravity", intensity: 90 },
  { id: "demo-gravity-2", title: "대규모 개인정보 유출 의심 정황에 보안 경계가 높아지고 있다", summary: "초기 대응의 속도와 투명성이 기업 책임의 핵심으로 떠올랐다.", content: "개인정보 유출은 기술 사고이면서 동시에 신뢰 위기다. 피해 규모만이 아니라 어떤 정보를 언제 공개하고 어떻게 복구할지에 따라 이용자 불안은 크게 달라질 수 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200", category: "보안", emotion: "gravity", intensity: 88 },
  { id: "demo-gravity-3", title: "고위험 산업 현장의 안전 규정 미준수 사례가 잇따라 드러났다", summary: "현장 효율이 규정보다 앞서는 문화가 사고 위험을 키운다는 지적이다.", content: "산업 현장의 안전 문제는 규정 부족보다 실행 문화의 문제로 자주 이어진다. 반복되는 위반 사례는 설비보다 관리 책임과 감독 체계의 허점을 먼저 돌아보게 만든다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200", category: "산업안전", emotion: "gravity", intensity: 86 },
  { id: "demo-gravity-4", title: "취약차주 연체 증가 경고가 켜지며 금융권 긴장감이 커지고 있다", summary: "생활비와 이자 부담이 겹치며 상환 여력이 빠르게 약해지고 있다.", content: "연체율 증가는 숫자보다 취약계층의 버팀목이 사라지고 있다는 신호에 가깝다. 금융권은 단기 대응보다 채무 조정과 상환 지원 장치를 더 촘촘히 준비해야 한다는 압박을 받고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200", category: "금융", emotion: "gravity", intensity: 85 },
  { id: "demo-gravity-5", title: "응급의료 공백 우려가 커지며 지역 불안이 다시 번지고 있다", summary: "야간과 휴일 진료 체계의 빈틈이 현장 불안을 키우고 있다는 분석이다.", content: "응급의료 공백은 평소에는 보이지 않다가 위기 순간 크게 드러난다. 병상과 인력, 이송 체계가 동시에 맞물리지 않으면 지역 주민의 체감 불안은 더 빠르게 높아질 수 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200", category: "의료", emotion: "gravity", intensity: 87 },
  { id: "demo-serenity-1", title: "동네 도서관의 저녁 명상 프로그램이 조용한 호응을 얻고 있다", summary: "짧은 호흡 훈련과 독서 시간이 결합된 프로그램이 꾸준한 참여를 이끌었다.", content: "도서관 명상 프로그램은 거창한 치유보다 하루 리듬을 천천히 되찾는 데 초점을 맞췄다. 참가자들은 짧은 시간만으로도 머리가 맑아지고 저녁 시간을 차분하게 마무리할 수 있었다고 말했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200", category: "웰빙", emotion: "serenity", intensity: 58 },
  { id: "demo-serenity-2", title: "점심 산책 챌린지가 직장인의 휴식 루틴으로 자리 잡고 있다", summary: "짧은 이동과 햇빛 노출만으로도 스트레스가 누그러진다는 반응이 많다.", content: "점심 산책 챌린지는 운동량 경쟁보다 잠시 바깥을 걷는 습관을 만드는 데 초점이 있다. 직장인들은 복잡한 계획 없이도 기분 전환이 가능하다는 점에서 만족도가 높다고 평가했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200", category: "라이프", emotion: "serenity", intensity: 55 },
  { id: "demo-serenity-3", title: "지역 보건소의 수면 상담 예약이 늘며 생활 조정 수요가 커지고 있다", summary: "수면제를 찾기보다 생활 패턴을 다시 맞추려는 상담이 많아졌다.", content: "수면 상담은 증상을 즉시 없애기보다 생활 리듬을 조정하는 방식으로 진행된다. 전문가들은 작은 습관 변화가 누적될 때 회복감이 생긴다고 설명한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1200", category: "건강", emotion: "serenity", intensity: 57 },
  { id: "demo-serenity-4", title: "동네 식물 모임이 세대 간 대화의 작은 연결고리가 되고 있다", summary: "화분을 함께 돌보는 활동이 정서 안정과 공동체 감각을 동시에 만들었다.", content: "식물 모임은 취미 활동에 머무르지 않고 자연스럽게 서로의 일상을 나누는 공간으로 자리 잡고 있다. 참가자들은 부담 없는 만남이 오히려 오래가는 안정감을 만든다고 말했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=1200", category: "커뮤니티", emotion: "serenity", intensity: 54 },
  { id: "demo-serenity-5", title: "주말 근교 숲길 여행 상품이 쉼 중심 일정으로 다시 주목받고 있다", summary: "많이 보는 관광보다 천천히 머무는 휴식 방식이 더 선호되고 있다.", content: "숲길 여행 상품은 이동 동선을 줄이고 체류 시간을 늘리는 방식으로 구성되고 있다. 여행업계는 성수기에도 조용한 휴식을 원하는 수요가 늘었다고 전했다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200", category: "여행", emotion: "serenity", intensity: 60 },
  { id: "demo-spectrum-1", title: "청년 주거 해법을 두고 속도보다 우선순위 차이가 더 선명해지고 있다", summary: "지원 확대와 시장 구조 개편 사이에서 해법의 방향이 갈리고 있다.", content: "청년 주거 문제는 정답이 하나라기보다 어떤 정책을 먼저 시행할지의 문제에 가깝다. 단기 지원을 늘려야 한다는 주장과 공급 구조를 손봐야 한다는 의견이 동시에 힘을 얻고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200", category: "정책·사회", emotion: "spectrum", intensity: 67 },
  { id: "demo-spectrum-2", title: "생성형 AI의 교실 도입을 두고 기대와 우려가 나란히 커지고 있다", summary: "수업 효율 개선 기대와 학습 공정성 걱정이 동시에 제기되는 상황이다.", content: "생성형 AI를 교육에 활용하는 문제는 기술 도입 여부보다 어떤 원칙 아래 운영할지가 핵심이라는 지적이 많다. 교사와 학부모 모두 편의성과 위험성을 함께 보고 있어 균형 있는 기준 마련이 중요해졌다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200", category: "교육·기술", emotion: "spectrum", intensity: 69 },
  { id: "demo-spectrum-3", title: "친환경 전환 비용을 누가 더 부담할지에 대한 논쟁이 다시 커지고 있다", summary: "기업과 소비자, 정부의 역할 배분을 두고 시선 차이가 뚜렷하다.", content: "친환경 전환은 필요하다는 공감대가 넓지만 비용과 속도를 둘러싼 이해관계는 여전히 엇갈린다. 전문가들은 한쪽에 부담을 몰아주는 방식보다 단계별 전환 설계를 강조하고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1200", category: "환경", emotion: "spectrum", intensity: 65 },
  { id: "demo-spectrum-4", title: "재택근무 확산 이후 조직문화 평가가 더 복잡해졌다는 진단이 나온다", summary: "생산성과 소속감 사이에서 기업마다 다른 해법을 찾고 있는 모습이다.", content: "재택근무는 일하는 방식을 유연하게 만들었지만 팀 결속과 협업 방식에 대한 질문도 남겼다. 기업들은 효율성과 관계 형성 사이의 균형점을 각자 다른 방식으로 실험하고 있다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200", category: "직장문화", emotion: "spectrum", intensity: 64 },
  { id: "demo-spectrum-5", title: "기후 대응 투자 속도를 두고 산업계와 시민사회의 시각이 엇갈리고 있다", summary: "전환 비용과 미래 리스크를 바라보는 관점 차이가 분명하게 드러난다.", content: "기후 대응 투자는 장기적으로 필요하다는 데 큰 이견이 없지만, 얼마나 빠르게 비용을 투입할지에 대해서는 입장 차가 크다. 전문가들은 갈등을 줄이려면 목표와 부담 구조를 함께 설명해야 한다고 지적한다.", source: "HueBrief Demo Desk", image: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1200", category: "환경·산업", emotion: "spectrum", intensity: 68 },
];

const buildDemoNewsSeedItems = (): NewsItem[] =>
  DEMO_NEWS_SEED_DATA.map((item, index) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: item.content,
    source: item.source,
    image: item.image,
    category: item.category,
    emotion: item.emotion,
    intensity: item.intensity,
    views: 180 + index * 23,
    saves: 12 + (index % 5) * 4,
    platforms: ["interactive"],
    isPublished: true,
    authorId: null,
    authorName: "HueBrief Demo Seed",
    createdAt: new Date(Date.now() - index * 1000 * 60 * 90),
  })) as NewsItem[];

const NEWS_LIST_SELECT =
  "id,title,summary,content,source,image,category,emotion,intensity,views,saves,platforms,is_published,author_id,author_name,created_at";
const ADMIN_STATS_NEWS_SELECT =
  "id,title,emotion,views,saves,is_published,created_at";
const ADMIN_STATS_REVIEW_SELECT =
  "id,article_id,completed,issues,memo,created_at,updated_at";

function toEpochMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function computeAdminStatsPayload(news: any[], reviews: ArticleReview[], activeUsers: number): AdminStats {
  const totalViews = news.reduce((acc: number, item: any) => acc + Number(item?.views || 0), 0);
  const totalSaves = news.reduce((acc: number, item: any) => acc + Number(item?.saves || 0), 0);
  const publishedCount = news.filter((item: any) => isPublishedVisible(item)).length;
  const hiddenCount = Math.max(0, news.length - publishedCount);

  const reviewByArticleId = new Map<string, ArticleReview>();
  for (const review of reviews || []) {
    if (!review?.articleId) continue;
    reviewByArticleId.set(String(review.articleId), review);
  }

  let issueCount = 0;
  let reviewCompletedCount = 0;
  let reviewSlaMetCount = 0;

  for (const item of news) {
    const articleId = String(item?.id || "");
    if (!articleId) continue;

    const review = reviewByArticleId.get(articleId);
    issueCount += review?.issues?.length || 0;

    if (!review?.completed) continue;
    reviewCompletedCount += 1;

    const createdAtMs = toEpochMs(item?.createdAt ?? item?.created_at);
    const reviewedAtMs = toEpochMs(review.updatedAt);
    if (createdAtMs === null || reviewedAtMs === null) continue;

    const elapsedHours = (reviewedAtMs - createdAtMs) / (1000 * 60 * 60);
    if (elapsedHours <= REVIEW_SLA_TARGET_HOURS) {
      reviewSlaMetCount += 1;
    }
  }

  const reviewPendingCount = Math.max(0, news.length - reviewCompletedCount);
  const reviewSlaMetRate = reviewCompletedCount > 0
    ? Math.round((reviewSlaMetCount / reviewCompletedCount) * 100)
    : 100;

  return {
    totalViews,
    totalSaves,
    activeUsers,
    articlesPublished: publishedCount,
    publishedCount,
    hiddenCount,
    issueCount,
    reviewCompletedCount,
    reviewPendingCount,
    reviewSlaTargetHours: REVIEW_SLA_TARGET_HOURS,
    reviewSlaMetCount,
    reviewSlaMetRate,
  };
}

function normalizeAdminActionLog(input: AdminActionLogInput, now: Date = new Date()): AdminActionLog {
  return {
    id: randomUUID(),
    actorId: input.actorId ?? null,
    actorRole: input.actorRole || "admin",
    action: String(input.action || "unknown"),
    targetType: input.targetType || "article",
    targetId: String(input.targetId || ""),
    detail: input.detail ?? null,
    createdAt: now,
  } as AdminActionLog;
}

function mapReportRow(row: any): Report {
  return {
    id: row?.id,
    articleId: row?.article_id ?? row?.articleId,
    reason: row?.reason,
    details: row?.details ?? null,
    riskScore: Number(row?.risk_score ?? row?.riskScore ?? 0),
    status: String(row?.status ?? "reported"),
    sanctionType: String(row?.sanction_type ?? row?.sanctionType ?? "none"),
    resolution: row?.resolution ?? null,
    reviewedBy: row?.reviewed_by ?? row?.reviewedBy ?? null,
    reviewedAt: row?.reviewed_at ?? row?.reviewedAt ?? null,
    createdAt: row?.created_at ?? row?.createdAt ?? new Date(),
  } as Report;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private newsItems: Map<string, NewsItem>;
  private reports: Map<string, Report>;
  private saves: Map<string, Set<string>>; // articleId -> Set<userId>
  private articleReviews: Map<string, ArticleReview>;
  private adminActionLogs: Map<string, AdminActionLog>;
  private userConsents: Map<string, UserConsent>;
  private userInsights: Map<string, UserInsight>;
  private userComposedArticles: Map<string, UserComposedArticle>;

  constructor() {
    this.users = new Map();
    this.newsItems = new Map();
    this.reports = new Map();
    this.saves = new Map();
    this.articleReviews = new Map();
    this.adminActionLogs = new Map();
    this.userConsents = new Map();
    this.userInsights = new Map();
    this.userComposedArticles = new Map();
    this.seedNews();
  }

  private seedNews() {
    buildDemoNewsSeedItems().forEach((item) => {
      this.newsItems.set(item.id, item);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.googleId === googleId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      password: insertUser.password || null, // Ensure password is null if undefined
      googleId: insertUser.googleId || null
    };
    this.users.set(id, user);
    return user;
  }

  async getNewsByEmotion(emotion: EmotionType): Promise<NewsItem[]> {
    return Array.from(this.newsItems.values())
      .filter(item => item.emotion === emotion && isPublishedVisible(item))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getNewsItemById(id: string): Promise<NewsItem | null> {
    const item = this.newsItems.get(id);
    return item || null;
  }

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    return Array.from(this.newsItems.values())
      .filter(item => includeHidden || isPublishedVisible(item))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getAdminArticlesPage(input: AdminArticleListQuery): Promise<AdminArticleListResult> {
    const safePage = Math.max(1, Number(input.page || 1));
    const safePageSize = Math.max(1, Math.min(Number(input.pageSize || 10), 100));
    const safeEmotion = String(input.emotion || "").trim().toLowerCase();
    const safeCategory = String(input.category || "").trim().toLowerCase();
    const safeSearch = String(input.search || "").trim().toLowerCase();
    const includeHidden = input.includeHidden !== false;

    const pooled = Array.from(this.newsItems.values())
      .filter((item) => includeHidden || isPublishedVisible(item))
      .filter((item) => !safeEmotion || String(item.emotion || "").trim().toLowerCase() === safeEmotion)
      .filter((item) => {
        if (!safeSearch) return true;
        const haystack = [item.title, item.summary, item.source, item.id, item.category].join(" ").toLowerCase();
        return haystack.includes(safeSearch);
      });

    const availableCategories = Array.from(
      new Set(
        pooled
          .map((item) => String(item.category || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "ko"));

    const filtered = pooled
      .filter((item) => !safeCategory || String(item.category || "").trim().toLowerCase() === safeCategory)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    const start = (safePage - 1) * safePageSize;
    return {
      items: filtered.slice(start, start + safePageSize),
      total: filtered.length,
      page: safePage,
      pageSize: safePageSize,
      availableCategories,
    };
  }

  async createNewsItem(item: InsertNewsItem): Promise<NewsItem> {
    const id = randomUUID();
    const newsItem: NewsItem = {
      id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      emotion: item.emotion as EmotionType,
      intensity: item.intensity ?? 50,
      content: item.content || "",
      image: item.image || "",
      category: item.category || "General",
      views: 0,
      saves: 0,
      platforms: ['interactive'],
      isPublished: true,
      authorId: item.authorId ?? null,
      authorName: item.authorName ?? null,
      createdAt: new Date(),
    };
    this.newsItems.set(id, newsItem);
    return newsItem;
  }

  async updateNewsItem(id: string, updates: Partial<NewsItem>): Promise<NewsItem | null> {
    const item = this.newsItems.get(id);
    if (!item) return null;
    const updated = { ...item, ...updates };
    this.newsItems.set(id, updated);
    return updated;
  }

  async deleteNewsItem(id: string): Promise<boolean> {
    return this.newsItems.delete(id);
  }

  // Admin Methods
  async incrementView(id: string): Promise<void> {
    const item = this.newsItems.get(id);
    if (item) {
      item.views = (item.views || 0) + 1;
      this.newsItems.set(id, item);
    }
  }

  async toggleSave(id: string, userId: string): Promise<boolean> {
    // Mock logic: just increment saves count on item for demo
    const item = this.newsItems.get(id);
    if (item) {
      item.saves = (item.saves || 0) + 1;
      this.newsItems.set(id, item);
      return true;
    }
    return false;
  }

  async createReport(articleId: string, reason: string): Promise<Report> {
    const id = randomUUID();
    const report: Report = {
      id, articleId, reason,
      riskScore: Math.floor(Math.random() * 100), // Mock risk score
      details: "Reported by user",
      status: "reported",
      sanctionType: "none",
      resolution: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date()
    };
    this.reports.set(id, report);
    return report;
  }

  async getReports(): Promise<Report[]> {
    return Array.from(this.reports.values()).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async updateReportStatus(reportId: string, input: ReportStatusUpdateInput): Promise<Report | null> {
    const current = this.reports.get(reportId);
    if (!current) return null;
    const next: Report = {
      ...current,
      status: input.status,
      sanctionType: input.sanctionType ?? current.sanctionType ?? "none",
      resolution: input.resolution ?? current.resolution ?? null,
      reviewedBy: input.reviewedBy ?? current.reviewedBy ?? null,
      reviewedAt: new Date(),
    } as Report;
    this.reports.set(reportId, next);
    return next;
  }

  async getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }> {
    const allNews = Array.from(this.newsItems.values());
    const allUsers = Array.from(this.users.values());
    const reviews = Array.from(this.articleReviews.values());
    const stats = computeAdminStatsPayload(allNews, reviews, allUsers.length + 3240);

    // Emotion Stats
    const emCounts: Record<string, number> = {};
    allNews.forEach(item => {
      emCounts[item.emotion] = (emCounts[item.emotion] || 0) + 1;
    });

    const emotionStats = Object.keys(emCounts).map(emotion => ({
      emotion,
      count: emCounts[emotion],
      percentage: Math.round((emCounts[emotion] / allNews.length) * 100)
    }));

    // Top Articles
    const topArticles = [...allNews]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 3);

    return { stats, emotionStats, topArticles };
  }

  async getAdminReviews(): Promise<ArticleReview[]> {
    return Array.from(this.articleReviews.values())
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }

  async upsertAdminReview(articleId: string, updates: AdminReviewUpdateInput): Promise<ArticleReview> {
    const current = this.articleReviews.get(articleId);
    const now = new Date();
    const next: ArticleReview = {
      id: current?.id || randomUUID(),
      articleId,
      completed: updates.completed ?? current?.completed ?? false,
      issues: updates.issues ?? current?.issues ?? [],
      memo: updates.memo ?? current?.memo ?? "",
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    this.articleReviews.set(articleId, next);
    return next;
  }

  async addAdminReviewIssue(articleId: string, issue: string): Promise<ArticleReview> {
    const current = this.articleReviews.get(articleId);
    const nextIssues = [issue, ...(current?.issues || [])].slice(0, 20);
    return this.upsertAdminReview(articleId, { issues: nextIssues });
  }

  async createAdminActionLog(input: AdminActionLogInput): Promise<AdminActionLog> {
    const row = normalizeAdminActionLog(input);
    this.adminActionLogs.set(row.id, row);
    return row;
  }

  async getAdminActionLogs(limit: number = 100): Promise<AdminActionLog[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 10000));
    return Array.from(this.adminActionLogs.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, safeLimit);
  }

  async saveUserConsent(input: InsertUserConsent): Promise<UserConsent> {
    const email = String(input.email || "").trim().toLowerCase();
    const now = new Date();
    const current = this.userConsents.get(email);
    const next: UserConsent = {
      id: current?.id || randomUUID(),
      email,
      termsRequired: Boolean(input.termsRequired),
      privacyRequired: Boolean(input.privacyRequired),
      marketingOptional: Boolean(input.marketingOptional),
      termsVersion: String(input.termsVersion || ""),
      createdAt: current?.createdAt || now,
    };
    this.userConsents.set(email, next);
    return next;
  }

  async getUserInsights(userId: string): Promise<UserInsight[]> {
    const safeUserId = String(userId || "").trim();
    return Array.from(this.userInsights.values())
      .filter((row) => String(row.userId) === safeUserId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createUserInsight(input: InsertUserInsight): Promise<UserInsight> {
    const now = new Date();
    const row: UserInsight = {
      id: randomUUID(),
      userId: String(input.userId || "").trim(),
      articleId: String(input.articleId || "").trim(),
      originalTitle: String(input.originalTitle || "").trim(),
      userComment: String(input.userComment || "").trim(),
      userEmotion: (String(input.userEmotion || "spectrum").trim().toLowerCase() as EmotionType),
      userFeelingText: String(input.userFeelingText || "").trim(),
      selectedTags: Array.isArray((input as any).selectedTags)
        ? (input as any).selectedTags.map((tag: unknown) => String(tag || "").trim()).filter(Boolean).slice(0, 3)
        : [],
      createdAt: now,
      updatedAt: now,
    };
    this.userInsights.set(String(row.id), row);
    return row;
  }

  async deleteUserInsight(userId: string, insightId: string): Promise<boolean> {
    const current = this.userInsights.get(String(insightId));
    if (!current) return false;
    if (String(current.userId) !== String(userId || "").trim()) return false;
    return this.userInsights.delete(String(insightId));
  }

  async getUserComposedArticles(userId: string): Promise<UserComposedArticle[]> {
    const safeUserId = String(userId || "").trim();
    return Array.from(this.userComposedArticles.values())
      .filter((row) => String(row.userId) === safeUserId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createUserComposedArticle(input: InsertUserComposedArticle): Promise<UserComposedArticle> {
    const now = new Date();
    const row: UserComposedArticle = {
      id: randomUUID(),
      userId: String(input.userId || "").trim(),
      sourceArticleId: String(input.sourceArticleId || "").trim(),
      sourceTitle: String(input.sourceTitle || "").trim(),
      sourceUrl: input.sourceUrl ? String(input.sourceUrl).trim() : null,
      sourceEmotion: String((input as any).sourceEmotion || "spectrum").trim().toLowerCase() || "spectrum",
      sourceCategory: String((input as any).sourceCategory || "General").trim() || "General",
      userOpinion: String(input.userOpinion || "").trim(),
      extraRequest: String(input.extraRequest || "").trim(),
      requestedReferences: Array.isArray((input as any).requestedReferences)
        ? (input as any).requestedReferences.map((v: unknown) => String(v || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      generatedTitle: String(input.generatedTitle || "").trim(),
      generatedSummary: String(input.generatedSummary || "").trim(),
      generatedContent: String(input.generatedContent || "").trim(),
      referenceLinks: Array.isArray((input as any).referenceLinks)
        ? (input as any).referenceLinks.map((v: unknown) => String(v || "").trim()).filter(Boolean).slice(0, 12)
        : [],
      status: String((input as any).status || "draft") === "published" ? "published" : "draft",
      submissionStatus: (["pending", "approved", "rejected"].includes(String((input as any).submissionStatus || "pending"))
        ? String((input as any).submissionStatus || "pending")
        : "pending") as "pending" | "approved" | "rejected",
      moderationMemo: String((input as any).moderationMemo || "").trim(),
      reviewedBy: (input as any).reviewedBy ? String((input as any).reviewedBy).trim() : null,
      reviewedAt: (input as any).reviewedAt ? new Date((input as any).reviewedAt) : null,
      createdAt: now,
      updatedAt: now,
    } as UserComposedArticle;
    this.userComposedArticles.set(String(row.id), row);
    return row;
  }

  async deleteUserComposedArticle(userId: string, articleId: string): Promise<boolean> {
    const current = this.userComposedArticles.get(String(articleId));
    if (!current) return false;
    if (String(current.userId) !== String(userId || "").trim()) return false;
    return this.userComposedArticles.delete(String(articleId));
  }

  async updateUserComposedArticle(userId: string, articleId: string, updates: Partial<InsertUserComposedArticle>): Promise<UserComposedArticle | null> {
    const current = this.userComposedArticles.get(String(articleId));
    if (!current) return null;
    if (String(current.userId) !== String(userId || "").trim()) return null;
    const next: UserComposedArticle = {
      ...current,
      generatedTitle: updates.generatedTitle ? String(updates.generatedTitle).trim().slice(0, 220) : current.generatedTitle,
      generatedSummary: updates.generatedSummary ? String(updates.generatedSummary).trim().slice(0, 1000) : current.generatedSummary,
      generatedContent: updates.generatedContent ? String(updates.generatedContent).trim().slice(0, 24000) : current.generatedContent,
      sourceCategory: updates.sourceCategory ? String(updates.sourceCategory).trim().slice(0, 120) : (current as any).sourceCategory,
      sourceEmotion: updates.sourceEmotion ? String(updates.sourceEmotion).trim().toLowerCase().slice(0, 32) : (current as any).sourceEmotion,
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.userComposedArticles.set(String(articleId), next);
    return next;
  }

  async resubmitUserComposedArticle(userId: string, articleId: string): Promise<UserComposedArticle | null> {
    const current = this.userComposedArticles.get(String(articleId));
    if (!current) return null;
    if (String(current.userId) !== String(userId || "").trim()) return null;
    if (String((current as any).submissionStatus || "pending") !== "rejected") return null;

    const next: UserComposedArticle = {
      ...current,
      submissionStatus: "pending",
      moderationMemo: "",
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.userComposedArticles.set(String(articleId), next);
    return next;
  }

  async getReaderComposedArticles(status?: "pending" | "approved" | "rejected"): Promise<UserComposedArticle[]> {
    const safeStatus = status && ["pending", "approved", "rejected"].includes(status) ? status : null;
    return Array.from(this.userComposedArticles.values())
      .filter((row) => (safeStatus ? String((row as any).submissionStatus || "pending") === safeStatus : true))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async updateReaderComposedArticleDecision(articleId: string, input: ReaderArticleDecisionInput): Promise<UserComposedArticle | null> {
    const current = this.userComposedArticles.get(String(articleId));
    if (!current) return null;
    const next: UserComposedArticle = {
      ...current,
      submissionStatus: input.submissionStatus,
      moderationMemo: String(input.moderationMemo || "").trim(),
      reviewedBy: input.reviewedBy ? String(input.reviewedBy).trim() : null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.userComposedArticles.set(String(articleId), next);
    return next;
  }

  async deleteReaderComposedArticle(articleId: string): Promise<boolean> {
    return this.userComposedArticles.delete(String(articleId || "").trim());
  }
}

import { supabase } from "./supabase.js";

export class SupabaseStorage implements IStorage {
  private fallbackNews: Map<string, NewsItem> = new Map();
  private fallbackReports: Map<string, Report> = new Map();
  private fallbackArticleReviews: Map<string, ArticleReview> = new Map();
  private fallbackAdminActionLogs: Map<string, AdminActionLog> = new Map();
  private fallbackUserConsents: Map<string, UserConsent> = new Map();
  private fallbackUserInsights: Map<string, UserInsight> = new Map();
  private fallbackUserComposedArticles: Map<string, UserComposedArticle> = new Map();
  private readCache: Map<string, { expiresAt: number; value: unknown }> = new Map();
  private readCacheInflight: Map<string, Promise<unknown>> = new Map();

  constructor() {
    buildDemoNewsSeedItems().forEach((item) => {
      this.fallbackNews.set(item.id, item);
    });
  }

  private invalidateCache(...prefixes: string[]): void {
    if (prefixes.length === 0) return;
    for (const key of Array.from(this.readCache.keys())) {
      if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) {
        this.readCache.delete(key);
      }
    }
  }

  private async getOrLoadCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.readCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const inflight = this.readCacheInflight.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }

    const pending = loader()
      .then((value) => {
        this.readCache.set(key, { expiresAt: Date.now() + ttlMs, value });
        this.readCacheInflight.delete(key);
        return value;
      })
      .catch((error) => {
        this.readCacheInflight.delete(key);
        throw error;
      });

    this.readCacheInflight.set(key, pending as Promise<unknown>);
    return pending;
  }

  private mapArticleReview(row: any): ArticleReview {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? new Date();
    const updatedAtValue = row?.updated_at ?? row?.updatedAt ?? new Date();
    return {
      id: row?.id || randomUUID(),
      articleId: String(row?.article_id ?? row?.articleId ?? ""),
      completed: Boolean(row?.completed),
      issues: Array.isArray(row?.issues) ? row.issues.filter((v: unknown) => typeof v === "string") : [],
      memo: typeof row?.memo === "string" ? row.memo : "",
      createdAt: new Date(createdAtValue),
      updatedAt: new Date(updatedAtValue),
    } as ArticleReview;
  }

  private isMissingTableError(error: any): boolean {
    const message = String(error?.message || "");
    return /relation .* does not exist|column .* does not exist|could not find the table|schema cache|article_reviews|user_consents|admin_action_logs|user_insights|user_composed_articles|source_emotion|source_category|submission_status/i.test(message);
  }

  private isRlsError(error: any): boolean {
    const message = String(error?.message || "");
    return /row-level security|violates row-level security policy/i.test(message);
  }

  private mapUserConsent(row: any): UserConsent {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? new Date();
    return {
      id: row?.id || randomUUID(),
      email: String(row?.email ?? "").toLowerCase(),
      termsRequired: Boolean(row?.terms_required ?? row?.termsRequired),
      privacyRequired: Boolean(row?.privacy_required ?? row?.privacyRequired),
      marketingOptional: Boolean(row?.marketing_optional ?? row?.marketingOptional),
      termsVersion: String(row?.terms_version ?? row?.termsVersion ?? ""),
      createdAt: new Date(createdAtValue),
    } as UserConsent;
  }

  private mapAdminActionLog(row: any): AdminActionLog {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? new Date();
    return {
      id: row?.id || randomUUID(),
      actorId: row?.actor_id ?? row?.actorId ?? null,
      actorRole: String(row?.actor_role ?? row?.actorRole ?? "admin"),
      action: String(row?.action ?? "unknown"),
      targetType: String(row?.target_type ?? row?.targetType ?? "article"),
      targetId: String(row?.target_id ?? row?.targetId ?? ""),
      detail: row?.detail ?? null,
      createdAt: new Date(createdAtValue),
    } as AdminActionLog;
  }

  private mapUserInsight(row: any): UserInsight {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? new Date();
    const updatedAtValue = row?.updated_at ?? row?.updatedAt ?? new Date();
    return {
      id: row?.id || randomUUID(),
      userId: String(row?.user_id ?? row?.userId ?? ""),
      articleId: String(row?.article_id ?? row?.articleId ?? ""),
      originalTitle: String(row?.original_title ?? row?.originalTitle ?? ""),
      userComment: String(row?.user_comment ?? row?.userComment ?? ""),
      userEmotion: String(row?.user_emotion ?? row?.userEmotion ?? "spectrum") as EmotionType,
      userFeelingText: String(row?.user_feeling_text ?? row?.userFeelingText ?? ""),
      selectedTags: Array.isArray(row?.selected_tags ?? row?.selectedTags)
        ? (row?.selected_tags ?? row?.selectedTags).map((tag: unknown) => String(tag || "").trim()).filter(Boolean).slice(0, 3)
        : [],
      createdAt: new Date(createdAtValue),
      updatedAt: new Date(updatedAtValue),
    } as UserInsight;
  }

  private mapUserComposedArticle(row: any): UserComposedArticle {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? new Date();
    const updatedAtValue = row?.updated_at ?? row?.updatedAt ?? new Date();
    return {
      id: row?.id || randomUUID(),
      userId: String(row?.user_id ?? row?.userId ?? ""),
      sourceArticleId: String(row?.source_article_id ?? row?.sourceArticleId ?? ""),
      sourceTitle: String(row?.source_title ?? row?.sourceTitle ?? ""),
      sourceUrl: row?.source_url ?? row?.sourceUrl ?? null,
      sourceEmotion: String(row?.source_emotion ?? row?.sourceEmotion ?? "spectrum").trim().toLowerCase() || "spectrum",
      sourceCategory: String(row?.source_category ?? row?.sourceCategory ?? "General").trim() || "General",
      userOpinion: String(row?.user_opinion ?? row?.userOpinion ?? ""),
      extraRequest: String(row?.extra_request ?? row?.extraRequest ?? ""),
      requestedReferences: Array.isArray(row?.requested_references ?? row?.requestedReferences)
        ? (row?.requested_references ?? row?.requestedReferences).map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      generatedTitle: String(row?.generated_title ?? row?.generatedTitle ?? ""),
      generatedSummary: String(row?.generated_summary ?? row?.generatedSummary ?? ""),
      generatedContent: String(row?.generated_content ?? row?.generatedContent ?? ""),
      referenceLinks: Array.isArray(row?.reference_links ?? row?.referenceLinks)
        ? (row?.reference_links ?? row?.referenceLinks).map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 12)
        : [],
      status: String(row?.status ?? "draft") === "published" ? "published" : "draft",
      submissionStatus: (["pending", "approved", "rejected"].includes(String(row?.submission_status ?? row?.submissionStatus ?? "pending"))
        ? String(row?.submission_status ?? row?.submissionStatus ?? "pending")
        : "pending") as "pending" | "approved" | "rejected",
      moderationMemo: String(row?.moderation_memo ?? row?.moderationMemo ?? ""),
      reviewedBy: row?.reviewed_by ?? row?.reviewedBy ?? null,
      reviewedAt: row?.reviewed_at ? new Date(row.reviewed_at) : (row?.reviewedAt ? new Date(row.reviewedAt) : null),
      createdAt: new Date(createdAtValue),
      updatedAt: new Date(updatedAtValue),
    } as UserComposedArticle;
  }

  private mapNewsItemRow(row: any): NewsItem {
    const createdAtValue = row?.created_at ?? row?.createdAt ?? null;
    return {
      id: String(row?.id ?? randomUUID()),
      title: String(row?.title ?? ""),
      summary: String(row?.summary ?? ""),
      content: row?.content ?? null,
      source: String(row?.source ?? ""),
      image: row?.image ?? null,
      category: row?.category ?? null,
      emotion: normalizeEmotion(row?.emotion),
      intensity: Number(row?.intensity ?? 50),
      views: Number(row?.views ?? 0),
      saves: Number(row?.saves ?? 0),
      platforms: Array.isArray(row?.platforms) ? row.platforms.map((value: unknown) => String(value || "")) : ["interactive"],
      isPublished: Boolean(row?.is_published ?? row?.isPublished ?? true),
      authorId: row?.author_id ?? row?.authorId ?? null,
      authorName: row?.author_name ?? row?.authorName ?? null,
      createdAt: createdAtValue ? new Date(createdAtValue) : null,
    } as NewsItem;
  }

  private mergeWithFallback(dbRows: NewsItem[]): NewsItem[] {
    const merged = new Map<string, NewsItem>();
    dbRows.forEach((row) => merged.set(String(row.id), row));
    this.fallbackNews.forEach((row, id) => merged.set(String(id), row));
    return collapseDuplicateNewsRows(Array.from(merged.values())).sort((a, b) => {
      const bt = new Date((b as any).createdAt || (b as any).created_at || 0).getTime();
      const at = new Date((a as any).createdAt || (a as any).created_at || 0).getTime();
      return bt - at;
    });
  }

  private toFallbackNewsItem(item: InsertNewsItem): NewsItem {
    return {
      id: randomUUID(),
      title: item.title,
      summary: item.summary,
      content: item.content ?? null,
      source: item.source,
      image: item.image ?? null,
      category: item.category ?? null,
      emotion: item.emotion as EmotionType,
      intensity: item.intensity ?? 50,
      views: 0,
      saves: 0,
      platforms: ['interactive'],
      isPublished: true,
      authorId: item.authorId ?? null,
      authorName: item.authorName ?? null,
      createdAt: new Date(),
    } as NewsItem;
  }

  async getUser(id: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    if (data) {
      return {
        ...data,
        googleId: data.google_id
      } as User;
    }
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('username', username).single();
    if (data) {
      return {
        ...data,
        googleId: data.google_id
      } as User;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Manually map camelCase to snake_case for Supabase
    const supabaseUser = {
      username: insertUser.username,
      password: insertUser.password,
      google_id: insertUser.googleId
    };

    const { data, error } = await supabase.from('users').insert(supabaseUser).select().single();
    if (error) throw error;

    // Map back snake_case to camelCase
    return {
      ...data,
      googleId: data.google_id
    } as User;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('google_id', googleId).single();
    if (data) {
      return {
        ...data,
        googleId: data.google_id
      } as User;
    }
    return undefined;
  }

  async getNewsByEmotion(emotion: EmotionType): Promise<NewsItem[]> {
    return this.getOrLoadCached(`newsByEmotion:${emotion}`, NEWS_LIST_CACHE_TTL_MS, async () => {
      const { data } = await supabase
        .from('news_items')
        .select(NEWS_LIST_SELECT)
        .eq('emotion', emotion)
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      const dbRows = (data || []).map((row) => this.mapNewsItemRow(row));
      const merged = this.mergeWithFallback(dbRows);
      return merged.filter((row: any) => row.emotion === emotion && isPublishedVisible(row));
    });
  }

  async getNewsItemById(id: string): Promise<NewsItem | null> {
    if (this.fallbackNews.has(id)) {
      return this.fallbackNews.get(id) || null;
    }

    const { data } = await supabase
      .from('news_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (data) return data as NewsItem;
    return null;
  }

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    return this.getOrLoadCached(`allNews:${includeHidden ? "all" : "published"}`, NEWS_LIST_CACHE_TTL_MS, async () => {
      let query = supabase.from('news_items').select(NEWS_LIST_SELECT).order('created_at', { ascending: false });

      if (!includeHidden) {
        query = query.eq('is_published', true);
      }

      const { data } = await query;
      const dbRows = (data || []).map((row) => this.mapNewsItemRow(row));
      const merged = this.mergeWithFallback(dbRows);
      return merged.filter((row: any) => includeHidden || isPublishedVisible(row));
    });
  }

  async getAdminArticlesPage(input: AdminArticleListQuery): Promise<AdminArticleListResult> {
    const safePage = Math.max(1, Number(input.page || 1));
    const safePageSize = Math.max(1, Math.min(Number(input.pageSize || 10), 100));
    const includeHidden = input.includeHidden !== false;
    const safeEmotion = String(input.emotion || "").trim().toLowerCase();
    const safeCategory = String(input.category || "").trim();
    const safeSearch = String(input.search || "").trim();
    const cacheKey = `adminArticles:${includeHidden ? "all" : "published"}:${safePage}:${safePageSize}:${safeEmotion}:${safeCategory.toLowerCase()}:${safeSearch.toLowerCase()}`;

    return this.getOrLoadCached(cacheKey, NEWS_LIST_CACHE_TTL_MS, async () => {
      const availableCategories = Array.from(
        new Set(
          (await this.getAllNews(includeHidden))
            .filter((item) => !safeEmotion || String(item.emotion || "").trim().toLowerCase() === safeEmotion)
            .filter((item) => {
              if (!safeSearch) return true;
              const haystack = [item.title, item.summary, item.source, item.id, item.category].join(" ").toLowerCase();
              return haystack.includes(safeSearch.toLowerCase());
            })
            .map((item) => String(item.category || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "ko"));

      let query = supabase
        .from('news_items')
        .select(NEWS_LIST_SELECT, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (!includeHidden) {
        query = query.eq('is_published', true);
      }
      if (safeEmotion) {
        query = query.eq('emotion', safeEmotion);
      }
      if (safeCategory && safeCategory !== 'all') {
        query = query.eq('category', safeCategory);
      }
      if (safeSearch) {
        const escaped = safeSearch.replace(/[%_,]/g, (match) => `\\${match}`);
        query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%,source.ilike.%${escaped}%,category.ilike.%${escaped}%`);
      }

      const from = (safePage - 1) * safePageSize;
      const to = from + safePageSize - 1;
      const { data, count } = await query.range(from, to);
      const items = (data || []).map((row) => this.mapNewsItemRow(row));
      const merged = this.mergeWithFallback(items).filter((row: any) => includeHidden || isPublishedVisible(row));

      return {
        items: merged,
        total: Math.max(Number(count || 0), merged.length),
        page: safePage,
        pageSize: safePageSize,
        availableCategories,
      };
    });
  }

  async createNewsItem(item: InsertNewsItem): Promise<NewsItem> {
    const safeAuthorId = sanitizeUuidOrNull(item.authorId);

    const payload = {
      title: item.title,
      summary: item.summary,
      content: item.content ?? null,
      source: item.source,
      image: item.image ?? null,
      category: item.category ?? null,
      emotion: item.emotion,
      intensity: item.intensity ?? 50,
      author_id: safeAuthorId || null,
      author_name: item.authorName ?? null,
      platforms: ['interactive'],
      is_published: true,
    };

    const { data, error } = await supabase
      .from('news_items')
      .insert(payload)
      .select()
      .single();
    if (error) {
      const message = String((error as any)?.message || "");
      const isRls = /row-level security|violates row-level security policy/i.test(message);
      if (isRls) {
        const fallback = this.toFallbackNewsItem(item);
        this.fallbackNews.set(fallback.id, fallback);
        this.invalidateCache("allNews", `newsByEmotion:${fallback.emotion}`, "adminStats", "adminArticles");
        return fallback;
      }
      throw error;
    }
    this.invalidateCache("allNews", `newsByEmotion:${item.emotion}`, "adminStats", "adminArticles");
    return data as NewsItem;
  }

  async updateNewsItem(id: string, updates: Partial<NewsItem>): Promise<NewsItem | null> {
    if (this.fallbackNews.has(id)) {
      const current = this.fallbackNews.get(id)!;
      const updated = { ...current, ...updates };
      this.fallbackNews.set(id, updated as NewsItem);
      this.invalidateCache("allNews", `newsByEmotion:${String(updated.emotion || "")}`, "adminStats", "adminArticles");
      return updated as NewsItem;
    }

    const payload = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      ...(updates.source !== undefined ? { source: updates.source } : {}),
      ...(updates.image !== undefined ? { image: updates.image } : {}),
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      ...(updates.emotion !== undefined ? { emotion: updates.emotion } : {}),
      ...(updates.intensity !== undefined ? { intensity: updates.intensity } : {}),
      ...(updates.authorId !== undefined ? { author_id: sanitizeUuidOrNull(updates.authorId) } : {}),
      ...(updates.authorName !== undefined ? { author_name: updates.authorName } : {}),
      ...(updates.platforms !== undefined ? { platforms: updates.platforms } : {}),
      ...(updates.isPublished !== undefined ? { is_published: updates.isPublished } : {}),
    };

    const { data, error } = await supabase
      .from('news_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      this.invalidateCache("allNews", `newsByEmotion:${String((data as any).emotion || updates.emotion || "")}`, "adminStats", "adminArticles");
      return data as NewsItem;
    }

    const { data: existing } = await supabase
      .from('news_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const base = (existing as any) || this.fallbackNews.get(id) || ({ id } as NewsItem);
    const normalizedPublished =
      updates.isPublished !== undefined
        ? updates.isPublished
        : (base as any).isPublished !== undefined
          ? (base as any).isPublished
          : (base as any).is_published;
    const fallbackUpdated = {
      ...base,
      ...updates,
      id,
      ...(normalizedPublished !== undefined ? { isPublished: normalizedPublished, is_published: normalizedPublished } : {}),
    } as NewsItem;
    this.fallbackNews.set(id, fallbackUpdated);
    this.invalidateCache("allNews", `newsByEmotion:${String(fallbackUpdated.emotion || updates.emotion || "")}`, "adminStats", "adminArticles");
    return fallbackUpdated;
  }

  async deleteNewsItem(id: string): Promise<boolean> {
    if (this.fallbackNews.has(id)) {
      this.fallbackNews.delete(id);
      this.invalidateCache("allNews", "newsByEmotion", "adminStats", "adminArticles");
      return true;
    }

    const { error } = await supabase
      .from('news_items')
      .delete()
      .eq('id', id);
    if (!error) {
      this.invalidateCache("allNews", "newsByEmotion", "adminStats", "adminArticles");
      return true;
    }

    const message = String((error as any)?.message || "");
    if (/row-level security|violates row-level security policy/i.test(message)) {
      this.fallbackNews.set(id, {
        ...(this.fallbackNews.get(id) || ({ id } as NewsItem)),
        id,
        isPublished: false,
      } as NewsItem);
      this.invalidateCache("allNews", "newsByEmotion", "adminStats", "adminArticles");
      return true;
    }

    return false;
  }

  // Admin & Interaction Methods
  async incrementView(id: string): Promise<void> {
    const { data: item } = await supabase.from('news_items').select('views').eq('id', id).single();
    if (item) {
      await supabase.from('news_items').update({ views: (item.views || 0) + 1 }).eq('id', id);
      this.invalidateCache("allNews", "newsByEmotion", "adminStats", "adminArticles");
    }
  }

  async toggleSave(id: string, userId: string): Promise<boolean> {
    const { data: item } = await supabase.from('news_items').select('saves').eq('id', id).single();
    if (!item) return false;
    await supabase.from('news_items').update({ saves: (item.saves || 0) + 1 }).eq('id', id);
    this.invalidateCache("allNews", "newsByEmotion", "adminStats", "adminArticles");
    return true;
  }

  async createReport(articleId: string, reason: string): Promise<Report> {
    const fallback: Report = {
      id: randomUUID(),
      articleId,
      reason,
      details: "Reported by user",
      riskScore: Math.floor(Math.random() * 100),
      status: "reported",
      sanctionType: "none",
      resolution: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(),
    } as Report;

    const { data, error } = await supabase
      .from('reports')
      .insert({
        article_id: articleId,
        reason,
        risk_score: Math.floor(Math.random() * 100),
        details: "Reported by user",
        status: "reported",
        sanction_type: "none",
      })
      .select()
      .single();
    if (!error && data) {
      const mapped = mapReportRow(data);
      this.fallbackReports.set(mapped.id, mapped);
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    this.fallbackReports.set(fallback.id, fallback);
    return fallback;
  }

  async getReports(): Promise<Report[]> {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const mapped = (data || []).map((r: any) => mapReportRow(r)) as Report[];
      mapped.forEach((row) => this.fallbackReports.set(String(row.id), row));
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    return Array.from(this.fallbackReports.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async updateReportStatus(reportId: string, input: ReportStatusUpdateInput): Promise<Report | null> {
    const payload = {
      status: input.status,
      sanction_type: input.sanctionType ?? "none",
      resolution: input.resolution ?? null,
      reviewed_by: input.reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('reports')
      .update(payload)
      .eq('id', reportId)
      .select()
      .maybeSingle();

    if (!error && data) {
      const mapped = mapReportRow(data);
      this.fallbackReports.set(String(mapped.id), mapped);
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    const current = this.fallbackReports.get(reportId);
    if (!current) return null;
    const next: Report = {
      ...current,
      status: input.status,
      sanctionType: input.sanctionType ?? current.sanctionType ?? "none",
      resolution: input.resolution ?? current.resolution ?? null,
      reviewedBy: input.reviewedBy ?? current.reviewedBy ?? null,
      reviewedAt: new Date(),
    } as Report;
    this.fallbackReports.set(reportId, next);
    return next;
  }

  async getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }> {
    return this.getOrLoadCached("adminStats", ADMIN_STATS_CACHE_TTL_MS, async () => {
      const [{ data: allNews }, { count: userCount }, { data: reviewRows, error: reviewError }] = await Promise.all([
        supabase.from('news_items').select(ADMIN_STATS_NEWS_SELECT),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('article_reviews').select(ADMIN_STATS_REVIEW_SELECT),
      ]);

      const news = (allNews || []).map((row) => this.mapNewsItemRow(row));
      let reviews: ArticleReview[] = Array.from(this.fallbackArticleReviews.values());
      if (!reviewError && reviewRows) {
        reviews = (reviewRows || []).map((row) => this.mapArticleReview(row));
        for (const row of reviews) {
          this.fallbackArticleReviews.set(row.articleId, row);
        }
      } else if (reviewError && !this.isMissingTableError(reviewError)) {
        throw reviewError;
      }

      const stats = computeAdminStatsPayload(news, reviews, (userCount || 0) + 3240);
      const emCounts: Record<string, number> = {};
      news.forEach((item: any) => {
        emCounts[item.emotion] = (emCounts[item.emotion] || 0) + 1;
      });

      const emotionStats = Object.keys(emCounts).map(emotion => ({
        emotion,
        count: emCounts[emotion],
        percentage: news.length > 0 ? Math.round((emCounts[emotion] / news.length) * 100) : 0
      }));

      const topArticles = [...news]
        .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
        .slice(0, 3) as NewsItem[];

      return { stats, emotionStats, topArticles };
    });
  }

  async getAdminReviews(): Promise<ArticleReview[]> {
    const { data, error } = await supabase
      .from('article_reviews')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      const reviews = (data || []).map((row) => this.mapArticleReview(row));
      reviews.forEach((review) => this.fallbackArticleReviews.set(review.articleId, review));
      return reviews;
    }

    if (!this.isMissingTableError(error)) {
      throw error;
    }

    return Array.from(this.fallbackArticleReviews.values())
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }

  async upsertAdminReview(articleId: string, updates: AdminReviewUpdateInput): Promise<ArticleReview> {
    const existingFallback = this.fallbackArticleReviews.get(articleId);

    let existingDb: any = null;
    const { data: maybeRow, error: fetchError } = await supabase
      .from('article_reviews')
      .select('*')
      .eq('article_id', articleId)
      .maybeSingle();
    if (!fetchError && maybeRow) existingDb = maybeRow;

    if (fetchError && !this.isMissingTableError(fetchError)) {
      throw fetchError;
    }

    const current = existingDb ? this.mapArticleReview(existingDb) : existingFallback;
    const now = new Date();

    const payload = {
      article_id: articleId,
      completed: updates.completed ?? current?.completed ?? false,
      issues: updates.issues ?? current?.issues ?? [],
      memo: updates.memo ?? current?.memo ?? "",
      updated_at: now.toISOString(),
    };

    const { data, error } = await supabase
      .from('article_reviews')
      .upsert(payload, { onConflict: 'article_id' })
      .select()
      .single();

    if (!error && data) {
      const mapped = this.mapArticleReview(data);
      this.fallbackArticleReviews.set(articleId, mapped);
      this.invalidateCache("adminStats");
      return mapped;
    }

    if (error && !this.isMissingTableError(error)) {
      throw error;
    }

    const fallback: ArticleReview = {
      id: current?.id || randomUUID(),
      articleId,
      completed: payload.completed,
      issues: payload.issues,
      memo: payload.memo,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    this.fallbackArticleReviews.set(articleId, fallback);
    this.invalidateCache("adminStats");
    return fallback;
  }

  async addAdminReviewIssue(articleId: string, issue: string): Promise<ArticleReview> {
    let current = this.fallbackArticleReviews.get(articleId);
    const { data, error } = await supabase
      .from('article_reviews')
      .select('*')
      .eq('article_id', articleId)
      .maybeSingle();
    if (!error && data) {
      current = this.mapArticleReview(data);
    } else if (error && !this.isMissingTableError(error)) {
      throw error;
    }
    const issues = [issue, ...(current?.issues || [])].slice(0, 20);
    return this.upsertAdminReview(articleId, { issues });
  }

  async createAdminActionLog(input: AdminActionLogInput): Promise<AdminActionLog> {
    const fallback = normalizeAdminActionLog(input);
    const payload = {
      actor_id: fallback.actorId,
      actor_role: fallback.actorRole,
      action: fallback.action,
      target_type: fallback.targetType,
      target_id: fallback.targetId,
      detail: fallback.detail,
      created_at: fallback.createdAt.toISOString(),
    };

    const { data, error } = await supabase
      .from('admin_action_logs')
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      const mapped = this.mapAdminActionLog(data);
      this.fallbackAdminActionLogs.set(mapped.id, mapped);
      return mapped;
    }

    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    this.fallbackAdminActionLogs.set(fallback.id, fallback);
    return fallback;
  }

  async getAdminActionLogs(limit: number = 100): Promise<AdminActionLog[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 500));
    const { data, error } = await supabase
      .from('admin_action_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (!error && data) {
      const logs = (data || []).map((row) => this.mapAdminActionLog(row));
      logs.forEach((log) => this.fallbackAdminActionLogs.set(log.id, log));
      return logs;
    }

    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    return Array.from(this.fallbackAdminActionLogs.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, safeLimit);
  }

  async saveUserConsent(input: InsertUserConsent): Promise<UserConsent> {
    const email = String(input.email || "").trim().toLowerCase();
    const current = this.fallbackUserConsents.get(email);
    const fallback: UserConsent = {
      id: current?.id || randomUUID(),
      email,
      termsRequired: Boolean(input.termsRequired),
      privacyRequired: Boolean(input.privacyRequired),
      marketingOptional: Boolean(input.marketingOptional),
      termsVersion: String(input.termsVersion || ""),
      createdAt: current?.createdAt || new Date(),
    };

    const payload = {
      email,
      terms_required: fallback.termsRequired,
      privacy_required: fallback.privacyRequired,
      marketing_optional: fallback.marketingOptional,
      terms_version: fallback.termsVersion,
    };

    const { data, error } = await supabase
      .from('user_consents')
      .upsert(payload, { onConflict: 'email' })
      .select()
      .single();

    if (!error && data) {
      const mapped = this.mapUserConsent(data);
      this.fallbackUserConsents.set(email, mapped);
      return mapped;
    }

    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    this.fallbackUserConsents.set(email, fallback);
    return fallback;
  }

  async getUserInsights(userId: string): Promise<UserInsight[]> {
    const safeUserId = String(userId || "").trim();
    const { data, error } = await supabase
      .from("user_insights")
      .select("*")
      .eq("user_id", safeUserId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const rows = (data || []).map((row) => this.mapUserInsight(row));
      rows.forEach((row) => this.fallbackUserInsights.set(String(row.id), row));
      const merged = new Map<string, UserInsight>();
      rows.forEach((row) => merged.set(String(row.id), row));
      Array.from(this.fallbackUserInsights.values())
        .filter((row) => String(row.userId) === safeUserId)
        .forEach((row) => {
          if (!merged.has(String(row.id))) merged.set(String(row.id), row);
        });
      return Array.from(merged.values())
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    return Array.from(this.fallbackUserInsights.values())
      .filter((row) => String(row.userId) === safeUserId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createUserInsight(input: InsertUserInsight): Promise<UserInsight> {
    const fallback: UserInsight = {
      id: randomUUID(),
      userId: String(input.userId || "").trim(),
      articleId: String(input.articleId || "").trim(),
      originalTitle: String(input.originalTitle || "").trim(),
      userComment: String(input.userComment || "").trim(),
      userEmotion: String(input.userEmotion || "spectrum") as EmotionType,
      userFeelingText: String(input.userFeelingText || "").trim(),
      selectedTags: Array.isArray((input as any).selectedTags)
        ? (input as any).selectedTags.map((tag: unknown) => String(tag || "").trim()).filter(Boolean).slice(0, 3)
        : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const payload = {
      user_id: fallback.userId,
      article_id: fallback.articleId,
      original_title: fallback.originalTitle,
      user_comment: fallback.userComment,
      user_emotion: fallback.userEmotion,
      user_feeling_text: fallback.userFeelingText,
      selected_tags: fallback.selectedTags,
      updated_at: fallback.updatedAt.toISOString(),
    };

    const { data, error } = await supabase
      .from("user_insights")
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      const mapped = this.mapUserInsight(data);
      this.fallbackUserInsights.set(String(mapped.id), mapped);
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    this.fallbackUserInsights.set(String(fallback.id), fallback);
    return fallback;
  }

  async deleteUserInsight(userId: string, insightId: string): Promise<boolean> {
    const safeUserId = String(userId || "").trim();
    const safeInsightId = String(insightId || "").trim();
    const { data, error } = await supabase
      .from("user_insights")
      .delete()
      .eq("id", safeInsightId)
      .eq("user_id", safeUserId)
      .select("id")
      .maybeSingle();

    if (!error) {
      const deleted = Boolean(data?.id);
      if (deleted) this.fallbackUserInsights.delete(safeInsightId);
      return deleted;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    const fallbackRow = this.fallbackUserInsights.get(safeInsightId);
    if (!fallbackRow) return false;
    if (String(fallbackRow.userId) !== safeUserId) return false;
    this.fallbackUserInsights.delete(safeInsightId);
    return true;
  }

  async getUserComposedArticles(userId: string): Promise<UserComposedArticle[]> {
    const safeUserId = String(userId || "").trim();
    const { data, error } = await supabase
      .from("user_composed_articles")
      .select("*")
      .eq("user_id", safeUserId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const rows = (data || []).map((row) => this.mapUserComposedArticle(row));
      rows.forEach((row) => this.fallbackUserComposedArticles.set(String(row.id), row));
      const merged = new Map<string, UserComposedArticle>();
      rows.forEach((row) => merged.set(String(row.id), row));
      Array.from(this.fallbackUserComposedArticles.values())
        .filter((row) => String(row.userId) === safeUserId)
        .forEach((row) => {
          if (!merged.has(String(row.id))) merged.set(String(row.id), row);
        });
      return Array.from(merged.values())
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    return Array.from(this.fallbackUserComposedArticles.values())
      .filter((row) => String(row.userId) === safeUserId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createUserComposedArticle(input: InsertUserComposedArticle): Promise<UserComposedArticle> {
    const now = new Date();
    const fallback: UserComposedArticle = {
      id: randomUUID(),
      userId: String(input.userId || "").trim(),
      sourceArticleId: String(input.sourceArticleId || "").trim(),
      sourceTitle: String(input.sourceTitle || "").trim(),
      sourceUrl: input.sourceUrl ? String(input.sourceUrl).trim() : null,
      sourceEmotion: String((input as any).sourceEmotion || "spectrum").trim().toLowerCase() || "spectrum",
      sourceCategory: String((input as any).sourceCategory || "General").trim() || "General",
      userOpinion: String(input.userOpinion || "").trim(),
      extraRequest: String(input.extraRequest || "").trim(),
      requestedReferences: Array.isArray((input as any).requestedReferences)
        ? (input as any).requestedReferences.map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      generatedTitle: String(input.generatedTitle || "").trim(),
      generatedSummary: String(input.generatedSummary || "").trim(),
      generatedContent: String(input.generatedContent || "").trim(),
      referenceLinks: Array.isArray((input as any).referenceLinks)
        ? (input as any).referenceLinks.map((value: unknown) => String(value || "").trim()).filter(Boolean).slice(0, 12)
        : [],
      status: String((input as any).status || "draft") === "published" ? "published" : "draft",
      submissionStatus: (["pending", "approved", "rejected"].includes(String((input as any).submissionStatus || "pending"))
        ? String((input as any).submissionStatus || "pending")
        : "pending") as "pending" | "approved" | "rejected",
      moderationMemo: String((input as any).moderationMemo || "").trim(),
      reviewedBy: (input as any).reviewedBy ? String((input as any).reviewedBy).trim() : null,
      reviewedAt: (input as any).reviewedAt ? new Date((input as any).reviewedAt) : null,
      createdAt: now,
      updatedAt: now,
    } as UserComposedArticle;

    const payload = {
      user_id: fallback.userId,
      source_article_id: fallback.sourceArticleId,
      source_title: fallback.sourceTitle,
      source_url: fallback.sourceUrl,
      source_emotion: fallback.sourceEmotion,
      source_category: fallback.sourceCategory,
      user_opinion: fallback.userOpinion,
      extra_request: fallback.extraRequest,
      requested_references: fallback.requestedReferences,
      generated_title: fallback.generatedTitle,
      generated_summary: fallback.generatedSummary,
      generated_content: fallback.generatedContent,
      reference_links: fallback.referenceLinks,
      status: fallback.status,
      submission_status: fallback.submissionStatus,
      moderation_memo: fallback.moderationMemo,
      reviewed_by: fallback.reviewedBy,
      reviewed_at: fallback.reviewedAt ? fallback.reviewedAt.toISOString() : null,
      updated_at: fallback.updatedAt.toISOString(),
    };

    const { data, error } = await supabase
      .from("user_composed_articles")
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      const mapped = this.mapUserComposedArticle(data);
      this.fallbackUserComposedArticles.set(String(mapped.id), mapped);
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    this.fallbackUserComposedArticles.set(String(fallback.id), fallback);
    return fallback;
  }

  async deleteUserComposedArticle(userId: string, articleId: string): Promise<boolean> {
    const safeUserId = String(userId || "").trim();
    const safeArticleId = String(articleId || "").trim();
    const { data, error } = await supabase
      .from("user_composed_articles")
      .delete()
      .eq("id", safeArticleId)
      .eq("user_id", safeUserId)
      .select("id")
      .maybeSingle();

    if (!error) {
      const deleted = Boolean(data?.id);
      if (deleted) this.fallbackUserComposedArticles.delete(safeArticleId);
      return deleted;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    const fallbackRow = this.fallbackUserComposedArticles.get(safeArticleId);
    if (!fallbackRow) return false;
    if (String(fallbackRow.userId) !== safeUserId) return false;
    this.fallbackUserComposedArticles.delete(safeArticleId);
    return true;
  }

  async updateUserComposedArticle(userId: string, articleId: string, updates: Partial<InsertUserComposedArticle>): Promise<UserComposedArticle | null> {
    const safeUserId = String(userId || "").trim();
    const safeArticleId = String(articleId || "").trim();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.generatedTitle) updatePayload.generated_title = String(updates.generatedTitle).trim().slice(0, 220);
    if (updates.generatedSummary) updatePayload.generated_summary = String(updates.generatedSummary).trim().slice(0, 1000);
    if (updates.generatedContent) updatePayload.generated_content = String(updates.generatedContent).trim().slice(0, 24000);
    if ((updates as any).sourceCategory) updatePayload.source_category = String((updates as any).sourceCategory).trim().slice(0, 120);
    if ((updates as any).sourceEmotion) updatePayload.source_emotion = String((updates as any).sourceEmotion).trim().toLowerCase().slice(0, 32);

    const { data, error } = await supabase
      .from("user_composed_articles")
      .update(updatePayload)
      .eq("id", safeArticleId)
      .eq("user_id", safeUserId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const mapped = this.mapUserComposedArticle(data);
      this.fallbackUserComposedArticles.set(String(mapped.id), mapped);
      return mapped;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    const fallback = this.fallbackUserComposedArticles.get(safeArticleId);
    if (!fallback) return null;
    if (String(fallback.userId) !== safeUserId) return null;
    const next: UserComposedArticle = {
      ...fallback,
      generatedTitle: updates.generatedTitle ? String(updates.generatedTitle).trim().slice(0, 220) : fallback.generatedTitle,
      generatedSummary: updates.generatedSummary ? String(updates.generatedSummary).trim().slice(0, 1000) : fallback.generatedSummary,
      generatedContent: updates.generatedContent ? String(updates.generatedContent).trim().slice(0, 24000) : fallback.generatedContent,
      sourceCategory: (updates as any).sourceCategory ? String((updates as any).sourceCategory).trim().slice(0, 120) : (fallback as any).sourceCategory,
      sourceEmotion: (updates as any).sourceEmotion ? String((updates as any).sourceEmotion).trim().toLowerCase().slice(0, 32) : (fallback as any).sourceEmotion,
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.fallbackUserComposedArticles.set(safeArticleId, next);
    return next;
  }

  async resubmitUserComposedArticle(userId: string, articleId: string): Promise<UserComposedArticle | null> {
    const safeUserId = String(userId || "").trim();
    const safeArticleId = String(articleId || "").trim();

    const { data: currentRow, error: currentError } = await supabase
      .from("user_composed_articles")
      .select("*")
      .eq("id", safeArticleId)
      .eq("user_id", safeUserId)
      .maybeSingle();

    if (!currentError && currentRow) {
      const current = this.mapUserComposedArticle(currentRow);
      if (String((current as any).submissionStatus || "pending") !== "rejected") return null;

      const { data, error } = await supabase
        .from("user_composed_articles")
        .update({
          submission_status: "pending",
          moderation_memo: "",
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", safeArticleId)
        .eq("user_id", safeUserId)
        .select("*")
        .maybeSingle();

      if (!error && data) {
        const mapped = this.mapUserComposedArticle(data);
        this.fallbackUserComposedArticles.set(String(mapped.id), mapped);
        return mapped;
      }
      if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
        throw error;
      }
    } else if (currentError && !this.isMissingTableError(currentError) && !this.isRlsError(currentError)) {
      throw currentError;
    }

    const fallback = this.fallbackUserComposedArticles.get(safeArticleId);
    if (!fallback) return null;
    if (String(fallback.userId) !== safeUserId) return null;
    if (String((fallback as any).submissionStatus || "pending") !== "rejected") return null;

    const next: UserComposedArticle = {
      ...fallback,
      submissionStatus: "pending",
      moderationMemo: "",
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.fallbackUserComposedArticles.set(safeArticleId, next);
    return next;
  }

  async getReaderComposedArticles(status?: "pending" | "approved" | "rejected"): Promise<UserComposedArticle[]> {
    let query = supabase
      .from("user_composed_articles")
      .select("*")
      .order("created_at", { ascending: false });
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query = query.eq("submission_status", status);
    }
    const { data, error } = await query;

    if (!error && data) {
      const rows = (data || []).map((row) => this.mapUserComposedArticle(row));
      rows.forEach((row) => this.fallbackUserComposedArticles.set(String(row.id), row));
      const merged = new Map<string, UserComposedArticle>();
      rows.forEach((row) => merged.set(String(row.id), row));
      Array.from(this.fallbackUserComposedArticles.values())
        .forEach((row) => {
          if (!merged.has(String(row.id))) merged.set(String(row.id), row);
        });
      return Array.from(merged.values())
        .filter((row) => (status ? String((row as any).submissionStatus || "pending") === status : true))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }
    return Array.from(this.fallbackUserComposedArticles.values())
      .filter((row) => (status ? String((row as any).submissionStatus || "pending") === status : true))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async updateReaderComposedArticleDecision(articleId: string, input: ReaderArticleDecisionInput): Promise<UserComposedArticle | null> {
    const safeArticleId = String(articleId || "").trim();
    const safeSubmissionStatus = ["pending", "approved", "rejected"].includes(String(input.submissionStatus))
      ? input.submissionStatus
      : "pending";
    const payload = {
      submission_status: safeSubmissionStatus,
      moderation_memo: String(input.moderationMemo || "").trim(),
      reviewed_by: input.reviewedBy ? String(input.reviewedBy).trim() : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: existingRow, error: existingError } = await supabase
      .from("user_composed_articles")
      .select("*")
      .eq("id", safeArticleId)
      .maybeSingle();

    if (!existingError && existingRow) {
      const mappedExisting = this.mapUserComposedArticle(existingRow);
      this.fallbackUserComposedArticles.set(String(mappedExisting.id), mappedExisting);
    } else if (existingError && !this.isMissingTableError(existingError) && !this.isRlsError(existingError)) {
      throw existingError;
    }

    const { data, error } = await supabase
      .from("user_composed_articles")
      .update(payload)
      .eq("id", safeArticleId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const mapped = this.mapUserComposedArticle(data);
      this.fallbackUserComposedArticles.set(String(mapped.id), mapped);
      return mapped;
    }
    if (error && this.isRlsError(error)) {
      throw new Error("Admin reader article approval is blocked by Supabase RLS. Check SUPABASE_SERVICE_ROLE_KEY for backend writes.");
    }
    if (error && !this.isMissingTableError(error)) {
      throw error;
    }

    const { data: refreshedRow, error: refreshedError } = await supabase
      .from("user_composed_articles")
      .select("*")
      .eq("id", safeArticleId)
      .maybeSingle();

    if (!refreshedError && refreshedRow) {
      const mappedRefreshed = this.mapUserComposedArticle(refreshedRow);
      this.fallbackUserComposedArticles.set(String(mappedRefreshed.id), mappedRefreshed);
      if (String(mappedRefreshed.submissionStatus || "pending") === safeSubmissionStatus) {
        return mappedRefreshed;
      }
      throw new Error("Reader article exists, but the admin decision was not persisted.");
    }
    if (refreshedError && this.isRlsError(refreshedError)) {
      throw new Error("Admin reader article approval is blocked by Supabase RLS. Check SUPABASE_SERVICE_ROLE_KEY for backend writes.");
    }
    if (refreshedError && !this.isMissingTableError(refreshedError)) {
      throw refreshedError;
    }

    const fallback = this.fallbackUserComposedArticles.get(safeArticleId);
    if (!fallback) return null;
    const next: UserComposedArticle = {
      ...fallback,
      submissionStatus: safeSubmissionStatus,
      moderationMemo: String(input.moderationMemo || "").trim(),
      reviewedBy: input.reviewedBy ? String(input.reviewedBy).trim() : null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    } as UserComposedArticle;
    this.fallbackUserComposedArticles.set(safeArticleId, next);
    return next;
  }

  async deleteReaderComposedArticle(articleId: string): Promise<boolean> {
    const safeArticleId = String(articleId || "").trim();
    const { data, error } = await supabase
      .from("user_composed_articles")
      .delete()
      .eq("id", safeArticleId)
      .select("id")
      .maybeSingle();

    if (!error) {
      const deleted = Boolean(data?.id);
      if (deleted) this.fallbackUserComposedArticles.delete(safeArticleId);
      return deleted;
    }
    if (error && !this.isMissingTableError(error) && !this.isRlsError(error)) {
      throw error;
    }

    const fallback = this.fallbackUserComposedArticles.get(safeArticleId);
    if (!fallback) return false;
    this.fallbackUserComposedArticles.delete(safeArticleId);
    return true;
  }
}

// Use SupabaseStorage (REST API) - no DATABASE_URL required
export const storage = new SupabaseStorage();
