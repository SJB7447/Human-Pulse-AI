
import { type User, type InsertUser, type NewsItem, type InsertNewsItem, type EmotionType, type Report, type ArticleReview, type InsertUserConsent, type UserConsent, type AdminActionLog } from "../shared/schema.js";
import { randomUUID } from "crypto";

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
  getNewsByEmotion(emotion: EmotionType): Promise<NewsItem[]>;
  getAllNews(includeHidden?: boolean): Promise<NewsItem[]>;
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
}

const REVIEW_SLA_TARGET_HOURS = 24;

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

  constructor() {
    this.users = new Map();
    this.newsItems = new Map();
    this.reports = new Map();
    this.saves = new Map();
    this.articleReviews = new Map();
    this.adminActionLogs = new Map();
    this.userConsents = new Map();
    this.seedNews();
  }

  private seedNews() {
    const seedData: Array<{
      title: string;
      summary: string;
      content: string;
      source: string;
      image: string;
      category: string;
      emotion: EmotionType;
      intensity: number;
    }> = [
        { title: 'Scientists Discover New Species of Colorful Bird in Amazon', summary: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest.', content: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest. Researchers are excited about what this means for ecosystem preservation. The discovery was made deep in the Amazon basin, where a team of ornithologists spent three months documenting wildlife.', source: 'Nature Today', image: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=800', category: 'Science', emotion: 'vibrance', intensity: 85 },
        { title: 'Local Community Garden Project Wins National Award', summary: 'The initiative has transformed urban spaces and brought neighbors together.', content: 'The initiative has transformed urban spaces and brought neighbors together. Over 200 families now have access to fresh produce. The project started five years ago with just a small plot of land and has grown into a model for urban agriculture.', source: 'Good News Daily', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800', category: 'Community', emotion: 'vibrance', intensity: 92 },
        { title: 'Breakthrough in Renewable Energy Efficiency Announced', summary: 'New solar panel technology promises 40% better performance at lower costs.', content: 'New solar panel technology promises 40% better performance at lower costs. Industry experts call it a game-changer for clean energy adoption. The innovation uses a novel material composition that captures a broader spectrum of light.', source: 'Tech Progress', image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800', category: 'Technology', emotion: 'vibrance', intensity: 78 },
        { title: 'Young Musician Overcomes Challenges to Win Competition', summary: 'Her inspiring story of perseverance touched hearts worldwide.', content: 'Her inspiring story of perseverance touched hearts worldwide. The 16-year-old pianist will now tour major concert halls. Despite facing numerous obstacles, she practiced for hours daily and her dedication finally paid off.', source: 'Arts Daily', image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800', category: 'Arts', emotion: 'vibrance', intensity: 88 },

        { title: 'Major Policy Changes Announced Without Public Input', summary: 'Government reveals controversial new regulations affecting millions.', content: 'Government reveals controversial new regulations affecting millions. Critics demand transparency and accountability from officials. The sudden announcement has sparked widespread debate about democratic processes.', source: 'News Alert', image: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800', category: 'Politics', emotion: 'immersion', intensity: 95 },
        { title: 'Corporate Scandal Uncovered by Investigators', summary: 'Years of misconduct finally brought to light.', content: 'Years of misconduct finally brought to light. Executives face potential criminal charges as evidence mounts. Whistleblowers played a crucial role in exposing the systematic fraud.', source: 'Investigative Report', image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', category: 'Business', emotion: 'immersion', intensity: 88 },
        { title: 'Environmental Protection Rollback Sparks Outrage', summary: 'Critics call the decision shortsighted and dangerous.', content: 'Critics call the decision shortsighted and dangerous. Environmental groups vow legal action to protect endangered habitats. Scientists warn of irreversible consequences for ecosystems.', source: 'Eco Watch', image: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=800', category: 'Environment', emotion: 'immersion', intensity: 82 },
        { title: 'Workers Protest After Sudden Factory Closures', summary: 'Thousands left without jobs or severance.', content: 'Thousands left without jobs or severance. Union leaders demand immediate negotiations with management. The closures came without warning, leaving communities devastated.', source: 'Labor News', image: 'https://images.unsplash.com/photo-1591189824344-9739f8d12cc3?w=800', category: 'Economy', emotion: 'immersion', intensity: 79 },

        { title: 'Community Mourns Loss of Historic Landmark', summary: 'The 200-year-old building held memories for generations.', content: 'The 200-year-old building held memories for generations. Residents gather to share stories and photographs. The structure was a symbol of the community heritage and cultural identity.', source: 'Heritage News', image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800', category: 'Culture', emotion: 'clarity', intensity: 75 },
        { title: 'Rising Sea Levels Threaten Coastal Communities', summary: 'Families face difficult decisions about their futures.', content: 'Families face difficult decisions about their futures. Some have lived in these areas for generations. Climate scientists project the situation will only worsen in coming decades.', source: 'Climate Report', image: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800', category: 'Climate', emotion: 'clarity', intensity: 82 },
        { title: 'Remembering the Life of Influential Artist', summary: 'A tribute to the creative spirit that touched millions.', content: 'A tribute to the creative spirit that touched millions through her paintings and sculptures. Her work continues to inspire new generations of artists around the world.', source: 'Arts & Culture', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800', category: 'Arts', emotion: 'clarity', intensity: 68 },
        { title: 'Last Surviving Member of Historic Expedition Passes', summary: 'Her stories of adventure inspired countless explorers.', content: 'Her stories of adventure and discovery inspired countless young explorers. She was 102 years old. Her memoirs remain essential reading for anyone interested in exploration history.', source: 'History Today', image: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=800', category: 'History', emotion: 'clarity', intensity: 71 },

        { title: 'Cybersecurity Experts Warn of Sophisticated Threat', summary: 'Advanced attack methods require immediate attention.', content: 'Advanced attack methods require immediate attention from organizations. Experts recommend urgent security audits. The new threat targets critical infrastructure systems.', source: 'Security Bulletin', image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800', category: 'Technology', emotion: 'gravity', intensity: 90 },
        { title: 'Economic Uncertainty Grows Amid Global Tensions', summary: 'Markets react to escalating international concerns.', content: 'Markets react to escalating international concerns. Analysts recommend cautious investment strategies. Economists are divided on the long-term outlook.', source: 'Financial Times', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', category: 'Finance', emotion: 'gravity', intensity: 85 },
        { title: 'Health Officials Monitor Emerging Situation', summary: 'Precautionary measures being implemented nationwide.', content: 'Precautionary measures being implemented nationwide. Officials urge calm while staying vigilant. Hospitals are preparing contingency plans.', source: 'Health Watch', image: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=800', category: 'Health', emotion: 'gravity', intensity: 78 },
        { title: 'Severe Weather Patterns Expected to Intensify', summary: 'Meteorologists predict challenging conditions ahead.', content: 'Meteorologists predict challenging conditions ahead. Emergency preparedness is recommended for affected regions. Climate models suggest increased frequency of extreme events.', source: 'Weather Alert', image: 'https://images.unsplash.com/photo-1527482937786-6f4c1b89a73c?w=800', category: 'Weather', emotion: 'gravity', intensity: 73 },

        { title: 'Mindfulness Programs Show Positive Results', summary: 'Students report better focus and reduced anxiety.', content: 'Students report better focus and reduced anxiety after implementation. Teachers notice improved classroom atmosphere. The program combines meditation with breathing exercises.', source: 'Education Today', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800', category: 'Wellness', emotion: 'serenity', intensity: 65 },
        { title: 'New Nature Reserve Opens to the Public', summary: 'Pristine wilderness now accessible for peaceful retreats.', content: 'Pristine wilderness now accessible for peaceful retreats. Visitors can enjoy walking trails and meditation spots. The reserve spans over 5,000 acres of untouched forest.', source: 'Outdoor Life', image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', category: 'Nature', emotion: 'serenity', intensity: 55 },
        { title: 'Ancient Meditation Techniques Gain Scientific Backing', summary: 'Research validates centuries-old practices for wellness.', content: 'Research validates centuries-old practices for mental wellness. Brain scans show measurable improvements in practitioners. The study followed participants over two years.', source: 'Wellness Journal', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800', category: 'Science', emotion: 'serenity', intensity: 48 },
        { title: 'Remote Mountain Village Becomes Wellness Destination', summary: 'Visitors find peace in the simple way of life.', content: 'Visitors find peace in the simple way of life. Digital detox retreats are fully booked for months ahead. The village offers traditional healing practices and organic cuisine.', source: 'Travel & Wellness', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', category: 'Travel', emotion: 'serenity', intensity: 52 },
      ];

    seedData.forEach(item => {
      const id = randomUUID();
      const newsItem: NewsItem = {
        id,
        title: item.title,
        summary: item.summary,
        content: item.content,
        source: item.source,
        image: item.image,
        category: item.category,
        emotion: item.emotion,
        intensity: item.intensity,
        views: Math.floor(Math.random() * 5000) + 100, // Seed views
        saves: Math.floor(Math.random() * 500),         // Seed saves count (display only)
        platforms: ['interactive'],
        isPublished: true,
        authorId: null,
        authorName: null,
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 3),
      };
      this.newsItems.set(id, newsItem);
      // seed saves map randomly? No need, just use .saves property for display aggregation
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

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    return Array.from(this.newsItems.values())
      .filter(item => includeHidden || isPublishedVisible(item))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
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
}

import { supabase } from "./supabase.js";

export class SupabaseStorage implements IStorage {
  private fallbackNews: Map<string, NewsItem> = new Map();
  private fallbackReports: Map<string, Report> = new Map();
  private fallbackArticleReviews: Map<string, ArticleReview> = new Map();
  private fallbackAdminActionLogs: Map<string, AdminActionLog> = new Map();
  private fallbackUserConsents: Map<string, UserConsent> = new Map();

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
    return /relation .* does not exist|could not find the table|schema cache|article_reviews|user_consents|admin_action_logs/i.test(message);
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

  private mergeWithFallback(dbRows: NewsItem[]): NewsItem[] {
    const merged = new Map<string, NewsItem>();
    dbRows.forEach((row) => merged.set(String(row.id), row));
    this.fallbackNews.forEach((row, id) => merged.set(String(id), row));
    return Array.from(merged.values()).sort((a, b) => {
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
    const { data } = await supabase
      .from('news_items')
      .select('*')
      .eq('emotion', emotion)
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    const dbRows = (data || []) as NewsItem[];
    const merged = this.mergeWithFallback(dbRows);
    return merged.filter((row: any) => row.emotion === emotion && isPublishedVisible(row));
  }

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    let query = supabase.from('news_items').select('*').order('created_at', { ascending: false });

    if (!includeHidden) {
      query = query.eq('is_published', true);
    }

    const { data } = await query;
    const dbRows = (data || []) as NewsItem[];
    const merged = this.mergeWithFallback(dbRows);
    return merged.filter((row: any) => includeHidden || isPublishedVisible(row));
  }

  async createNewsItem(item: InsertNewsItem): Promise<NewsItem> {
    const safeAuthorId = String(item.authorId || "").trim().slice(0, 128);

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
        return fallback;
      }
      throw error;
    }
    return data as NewsItem;
  }

  async updateNewsItem(id: string, updates: Partial<NewsItem>): Promise<NewsItem | null> {
    if (this.fallbackNews.has(id)) {
      const current = this.fallbackNews.get(id)!;
      const updated = { ...current, ...updates };
      this.fallbackNews.set(id, updated as NewsItem);
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
      ...(updates.authorId !== undefined ? { author_id: updates.authorId } : {}),
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

    if (!error && data) return data as NewsItem;

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
    return fallbackUpdated;
  }

  async deleteNewsItem(id: string): Promise<boolean> {
    if (this.fallbackNews.has(id)) {
      this.fallbackNews.delete(id);
      return true;
    }

    const { error } = await supabase
      .from('news_items')
      .delete()
      .eq('id', id);
    if (!error) return true;

    const message = String((error as any)?.message || "");
    if (/row-level security|violates row-level security policy/i.test(message)) {
      this.fallbackNews.set(id, {
        ...(this.fallbackNews.get(id) || ({ id } as NewsItem)),
        id,
        isPublished: false,
      } as NewsItem);
      return true;
    }

    return false;
  }

  // Admin & Interaction Methods
  async incrementView(id: string): Promise<void> {
    const { data: item } = await supabase.from('news_items').select('views').eq('id', id).single();
    if (item) {
      await supabase.from('news_items').update({ views: (item.views || 0) + 1 }).eq('id', id);
    }
  }

  async toggleSave(id: string, userId: string): Promise<boolean> {
    const { data: item } = await supabase.from('news_items').select('saves').eq('id', id).single();
    if (!item) return false;
    await supabase.from('news_items').update({ saves: (item.saves || 0) + 1 }).eq('id', id);
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
    const { data: allNews } = await supabase.from('news_items').select('*');
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { data: reviewRows, error: reviewError } = await supabase.from('article_reviews').select('*');

    const news = allNews || [];
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

    // Emotion Stats
    const emCounts: Record<string, number> = {};
    news.forEach((item: any) => {
      emCounts[item.emotion] = (emCounts[item.emotion] || 0) + 1;
    });

    const emotionStats = Object.keys(emCounts).map(emotion => ({
      emotion,
      count: emCounts[emotion],
      percentage: news.length > 0 ? Math.round((emCounts[emotion] / news.length) * 100) : 0
    }));

    // Top Articles
    const topArticles = [...news]
      .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
      .slice(0, 3) as NewsItem[];

    return { stats, emotionStats, topArticles };
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
}

// Use SupabaseStorage (REST API) - no DATABASE_URL required
export const storage = new SupabaseStorage();
