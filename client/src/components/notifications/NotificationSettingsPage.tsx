import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  BookOpenText,
  Clock3,
  Flame,
  KeyRound,
  Newspaper,
  Siren,
  UserRoundPlus,
} from 'lucide-react';
import {
  ADMIN_NOTIFICATION_GROUPS,
  ADMIN_NOTIFICATION_KEYS,
  createDefaultNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  READER_NOTIFICATION_KEYS,
  READER_NOTIFICATION_TOGGLES,
  REPORTER_NOTIFICATION_KEYS,
  type NotificationPrefKey,
  type NotificationPrefs,
  type NotificationSettingsRole,
} from '@shared/notification.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePushNotification } from '@/hooks/usePushNotification';
import { useToast } from '@/hooks/use-toast';
import { DBService } from '@/services/DBService';
import { PermissionStatusBanner } from './PermissionStatusBanner';
import { ReporterNotificationSection } from './ReporterNotificationSection';
import { ToggleRow } from './ToggleRow';
import { WarnIfOffModal } from './WarnIfOffModal';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type TogglePrefKey = Exclude<NotificationPrefKey, 'quiet_hours_start' | 'quiet_hours_end'>;

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

const ADMIN_ICONS = {
  admin_report: AlertTriangle,
  admin_new_reporter: UserRoundPlus,
  admin_signup_spike: BellRing,
  admin_push_fail: Siren,
  admin_edge_error: Siren,
  admin_daily_stats: BarChart3,
  admin_keyword_abuse: AlertTriangle,
} as const;

function normalizeRole(role: NotificationSettingsPageProps['role']): NotificationSettingsRole {
  return role === 'journalist' ? 'reporter' : role;
}

function roleLabel(role: NotificationSettingsRole): string {
  if (role === 'admin') return '관리자';
  if (role === 'reporter') return '기자단';
  return '일반 사용자';
}

function roleDescription(role: NotificationSettingsRole): string {
  if (role === 'admin') {
    return '서비스 운영 이상 징후와 승인 흐름을 빠르게 감지할 수 있도록 관리자 전용 알림만 보여줍니다.';
  }
  if (role === 'reporter') {
    return '독자용 개인화 알림과 기사 운영 알림을 함께 설정할 수 있습니다.';
  }
  return '읽고 싶은 뉴스만 골라서 받고, 브라우저 실시간 알림까지 연결할 수 있습니다.';
}

function getVisibleKeys(role: NotificationSettingsRole): TogglePrefKey[] {
  if (role === 'admin') {
    return [...ADMIN_NOTIFICATION_KEYS] as TogglePrefKey[];
  }
  if (role === 'reporter') {
    return [...READER_NOTIFICATION_KEYS, ...REPORTER_NOTIFICATION_KEYS] as TogglePrefKey[];
  }
  return [...READER_NOTIFICATION_KEYS] as TogglePrefKey[];
}

export function NotificationSettingsPage({ userId, role }: NotificationSettingsPageProps) {
  const normalizedRole = normalizeRole(role);
  const isReporter = normalizedRole === 'reporter';
  const isAdmin = normalizedRole === 'admin';
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => createDefaultNotificationPrefs());
  const [hydrating, setHydrating] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [warnOpen, setWarnOpen] = useState(false);
  const [pendingReporterToggle, setPendingReporterToggle] = useState<boolean | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const {
    permission,
    isSupported,
    isSubscribed,
    loading: pushLoading,
    subscribe,
    unsubscribe,
  } = usePushNotification(userId);

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
        // 기본값으로 먼저 렌더링하고, 로드 실패 시에도 화면은 유지합니다.
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

  const visibleKeys = useMemo(() => getVisibleKeys(normalizedRole), [normalizedRole]);

  const enabledVisibleCount = useMemo(
    () => visibleKeys.filter((key) => Boolean(prefs[key])).length,
    [prefs, visibleKeys],
  );

  const globalEnabled = enabledVisibleCount > 0;
  const pushReady = permission === 'granted' && isSubscribed;

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
        title: '알림 설정 저장에 실패했습니다.',
        description: error?.message || '변경 사항을 저장하지 못했습니다.',
        variant: 'destructive',
      });
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  const ensurePushReady = async (): Promise<boolean> => {
    if (!isSupported) {
      toast({
        title: '이 브라우저는 알림을 지원하지 않습니다.',
        description: 'Chrome 또는 Edge 최신 버전에서 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return false;
    }

    if (permission === 'denied') {
      toast({
        title: '브라우저 알림 권한이 차단되어 있습니다.',
        description: '주소창의 사이트 권한 설정에서 HueBrief 알림을 허용으로 바꿔 주세요.',
        variant: 'destructive',
      });
      return false;
    }

    if (permission === 'default') {
      const nextPermission = await Notification.requestPermission();
      if (nextPermission !== 'granted') {
        toast({
          title: '알림 권한이 필요합니다.',
          description: '실시간 알림을 받으려면 브라우저 알림 권한을 허용해 주세요.',
          variant: 'destructive',
        });
        return false;
      }
    }

    if (isSubscribed) {
      return true;
    }

    const ok = await subscribe();
    if (!ok) {
      toast({
        title: '실시간 알림 연결에 실패했습니다.',
        description: '브라우저 구독 등록이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: '실시간 알림 연결 완료',
      description: '이제 HueBrief 실시간 알림을 브라우저에서 받을 수 있습니다.',
    });
    return true;
  };

  const handlePushDisable = async () => {
    const ok = await unsubscribe();
    if (!ok) {
      toast({
        title: '알림 연결 해제에 실패했습니다.',
        description: '브라우저 구독을 정리하지 못했습니다.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: '브라우저 알림 연결이 해제되었습니다.',
      description: '알림함 기록은 남아 있지만 실시간 푸시는 더 이상 발송되지 않습니다.',
    });
  };

  const handleToggle = async (key: NotificationPrefKey, checked: boolean) => {
    if (checked && !pushReady) {
      const ready = await ensurePushReady();
      if (!ready) return;
    }

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

  const handleGlobalToggle = async (checked: boolean) => {
    if (checked && !pushReady) {
      const ready = await ensurePushReady();
      if (!ready) return;
    }

    const patch: Partial<NotificationPrefs> = {};

    visibleKeys.forEach((key) => {
      patch[key] = checked ? DEFAULT_NOTIFICATION_PREFS[key] : false;
    });

    void commitPatch(patch);
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const result = await DBService.sendNotificationTest();
      toast({
        title: result.delivered ? '테스트 알림을 발송했습니다.' : '알림함 테스트를 만들었습니다.',
        description: result.message,
      });
    } catch (error: any) {
      toast({
        title: '테스트 알림 발송에 실패했습니다.',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림 세부 설정</h1>
          <p className="mt-1 text-sm text-gray-600">{roleDescription(normalizedRole)}</p>
        </div>
        {statusLabel ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {statusLabel}
          </span>
        ) : null}
      </div>

      <PermissionStatusBanner
        isSupported={isSupported}
        permission={permission}
        isSubscribed={isSubscribed}
        loading={pushLoading}
        onEnable={() => {
          void ensurePushReady();
        }}
        onDisable={handlePushDisable}
        roleLabel={roleLabel(normalizedRole)}
      />

      <section className="rounded-[28px] border border-[#E3E8F4] bg-white p-5 shadow-[0_18px_40px_rgba(43,51,69,0.06)]">
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#E8ECF8] bg-[#F7F9FF] px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF1FF] text-[#4F46FF]">
              {globalEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-base font-semibold text-gray-900">{roleLabel(normalizedRole)} 알림 활성화</p>
              <p className="mt-1 text-sm text-gray-600">
                현재 이 역할에서 사용 가능한 {visibleKeys.length}개 항목 중 {enabledVisibleCount}개가 켜져 있습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={globalEnabled}
            onClick={() => void handleGlobalToggle(!globalEnabled)}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
              globalEnabled ? 'bg-[#4F46FF]' : 'bg-[#D8DEEC]'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                globalEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {!isAdmin ? (
          <div className="mt-4 space-y-3">
            {READER_NOTIFICATION_TOGGLES.map((item) => (
              <ToggleRow
                key={item.key}
                title={item.title}
                description={item.description}
                icon={READER_ICONS[item.key]}
                checked={prefs[item.key]}
                onCheckedChange={(checked) => void handleToggle(item.key, checked)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {ADMIN_NOTIFICATION_GROUPS.map((group) => (
              <div key={group.id} className="rounded-2xl border border-[#E8ECF8] bg-[#FAFBFF] px-4 py-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{group.title}</p>
                  {group.badge ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {group.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600">{group.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {isReporter ? (
        <ReporterNotificationSection prefs={prefs} onToggle={(key, checked) => void handleToggle(key, checked)} />
      ) : null}

      {isAdmin ? (
        <div className="space-y-5">
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
                    badge={item.badge}
                    icon={ADMIN_ICONS[item.key]}
                    checked={prefs[item.key]}
                    onCheckedChange={(checked) => void handleToggle(item.key, checked)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

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

      <section className="rounded-3xl border border-[#E3E8F4] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">실시간 알림 테스트</h2>
            <p className="mt-1 text-sm text-gray-600">
              지금 계정으로 테스트 알림을 보내서 브라우저 푸시와 알림함 반영 여부를 바로 확인할 수 있습니다.
            </p>
          </div>
          <Button
            type="button"
            className="rounded-xl bg-[#4F46FF] hover:bg-[#4338CA]"
            disabled={sendingTest}
            onClick={() => void handleSendTest()}
          >
            {sendingTest ? '발송 중...' : '테스트 알림 보내기'}
          </Button>
        </div>
        <div className="mt-3 rounded-2xl bg-[#F8FAFF] px-4 py-3 text-xs leading-5 text-gray-600">
          브라우저 권한이 허용되어 있지 않으면 푸시 배너는 보이지 않을 수 있지만, 알림함 기록은 함께 생성됩니다.
        </div>
      </section>

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
