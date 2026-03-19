import { BarChart3, BellDot, FileCheck2, MessageCircleMore, PencilLine, Reply, Share2 } from 'lucide-react';
import { REPORTER_NOTIFICATION_TOGGLES, type NotificationPrefs } from '@shared/notification.types';
import { ToggleRow } from './ToggleRow';

type ReporterNotificationSectionProps = {
  prefs: NotificationPrefs;
  disabled?: boolean;
  onToggle: (key: keyof NotificationPrefs, checked: boolean) => void;
};

const REPORTER_ICONS = {
  reporter_comment: MessageCircleMore,
  reporter_reply: Reply,
  reporter_share_spike: Share2,
  reporter_view_milestone: BarChart3,
  reporter_article_published: FileCheck2,
  reporter_edit_requested: PencilLine,
  reporter_weekly_summary: BellDot,
} as const;

export function ReporterNotificationSection({
  prefs,
  disabled = false,
  onToggle,
}: ReporterNotificationSectionProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">기자단 알림</h2>
          <p className="mt-1 text-sm text-gray-600">
            내 기사 반응과 운영 피드백을 빠르게 확인할 수 있도록 기자 전용 항목만 모았습니다.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-white">
          REPORTER
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {REPORTER_NOTIFICATION_TOGGLES.map((item) => (
          <ToggleRow
            key={item.key}
            title={item.title}
            description={item.description}
            badge={item.badge}
            icon={REPORTER_ICONS[item.key]}
            checked={prefs[item.key]}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(item.key, checked)}
          />
        ))}
      </div>
    </section>
  );
}
