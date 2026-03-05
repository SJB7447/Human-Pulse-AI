import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const emotionTypes = ['vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum'] as const;
export type EmotionType = typeof emotionTypes[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  googleId: text("google_id").unique(),
});

export const newsItems = pgTable("news_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  content: text("content"),
  source: text("source").notNull(),
  image: text("image"),
  category: text("category"),
  emotion: text("emotion").notNull().$type<EmotionType>(),
  intensity: integer("intensity").notNull().default(50),
  views: integer("views").default(0).notNull(),
  saves: integer("saves").default(0).notNull(),
  platforms: text("platforms").array().default(['interactive']),
  isPublished: boolean("is_published").default(true).notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull(), // No foreign key constraint for simplicity or add .references(() => newsItems.id)
  reason: text("reason").notNull(),
  details: text("details"),
  riskScore: integer("risk_score").default(0),
  status: varchar("status", { length: 32 }).notNull().default("reported"),
  sanctionType: varchar("sanction_type", { length: 32 }).notNull().default("none"),
  resolution: text("resolution"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const articleReviews = pgTable("article_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().unique(),
  completed: boolean("completed").notNull().default(false),
  issues: text("issues").array().notNull().default(sql`ARRAY[]::text[]`),
  memo: text("memo").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userConsents = pgTable("user_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  termsRequired: boolean("terms_required").notNull().default(false),
  privacyRequired: boolean("privacy_required").notNull().default(false),
  marketingOptional: boolean("marketing_optional").notNull().default(false),
  termsVersion: varchar("terms_version", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminActionLogs = pgTable("admin_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: text("actor_id"),
  actorRole: varchar("actor_role", { length: 32 }).notNull().default("admin"),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("target_type", { length: 32 }).notNull().default("article"),
  targetId: varchar("target_id").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userInsights = pgTable("user_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  articleId: text("article_id").notNull(),
  originalTitle: text("original_title").notNull(),
  userComment: text("user_comment").notNull(),
  userEmotion: text("user_emotion").notNull().$type<EmotionType>(),
  userFeelingText: text("user_feeling_text").notNull().default(""),
  selectedTags: text("selected_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userComposedArticles = pgTable("user_composed_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  sourceArticleId: text("source_article_id").notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceUrl: text("source_url"),
  sourceEmotion: text("source_emotion").notNull().default("spectrum"),
  sourceCategory: text("source_category").notNull().default("General"),
  userOpinion: text("user_opinion").notNull(),
  extraRequest: text("extra_request").notNull().default(""),
  requestedReferences: text("requested_references").array().notNull().default(sql`ARRAY[]::text[]`),
  generatedTitle: text("generated_title").notNull(),
  generatedSummary: text("generated_summary").notNull(),
  generatedContent: text("generated_content").notNull(),
  referenceLinks: text("reference_links").array().notNull().default(sql`ARRAY[]::text[]`),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  submissionStatus: varchar("submission_status", { length: 16 }).notNull().default("pending"),
  moderationMemo: text("moderation_memo").notNull().default(""),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const guestSessions = pgTable("guest_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestId: varchar("guest_id", { length: 128 }).notNull().unique(),
  lastMood: text("last_mood").notNull().default("spectrum").$type<EmotionType>(),
  lastMoodScore: integer("last_mood_score").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emotionLogs = pgTable("emotion_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  emotion: text("emotion").notNull().$type<EmotionType>(),
  moodScore: integer("mood_score").notNull().default(0),
  context: text("context").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const guestEmotionLogs = pgTable("guest_emotion_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestId: varchar("guest_id", { length: 128 }).notNull(),
  emotion: text("emotion").notNull().$type<EmotionType>(),
  moodScore: integer("mood_score").notNull().default(0),
  context: text("context").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guestId: varchar("guest_id", { length: 128 }),
  userId: text("user_id"),
  event: varchar("event", { length: 128 }).notNull(),
  page: text("page"),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  googleId: true,
});

export const insertNewsItemSchema = createInsertSchema(newsItems).omit({
  id: true,
  createdAt: true,
  views: true,
  saves: true,
  platforms: true
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  riskScore: true,
  reviewedAt: true,
});

export const insertArticleReviewSchema = createInsertSchema(articleReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({
  id: true,
  createdAt: true,
});

export const insertAdminActionLogSchema = createInsertSchema(adminActionLogs).omit({
  id: true,
  createdAt: true,
});

export const insertUserInsightSchema = createInsertSchema(userInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserComposedArticleSchema = createInsertSchema(userComposedArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGuestSessionSchema = createInsertSchema(guestSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmotionLogSchema = createInsertSchema(emotionLogs).omit({
  id: true,
  createdAt: true,
});

export const insertGuestEmotionLogSchema = createInsertSchema(guestEmotionLogs).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertNewsItem = z.infer<typeof insertNewsItemSchema>;
export type NewsItem = typeof newsItems.$inferSelect;

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

export type InsertArticleReview = z.infer<typeof insertArticleReviewSchema>;
export type ArticleReview = typeof articleReviews.$inferSelect;

export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;
export type UserConsent = typeof userConsents.$inferSelect;

export type InsertAdminActionLog = z.infer<typeof insertAdminActionLogSchema>;
export type AdminActionLog = typeof adminActionLogs.$inferSelect;

export type InsertUserInsight = z.infer<typeof insertUserInsightSchema>;
export type UserInsight = typeof userInsights.$inferSelect;

export type InsertUserComposedArticle = z.infer<typeof insertUserComposedArticleSchema>;
export type UserComposedArticle = typeof userComposedArticles.$inferSelect;

export type InsertGuestSession = z.infer<typeof insertGuestSessionSchema>;
export type GuestSession = typeof guestSessions.$inferSelect;

export type InsertEmotionLog = z.infer<typeof insertEmotionLogSchema>;
export type EmotionLog = typeof emotionLogs.$inferSelect;

export type InsertGuestEmotionLog = z.infer<typeof insertGuestEmotionLogSchema>;
export type GuestEmotionLog = typeof guestEmotionLogs.$inferSelect;

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
