import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const emotionTypes = ['joy', 'anger', 'sadness', 'fear', 'calm'] as const;
export type EmotionType = typeof emotionTypes[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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
  riskScore: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertNewsItem = z.infer<typeof insertNewsItemSchema>;
export type NewsItem = typeof newsItems.$inferSelect;

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;
