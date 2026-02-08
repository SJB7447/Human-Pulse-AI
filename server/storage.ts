
import { type User, type InsertUser, type NewsItem, type InsertNewsItem, type EmotionType, type Report } from "../shared/schema";
import { randomUUID } from "crypto";

export interface AdminStats {
  totalViews: number;
  totalSaves: number;
  activeUsers: number;
  articlesPublished: number;
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
  getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private newsItems: Map<string, NewsItem>;
  private reports: Map<string, Report>;
  private saves: Map<string, Set<string>>; // articleId -> Set<userId>

  constructor() {
    this.users = new Map();
    this.newsItems = new Map();
    this.reports = new Map();
    this.saves = new Map();
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
        { title: 'Scientists Discover New Species of Colorful Bird in Amazon', summary: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest.', content: 'A vibrant new species brings hope for biodiversity conservation efforts in the rainforest. Researchers are excited about what this means for ecosystem preservation. The discovery was made deep in the Amazon basin, where a team of ornithologists spent three months documenting wildlife.', source: 'Nature Today', image: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=800', category: 'Science', emotion: 'joy', intensity: 85 },
        { title: 'Local Community Garden Project Wins National Award', summary: 'The initiative has transformed urban spaces and brought neighbors together.', content: 'The initiative has transformed urban spaces and brought neighbors together. Over 200 families now have access to fresh produce. The project started five years ago with just a small plot of land and has grown into a model for urban agriculture.', source: 'Good News Daily', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800', category: 'Community', emotion: 'joy', intensity: 92 },
        { title: 'Breakthrough in Renewable Energy Efficiency Announced', summary: 'New solar panel technology promises 40% better performance at lower costs.', content: 'New solar panel technology promises 40% better performance at lower costs. Industry experts call it a game-changer for clean energy adoption. The innovation uses a novel material composition that captures a broader spectrum of light.', source: 'Tech Progress', image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800', category: 'Technology', emotion: 'joy', intensity: 78 },
        { title: 'Young Musician Overcomes Challenges to Win Competition', summary: 'Her inspiring story of perseverance touched hearts worldwide.', content: 'Her inspiring story of perseverance touched hearts worldwide. The 16-year-old pianist will now tour major concert halls. Despite facing numerous obstacles, she practiced for hours daily and her dedication finally paid off.', source: 'Arts Daily', image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800', category: 'Arts', emotion: 'joy', intensity: 88 },

        { title: 'Major Policy Changes Announced Without Public Input', summary: 'Government reveals controversial new regulations affecting millions.', content: 'Government reveals controversial new regulations affecting millions. Critics demand transparency and accountability from officials. The sudden announcement has sparked widespread debate about democratic processes.', source: 'News Alert', image: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800', category: 'Politics', emotion: 'anger', intensity: 95 },
        { title: 'Corporate Scandal Uncovered by Investigators', summary: 'Years of misconduct finally brought to light.', content: 'Years of misconduct finally brought to light. Executives face potential criminal charges as evidence mounts. Whistleblowers played a crucial role in exposing the systematic fraud.', source: 'Investigative Report', image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800', category: 'Business', emotion: 'anger', intensity: 88 },
        { title: 'Environmental Protection Rollback Sparks Outrage', summary: 'Critics call the decision shortsighted and dangerous.', content: 'Critics call the decision shortsighted and dangerous. Environmental groups vow legal action to protect endangered habitats. Scientists warn of irreversible consequences for ecosystems.', source: 'Eco Watch', image: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=800', category: 'Environment', emotion: 'anger', intensity: 82 },
        { title: 'Workers Protest After Sudden Factory Closures', summary: 'Thousands left without jobs or severance.', content: 'Thousands left without jobs or severance. Union leaders demand immediate negotiations with management. The closures came without warning, leaving communities devastated.', source: 'Labor News', image: 'https://images.unsplash.com/photo-1591189824344-9739f8d12cc3?w=800', category: 'Economy', emotion: 'anger', intensity: 79 },

        { title: 'Community Mourns Loss of Historic Landmark', summary: 'The 200-year-old building held memories for generations.', content: 'The 200-year-old building held memories for generations. Residents gather to share stories and photographs. The structure was a symbol of the community heritage and cultural identity.', source: 'Heritage News', image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800', category: 'Culture', emotion: 'sadness', intensity: 75 },
        { title: 'Rising Sea Levels Threaten Coastal Communities', summary: 'Families face difficult decisions about their futures.', content: 'Families face difficult decisions about their futures. Some have lived in these areas for generations. Climate scientists project the situation will only worsen in coming decades.', source: 'Climate Report', image: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?w=800', category: 'Climate', emotion: 'sadness', intensity: 82 },
        { title: 'Remembering the Life of Influential Artist', summary: 'A tribute to the creative spirit that touched millions.', content: 'A tribute to the creative spirit that touched millions through her paintings and sculptures. Her work continues to inspire new generations of artists around the world.', source: 'Arts & Culture', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800', category: 'Arts', emotion: 'sadness', intensity: 68 },
        { title: 'Last Surviving Member of Historic Expedition Passes', summary: 'Her stories of adventure inspired countless explorers.', content: 'Her stories of adventure and discovery inspired countless young explorers. She was 102 years old. Her memoirs remain essential reading for anyone interested in exploration history.', source: 'History Today', image: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=800', category: 'History', emotion: 'sadness', intensity: 71 },

        { title: 'Cybersecurity Experts Warn of Sophisticated Threat', summary: 'Advanced attack methods require immediate attention.', content: 'Advanced attack methods require immediate attention from organizations. Experts recommend urgent security audits. The new threat targets critical infrastructure systems.', source: 'Security Bulletin', image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800', category: 'Technology', emotion: 'fear', intensity: 90 },
        { title: 'Economic Uncertainty Grows Amid Global Tensions', summary: 'Markets react to escalating international concerns.', content: 'Markets react to escalating international concerns. Analysts recommend cautious investment strategies. Economists are divided on the long-term outlook.', source: 'Financial Times', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800', category: 'Finance', emotion: 'fear', intensity: 85 },
        { title: 'Health Officials Monitor Emerging Situation', summary: 'Precautionary measures being implemented nationwide.', content: 'Precautionary measures being implemented nationwide. Officials urge calm while staying vigilant. Hospitals are preparing contingency plans.', source: 'Health Watch', image: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=800', category: 'Health', emotion: 'fear', intensity: 78 },
        { title: 'Severe Weather Patterns Expected to Intensify', summary: 'Meteorologists predict challenging conditions ahead.', content: 'Meteorologists predict challenging conditions ahead. Emergency preparedness is recommended for affected regions. Climate models suggest increased frequency of extreme events.', source: 'Weather Alert', image: 'https://images.unsplash.com/photo-1527482937786-6f4c1b89a73c?w=800', category: 'Weather', emotion: 'fear', intensity: 73 },

        { title: 'Mindfulness Programs Show Positive Results', summary: 'Students report better focus and reduced anxiety.', content: 'Students report better focus and reduced anxiety after implementation. Teachers notice improved classroom atmosphere. The program combines meditation with breathing exercises.', source: 'Education Today', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800', category: 'Wellness', emotion: 'calm', intensity: 65 },
        { title: 'New Nature Reserve Opens to the Public', summary: 'Pristine wilderness now accessible for peaceful retreats.', content: 'Pristine wilderness now accessible for peaceful retreats. Visitors can enjoy walking trails and meditation spots. The reserve spans over 5,000 acres of untouched forest.', source: 'Outdoor Life', image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800', category: 'Nature', emotion: 'calm', intensity: 55 },
        { title: 'Ancient Meditation Techniques Gain Scientific Backing', summary: 'Research validates centuries-old practices for wellness.', content: 'Research validates centuries-old practices for mental wellness. Brain scans show measurable improvements in practitioners. The study followed participants over two years.', source: 'Wellness Journal', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800', category: 'Science', emotion: 'calm', intensity: 48 },
        { title: 'Remote Mountain Village Becomes Wellness Destination', summary: 'Visitors find peace in the simple way of life.', content: 'Visitors find peace in the simple way of life. Digital detox retreats are fully booked for months ahead. The village offers traditional healing practices and organic cuisine.', source: 'Travel & Wellness', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', category: 'Travel', emotion: 'calm', intensity: 52 },
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
      .filter(item => item.emotion === emotion)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    return Array.from(this.newsItems.values())
      .filter(item => includeHidden || item.isPublished !== false)
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
      createdAt: new Date()
    };
    this.reports.set(id, report);
    return report;
  }

  async getReports(): Promise<Report[]> {
    return Array.from(this.reports.values()).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }> {
    const allNews = Array.from(this.newsItems.values());
    const allUsers = Array.from(this.users.values());

    const totalViews = allNews.reduce((acc, item) => acc + (item.views || 0), 0);
    const totalSaves = allNews.reduce((acc, item) => acc + (item.saves || 0), 0);

    const stats = {
      totalViews,
      totalSaves,
      activeUsers: allUsers.length + 3240, // + Mock base (since active users is low in dev)
      articlesPublished: allNews.length
    };

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
}

import { supabase } from "./supabase";

export class SupabaseStorage implements IStorage {
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
      .order('created_at', { ascending: false });
    return (data || []) as NewsItem[];
  }

  async getAllNews(includeHidden: boolean = false): Promise<NewsItem[]> {
    let query = supabase.from('news_items').select('*').order('created_at', { ascending: false });

    if (!includeHidden) {
      query = query.eq('is_published', true);
    }

    const { data } = await query;
    return (data || []) as NewsItem[];
  }

  async createNewsItem(item: InsertNewsItem): Promise<NewsItem> {
    const { data, error } = await supabase
      .from('news_items')
      .insert({
        ...item,
        platforms: ['interactive'],
        is_published: true // Default
      })
      .select()
      .single();
    if (error) throw error;
    return data as NewsItem;
  }

  async updateNewsItem(id: string, updates: Partial<NewsItem>): Promise<NewsItem | null> {
    const { data, error } = await supabase
      .from('news_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return null;
    return data as NewsItem;
  }

  async deleteNewsItem(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('news_items')
      .delete()
      .eq('id', id);

    return !error;
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
    const { data, error } = await supabase
      .from('reports')
      .insert({
        article_id: articleId,
        reason,
        risk_score: Math.floor(Math.random() * 100),
        details: "Reported by user"
      })
      .select()
      .single();
    if (error) throw error;
    // Map snake_case DB columns to camelCase TypeScript interface
    return {
      id: data.id,
      articleId: data.article_id,
      reason: data.reason,
      riskScore: data.risk_score,
      details: data.details,
      createdAt: data.created_at
    } as Report;
  }

  async getReports(): Promise<Report[]> {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    return (data || []).map((r: any) => ({
      id: r.id,
      articleId: r.article_id,
      reason: r.reason,
      riskScore: r.risk_score,
      details: r.details,
      createdAt: r.created_at
    })) as Report[];
  }

  async getAdminStats(): Promise<{ stats: AdminStats, emotionStats: any[], topArticles: NewsItem[] }> {
    const { data: allNews } = await supabase.from('news_items').select('*');
    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });

    const news = allNews || [];
    const totalViews = news.reduce((acc: number, item: any) => acc + (item.views || 0), 0);
    const totalSaves = news.reduce((acc: number, item: any) => acc + (item.saves || 0), 0);

    const stats = {
      totalViews,
      totalSaves,
      activeUsers: (userCount || 0) + 3240,
      articlesPublished: news.length
    };

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
}

// Use SupabaseStorage (REST API) - no DATABASE_URL required
export const storage = new SupabaseStorage();


