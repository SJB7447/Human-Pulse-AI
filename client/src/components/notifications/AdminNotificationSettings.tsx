import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, BellRing, Siren, UserRoundPlus } from 'lucide-react';
import { ADMIN_NOTIFICATION_GROUPS, type NotificationPrefs } from '@shared/notification.types';
import { useToast } from '@/hooks/use-toast';
import { DBService } from '@/services/DBService';
import { ToggleRow } from './ToggleRow';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const ADMIN_ICONS = {
  admin_report: AlertTriangle,
  admin_new_reporter: UserRoundPlus,
  admin_signup_spike: BellRing,
  admin_push_fail: Siren,
  admin_edge_error: Siren,
  admin_daily_stats: BarChart3,
  admin_keyword_abuse: AlertTriangle,
} as const;

export function AdminNotificationSettings() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const result = await DBService.getNotificationPrefs();
        if (mounted) setPrefs(result.prefs);
      } catch (error: any) {
        if (mounted) {
          toast({
            title: '관리자 알림 설정을 불러오지 못했어요',
            description: error?.message || '잠시 후 다시 시도해 주세요.',
            variant: 'destructive',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
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
    setPrefs({ ...prefs, ...patch });
    setSaveState('saving');

    try {
      const result = await DBService.updateNotificationPrefs(patch);
      setPrefs(result.prefs);
      setSaveState('saved');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    } catch (error: any) {
      setPrefs(snapshot);
      setSaveState('error');
      toast({
        title: '관리자 알림 설정 저장에 실패했어요',
        description: error?.message || '변경 사항을 저장하지 못했어요.',
        variant: 'destructive',
      });
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600">
        <div className="flex items-center gap-2 text-sm">
          관리자 알림 설정을 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">관리자 알림 설정</h1>
          <p className="mt-1 text-sm text-gray-600">
            운영 이상 징후와 정기 리포트 알림을 역할에 맞게 조정할 수 있어요.
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

      {ADMIN_NOTIFICATION_GROUPS.map((group) => (
        <section key={group.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{group.title}</h2>
                {group.badge ? (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-red-700">
                    {group.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-600">{group.description}</p>
            </div>
            {group.id === 'critical' ? <AlertTriangle className="h-5 w-5 text-red-500" /> : null}
          </div>

          <div className="mt-4 space-y-3">
            {group.keys.map((item) => (
              <ToggleRow
                key={item.key}
                title={item.title}
                description={item.description}
                icon={ADMIN_ICONS[item.key]}
                checked={prefs[item.key]}
                onCheckedChange={(checked) =>
                  void commitPatch({ [item.key]: checked } as Partial<NotificationPrefs>)
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
