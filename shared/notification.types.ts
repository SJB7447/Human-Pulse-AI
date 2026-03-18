export type LegacyNotificationType =
  | "new_news"
  | "new_comment"
  | "admin_action"
  | "article_publish";

export type ReaderNotificationType =
  | "breaking"
  | "emotion"
  | "keyword"
  | "digest";

export type ReporterNotificationType =
  | "reporter_comment"
  | "reporter_reply"
  | "reporter_share_spike"
  | "reporter_view_milestone"
  | "reporter_article_published"
  | "reporter_edit_requested"
  | "reporter_weekly_summary";

export type AdminNotificationType =
  | "admin_report"
  | "admin_new_reporter"
  | "admin_signup_spike"
  | "admin_push_fail"
  | "admin_edge_error"
  | "admin_daily_stats"
  | "admin_keyword_abuse";

export type NotificationType =
  | LegacyNotificationType
  | ReaderNotificationType
  | ReporterNotificationType
  | AdminNotificationType;

export type NotificationSettingsRole = "general" | "reporter" | "admin";

export interface NotificationPrefs {
  breaking: boolean;
  emotion: boolean;
  keyword: boolean;
  digest: boolean;
  reporter_comment: boolean;
  reporter_reply: boolean;
  reporter_share_spike: boolean;
  reporter_view_milestone: boolean;
  reporter_article_published: boolean;
  reporter_edit_requested: boolean;
  reporter_weekly_summary: boolean;
  admin_report: boolean;
  admin_new_reporter: boolean;
  admin_signup_spike: boolean;
  admin_push_fail: boolean;
  admin_edge_error: boolean;
  admin_daily_stats: boolean;
  admin_keyword_abuse: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export type NotificationPrefKey = keyof NotificationPrefs;

export const READER_NOTIFICATION_KEYS = [
  "breaking",
  "emotion",
  "keyword",
  "digest",
] as const satisfies readonly ReaderNotificationType[];

export const REPORTER_NOTIFICATION_KEYS = [
  "reporter_comment",
  "reporter_reply",
  "reporter_share_spike",
  "reporter_view_milestone",
  "reporter_article_published",
  "reporter_edit_requested",
  "reporter_weekly_summary",
] as const satisfies readonly ReporterNotificationType[];

export const ADMIN_NOTIFICATION_KEYS = [
  "admin_report",
  "admin_new_reporter",
  "admin_signup_spike",
  "admin_push_fail",
  "admin_edge_error",
  "admin_daily_stats",
  "admin_keyword_abuse",
] as const satisfies readonly AdminNotificationType[];

export const BYPASS_QUIET_HOURS = [
  "breaking",
  "admin_report",
  "admin_push_fail",
  "admin_edge_error",
  "reporter_edit_requested",
] as const satisfies readonly NotificationType[];

export const QUIET_HOURS_DEFAULT = {
  start: "22:00",
  end: "07:00",
} as const;

export const NOTIFICATION_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  breaking: true,
  emotion: false,
  keyword: false,
  digest: false,
  reporter_comment: true,
  reporter_reply: true,
  reporter_share_spike: true,
  reporter_view_milestone: true,
  reporter_article_published: true,
  reporter_edit_requested: true,
  reporter_weekly_summary: true,
  admin_report: true,
  admin_new_reporter: true,
  admin_signup_spike: true,
  admin_push_fail: true,
  admin_edge_error: true,
  admin_daily_stats: true,
  admin_keyword_abuse: true,
  quiet_hours_start: QUIET_HOURS_DEFAULT.start,
  quiet_hours_end: QUIET_HOURS_DEFAULT.end,
};

export type NotificationToggleMeta<T extends NotificationType = NotificationType> = {
  key: T;
  title: string;
  description: string;
  badge?: string;
};

export const READER_NOTIFICATION_TOGGLES: NotificationToggleMeta<ReaderNotificationType>[] = [
  { key: "breaking", title: "속보 알림", description: "편집국이 속보로 발행한 기사를 즉시 받아봅니다." },
  { key: "emotion", title: "감정 맞춤 알림", description: "내가 고른 감정 흐름과 맞는 기사를 받아봅니다." },
  { key: "keyword", title: "키워드 알림", description: "등록한 키워드가 포함된 기사를 알려줍니다." },
  { key: "digest", title: "오늘의 다이제스트", description: "하루 한 번 주요 뉴스를 요약해서 전달합니다." },
];

export const REPORTER_NOTIFICATION_TOGGLES: NotificationToggleMeta<ReporterNotificationType>[] = [
  { key: "reporter_comment", title: "댓글 알림", description: "내 기사에 댓글이 달리면 즉시 알려줍니다." },
  { key: "reporter_reply", title: "답글 알림", description: "내 기사 댓글에 답글이 달리면 즉시 알려줍니다." },
  { key: "reporter_share_spike", title: "공유 급증 알림", description: "1시간 안에 공유가 급증한 기사를 바로 알려줍니다." },
  { key: "reporter_view_milestone", title: "조회수 마일스톤", description: "1만, 5만, 10만, 50만 조회수 돌파를 알려줍니다." },
  { key: "reporter_article_published", title: "기사 발행 완료", description: "에디터 승인 후 기사가 발행되면 즉시 알려줍니다." },
  { key: "reporter_edit_requested", title: "수정 요청", description: "에디터가 기사 수정을 요청하면 즉시 알려줍니다.", badge: "중요" },
  { key: "reporter_weekly_summary", title: "주간 성과 리포트", description: "매주 월요일 오전 9시에 주간 성과를 전달합니다." },
];

export const ADMIN_NOTIFICATION_GROUPS: Array<{
  id: "critical" | "operations" | "reports";
  title: string;
  description: string;
  badge?: string;
  keys: NotificationToggleMeta<AdminNotificationType>[];
}> = [
  {
    id: "critical",
    title: "긴급 알림",
    description: "방해금지 시간과 무관하게 즉시 발송됩니다.",
    badge: "긴급",
    keys: [
      { key: "admin_report", title: "콘텐츠 신고 알림", description: "단일 기사 신고가 5건 이상 누적되면 즉시 알려줍니다." },
      { key: "admin_push_fail", title: "푸시 발송 실패", description: "푸시 실패율이 10%를 넘으면 즉시 알려줍니다." },
      { key: "admin_edge_error", title: "Edge Function 오류", description: "Edge Function 5xx가 3회 연속 발생하면 즉시 알려줍니다." },
    ],
  },
  {
    id: "operations",
    title: "운영 알림",
    description: "운영 이상 징후와 주요 흐름을 모니터링합니다.",
    keys: [
      { key: "admin_new_reporter", title: "기자 신규 가입", description: "기자 계정 가입 신청이 들어오면 알려줍니다." },
      { key: "admin_signup_spike", title: "가입자 급증", description: "1시간 안에 신규 가입이 50명을 넘으면 알려줍니다." },
      { key: "admin_keyword_abuse", title: "키워드 어뷰징", description: "동일 키워드 등록이 비정상적으로 늘어나면 알려줍니다." },
    ],
  },
  {
    id: "reports",
    title: "정기 리포트",
    description: "매일 오전 8시에 운영 리포트를 전달합니다.",
    keys: [
      { key: "admin_daily_stats", title: "일일 운영 리포트", description: "일일 운영 지표를 요약해서 전달합니다." },
    ],
  },
];

const PREFERENCE_KEY_BY_TYPE: Partial<Record<NotificationType, NotificationPrefKey>> = {
  new_news: "breaking",
  breaking: "breaking",
  emotion: "emotion",
  keyword: "keyword",
  digest: "digest",
  new_comment: "reporter_comment",
  reporter_comment: "reporter_comment",
  reporter_reply: "reporter_reply",
  reporter_share_spike: "reporter_share_spike",
  reporter_view_milestone: "reporter_view_milestone",
  article_publish: "reporter_article_published",
  reporter_article_published: "reporter_article_published",
  reporter_edit_requested: "reporter_edit_requested",
  reporter_weekly_summary: "reporter_weekly_summary",
  admin_report: "admin_report",
  admin_new_reporter: "admin_new_reporter",
  admin_signup_spike: "admin_signup_spike",
  admin_push_fail: "admin_push_fail",
  admin_edge_error: "admin_edge_error",
  admin_daily_stats: "admin_daily_stats",
  admin_keyword_abuse: "admin_keyword_abuse",
};

export function resolveNotificationPrefKey(type: NotificationType): NotificationPrefKey | null {
  return PREFERENCE_KEY_BY_TYPE[type] || null;
}

export function normalizeNotificationRole(value: unknown): NotificationSettingsRole {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "admin" || raw === "administrator") return "admin";
  if (raw === "reporter" || raw === "journalist" || raw.includes("기자")) return "reporter";
  return "general";
}

export function createDefaultNotificationPrefs(): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS };
}

export function getAllowedNotificationKeys(role: NotificationSettingsRole): NotificationPrefKey[] {
  if (role === "admin") {
    return [...ADMIN_NOTIFICATION_KEYS, "quiet_hours_start", "quiet_hours_end"];
  }
  if (role === "reporter") {
    return [
      ...READER_NOTIFICATION_KEYS,
      ...REPORTER_NOTIFICATION_KEYS,
      "quiet_hours_start",
      "quiet_hours_end",
    ];
  }
  return [...READER_NOTIFICATION_KEYS, "quiet_hours_start", "quiet_hours_end"];
}

export function sanitizeNotificationPrefsPatch(
  patch: Partial<NotificationPrefs>,
  role: NotificationSettingsRole,
): Partial<NotificationPrefs> {
  const allowed = new Set<NotificationPrefKey>(getAllowedNotificationKeys(role));
  const next: Partial<NotificationPrefs> = {};

  for (const key of Object.keys(patch) as NotificationPrefKey[]) {
    if (!allowed.has(key)) continue;
    if (key === "quiet_hours_start" || key === "quiet_hours_end") {
      const value = String(patch[key] || "").trim();
      if (NOTIFICATION_TIME_PATTERN.test(value)) {
        next[key] = value;
      }
      continue;
    }

    next[key] = Boolean(patch[key]);
  }

  return next;
}

export function shouldBypassQuietHours(type: NotificationType): boolean {
  return (BYPASS_QUIET_HOURS as readonly string[]).includes(type);
}
