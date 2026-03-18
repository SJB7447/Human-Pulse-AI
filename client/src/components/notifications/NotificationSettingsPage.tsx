import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Clock3, Loader2 } from 'lucide-react';
import {
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

export function NotificationSettingsPage({ userId, role }: NotificationSettingsPageProps) {
  const reporterMode = role === 'reporter' || role === 'journalist';
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [warnOpen, setWarnOpen] = useState(false);
  const [pendingReporterToggle, setPendingReporterToggle] = useState<boolean | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const result = await DBService.getNotificationPrefs();
        if (mounted) {
          setPrefs(result.prefs);
        }
      } catch (error: any) {
        if (mounted) {
          toast({
            title: '알림 설정을 불러오지 못했어요',
            description: error?.message || '잠시 후 다시 시도해 주세요.',
            variant: 'destructive',
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
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
  }, [toast]);

  const statusLabel = useMemo(() => {
    if (saveState === 'saving') return '저장 중...';
    if (saveState === 'saved') return '저장됨';
    if (saveState === 'error') return '저장 실패';
    return '';
  }, [saveState]);

  const commitPatch = async (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
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
    if (!prefs) return;
    void commitPatch({
      quiet_hours_start: prefs.quiet_hours_start,
      quiet_hours_end: prefs.quiet_hours_end,
    });
  };

  if (loading || !prefs) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          알림 설정을 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림 설정</h1>
          <p className="mt-1 text-sm text-gray-600">
            받고 싶은 알림만 선택하고 방해금지 시간을 조정할 수 있어요.
          </p>
        </div>
        {statusLabel ? (
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              saveState === 'error'
                ? 'bg-red-50 text-red-700'
                : saveState === 'saved'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>

      <PermissionStatusBanner userId={userId} />

      {READER_NOTIFICATION_TOGGLES.map((item) => (
        <section key={item.key} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
          </div>
          <ToggleRow
            title={item.title}
            description={item.description}
            checked={prefs[item.key]}
            onCheckedChange={(checked) => handleToggle(item.key, checked)}
          />
        </section>
      ))}

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
                setPrefs((prev) => (prev ? { ...prev, quiet_hours_start: event.target.value } : prev))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">종료</label>
            <Input
              type="time"
              value={prefs.quiet_hours_end}
              onChange={(event) =>
                setPrefs((prev) => (prev ? { ...prev, quiet_hours_end: event.target.value } : prev))
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
