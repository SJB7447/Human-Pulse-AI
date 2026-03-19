import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BookOpenText,
  Clock3,
  Flame,
  KeyRound,
  Newspaper,
} from 'lucide-react';
import {
  createDefaultNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  READER_NOTIFICATION_KEYS,
  READER_NOTIFICATION_TOGGLES,
  type NotificationPrefs,
  type NotificationSettingsRole,
} from '@shared/notification.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { DBService } from '@/services/DBService';
import { PermissionStatusBanner } from './PermissionStatusBanner';
import { ReporterNotificationSection } from './ReporterNotificationSection';
import { ToggleRow } from './ToggleRow';
import { WarnIfOffModal } from './WarnIfOffModal';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type NotificationSettingsPageProps = {
  userId: string;
  role: NotificationSettingsRole | 'journalist';
};

const READER_ICONS = {
  breaking: Newspaper,
  emotion: Flame,
  keyword: KeyRound,
  digest: BookOpenText,
} as const;

export function NotificationSettingsPage({ userId, role }: NotificationSettingsPageProps) {
  const reporterMode = role === 'reporter' || role === 'journalist';
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => createDefaultNotificationPrefs());
  const [hydrating, setHydrating] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [warnOpen, setWarnOpen] = useState(false);
  const [pendingReporterToggle, setPendingReporterToggle] = useState<boolean | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setHydrating(true);
      try {
        const result = await Promise.race([
          DBService.getNotificationPrefs(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('알림 설정 응답이 지연되고 있습니다.')), 4000);
          }),
        ]);

        if (mounted) {
          setPrefs(result.prefs);
        }
      } catch {
        // Keep rendering defaults instead of blocking the whole card with a loader.
      } finally {
        if (mounted) {
          setHydrating(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (saveState === 'saving') return '저장 중...';
    if (saveState === 'saved') return '저장됨';
    if (saveState === 'error') return '저장 실패';
    if (hydrating) return '동기화 중...';
    return '';
  }, [hydrating, saveState]);

  const commitPatch = async (patch: Partial<NotificationPrefs>) => {
    const snapshot = prefs;
    const next = { ...prefs, ...patch };

    setPrefs(next);
    setSaveState('saving');

    try {
      const result = await DBService.updateNotificationPrefs(patch);
      setPrefs(result.prefs);
      setSaveState('saved');
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    } catch (error: any) {
      setPrefs(snapshot);
      setSaveState('error');
      toast({
        title: '알림 설정 저장에 실패했어요',
        description: error?.message || '변경 사항을 저장하지 못했어요.',
        variant: 'destructive',
      });
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  const handleToggle = (key: keyof NotificationPrefs, checked: boolean) => {
    if (key === 'reporter_edit_requested' && !checked) {
      setPendingReporterToggle(false);
      setWarnOpen(true);
      return;
    }
    void commitPatch({ [key]: checked } as Partial<NotificationPrefs>);
  };

  const handleQuietHoursCommit = () => {
    void commitPatch({
      quiet_hours_start: prefs.quiet_hours_start,
      quiet_hours_end: prefs.quiet_hours_end,
    });
  };

  const globalEnabled = useMemo(() => {
    const keys = reporterMode
      ? [...READER_NOTIFICATION_KEYS, 'reporter_comment', 'reporter_reply', 'reporter_share_spike', 'reporter_view_milestone', 'reporter_article_published', 'reporter_edit_requested', 'reporter_weekly_summary'] as const
      : READER_NOTIFICATION_KEYS;
    return keys.some((key) => Boolean(prefs[key]));
  }, [prefs, reporterMode]);

  const activeReaderCount = useMemo(() => {
    return READER_NOTIFICATION_KEYS.filter((key) => prefs[key]).length;
  }, [prefs]);

  const handleGlobalToggle = (checked: boolean) => {
    const patch: Partial<NotificationPrefs> = {};

    READER_NOTIFICATION_KEYS.forEach((key) => {
      patch[key] = checked ? DEFAULT_NOTIFICATION_PREFS[key] : false;
    });

    if (reporterMode) {
      patch.reporter_comment = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_comment : false;
      patch.reporter_reply = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_reply : false;
      patch.reporter_share_spike = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_share_spike : false;
      patch.reporter_view_milestone = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_view_milestone : false;
      patch.reporter_article_published = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_article_published : false;
      patch.reporter_edit_requested = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_edit_requested : false;
      patch.reporter_weekly_summary = checked ? DEFAULT_NOTIFICATION_PREFS.reporter_weekly_summary : false;
    }

    void commitPatch(patch);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림 설정</h1>
          <p className="mt-1 text-sm text-gray-600">
            HueBrief에서 받고 싶은 알림만 선택하고 방해금지 시간도 함께 조정할 수 있어요.
          </p>
        </div>
        {statusLabel ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {statusLabel}
          </span>
        ) : null}
      </div>

      <PermissionStatusBanner userId={userId} />

      <section className="rounded-[28px] border border-[#E3E8F4] bg-white p-5 shadow-[0_18px_40px_rgba(43,51,69,0.06)]">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#E8ECF8] bg-[#F7F9FF] px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF1FF] text-[#4F46FF]">
              {globalEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-base font-semibold text-gray-900">알림 활성화</p>
              <p className="mt-1 text-sm text-gray-600">
                {globalEnabled
                  ? `현재 기본 알림 ${activeReaderCount}개가 켜져 있습니다.`
                  : '현재 모든 알림이 꺼져 있습니다.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={globalEnabled}
            onClick={() => handleGlobalToggle(!globalEnabled)}
            className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors ${
              globalEnabled ? 'bg-[#4F46FF]' : 'bg-[#D8DEEC]'
            }`}
          >
            <span
              className={`inline-block h-7 w-7 rounded-full bg-white shadow-sm transition-transform ${
                globalEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {READER_NOTIFICATION_TOGGLES.map((item) => (
            <ToggleRow
              key={item.key}
              title={item.title}
              description={item.description}
              icon={READER_ICONS[item.key]}
              checked={prefs[item.key]}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-gray-400" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">방해금지 시간</h2>
            <p className="mt-1 text-sm text-gray-600">
              기본값은 22:00부터 07:00까지이며, 긴급 알림은 예외로 발송됩니다.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">시작</label>
            <Input
              type="time"
              value={prefs.quiet_hours_start}
              onChange={(event) =>
                setPrefs((prev) => ({ ...prev, quiet_hours_start: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">종료</label>
            <Input
              type="time"
              value={prefs.quiet_hours_end}
              onChange={(event) =>
                setPrefs((prev) => ({ ...prev, quiet_hours_end: event.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={handleQuietHoursCommit}>
            방해금지 시간 저장
          </Button>
        </div>
      </section>

      {reporterMode ? (
        <ReporterNotificationSection prefs={prefs} onToggle={(key, checked) => handleToggle(key, checked)} />
      ) : null}

      <WarnIfOffModal
        open={warnOpen}
        onCancel={() => {
          setWarnOpen(false);
          setPendingReporterToggle(null);
        }}
        onConfirm={() => {
          setWarnOpen(false);
          if (pendingReporterToggle === false) {
            void commitPatch({ reporter_edit_requested: false });
          }
          setPendingReporterToggle(null);
        }}
      />
    </div>
  );
}
