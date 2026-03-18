import { REPORTER_NOTIFICATION_TOGGLES, type NotificationPrefs } from '@shared/notification.types';
import { ToggleRow } from './ToggleRow';

type ReporterNotificationSectionProps = {
  prefs: NotificationPrefs;
  disabled?: boolean;
  onToggle: (key: keyof NotificationPrefs, checked: boolean) => void;
};

export function ReporterNotificationSection({
  prefs,
  disabled = false,
  onToggle,
}: ReporterNotificationSectionProps) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">기자 알림</h2>
          <p className="mt-1 text-sm text-gray-600">
            내 기사 반응과 에디터 피드백을 빠르게 확인할 수 있어요.
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
            checked={prefs[item.key]}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(item.key, checked)}
          />
        ))}
      </div>
    </section>
  );
}
