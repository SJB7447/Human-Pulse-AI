import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  BookOpenText,
  ChevronDown,
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
  REPORTER_NOTIFICATION_TOGGLES,
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
import { ToggleRow } from './ToggleRow';
import { WarnIfOffModal } from './WarnIfOffModal';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type TogglePrefKey = Exclude<NotificationPrefKey, 'quiet_hours_start' | 'quiet_hours_end'>;
type SectionKey =
  | 'base'
  | 'reporter'
  | 'quiet'
  | 'test'
  | 'admin-critical'
  | 'admin-operations'
  | 'admin-reports';

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

const REPORTER_ICONS = {
  reporter_comment: BellRing,
  reporter_reply: BellRing,
  reporter_share_spike: BellRing,
  reporter_view_milestone: BarChart3,
  reporter_article_published: Newspaper,
  reporter_edit_requested: AlertTriangle,
  reporter_weekly_summary: BookOpenText,
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
    return '운영 이상 징후와 검토가 필요한 이벤트를 빠르게 확인할 수 있도록 관리자 전용 알림을 제공합니다.';
  }
  if (role === 'reporter') {
    return '독자 반응 알림과 기사 운영 알림을 역할에 맞게 직접 조정할 수 있습니다.';
  }
  return '받고 싶은 알림만 골라 저장할 수 있고, 브라우저 권한을 허용하면 실시간 브라우저 알림도 함께 받을 수 있습니다.';
}

function getVisibleKeys(role: NotificationSettingsRole): TogglePrefKey[] {
  if (role === 'admin') return [...ADMIN_NOTIFICATION_KEYS] as TogglePrefKey[];
  if (role === 'reporter') {
    return [...READER_NOTIFICATION_KEYS, ...REPORTER_NOTIFICATION_KEYS] as TogglePrefKey[];
  }
  return [...READER_NOTIFICATION_KEYS] as TogglePrefKey[];
}

function CollapsibleSection({
  title,
  description,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {badge ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
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
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    base: true,
    reporter: false,
    quiet: false,
    test: false,
    'admin-critical': true,
    'admin-operations': false,
    'admin-reports': false,
  });
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
            window.setTimeout(
              () => reject(new Error('알림 설정 응답이 지연되고 있습니다.')),
              4000,
            );
          }),
        ]);
        if (mounted) setPrefs(result.prefs);
      } catch {
        // 기본 설정값으로 먼저 화면을 유지합니다.
      } finally {
        if (mounted) setHydrating(false);
      }
    };

    void load();

    return () => {
      mounted = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const visibleKeys = useMemo(() => getVisibleKeys(normalizedRole), [normalizedRole]);
  const enabledVisibleCount = useMemo(
    () => visibleKeys.filter((key) => Boolean(prefs[key])).length,
    [prefs, visibleKeys],
  );
  const globalEnabled = enabledVisibleCount > 0;

  const statusLabel = useMemo(() => {
    if (saveState === 'saving') return '저장 중...';
    if (saveState === 'saved') return '저장됨';
    if (saveState === 'error') return '저장 실패';
    if (hydrating) return '동기화 중...';
    return '';
  }, [hydrating, saveState]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const commitPatch = async (patch: Partial<NotificationPrefs>) => {
    setPrefs((current) => {
      const snapshot = current;
      const optimisticNext = { ...current, ...patch };

      void (async () => {
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
            title: '알림 설정 저장에 실패했습니다.',
            description: error?.message || '변경 사항을 저장하지 못했습니다.',
            variant: 'destructive',
          });
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2000);
        }
      })();

      return optimisticNext;
    });
  };

  const ensurePushReady = async (): Promise<boolean> => {
    if (!isSupported) {
      toast({
        title: '이 브라우저에서는 알림을 지원하지 않습니다.',
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
          description: '브라우저 알림을 받으려면 알림 권한을 허용해 주세요.',
          variant: 'destructive',
        });
        return false;
      }
    }

    if (isSubscribed) return true;

    const ok = await subscribe();
    if (!ok) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        toast({
          title: '브라우저 권한은 연결되었습니다.',
          description:
            '웹푸시 구독은 실패했지만, 로그인 상태에서는 알림함 동기화와 브라우저 알림으로 계속 받을 수 있습니다.',
        });
        return true;
      }

      toast({
        title: '실시간 알림 연결에 실패했습니다.',
        description:
          '브라우저 구독 등록이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: '실시간 알림 연결 완료',
      description: '이제 HueBrief 알림을 브라우저에서도 함께 받을 수 있습니다.',
    });
    return true;
  };

  const handlePushDisable = async () => {
    const ok = await unsubscribe();
    if (!ok) {
      toast({
        title: '브라우저 연결 해제에 실패했습니다.',
        description: '브라우저 구독 상태를 정리하지 못했습니다.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: '브라우저 알림 연결이 해제되었습니다.',
      description: '로그인 알림함 저장은 유지되지만 브라우저 실시간 알림은 중단됩니다.',
    });
  };

  const handleToggle = (key: NotificationPrefKey, checked: boolean) => {
    if (key === 'reporter_edit_requested' && !checked) {
      setPendingReporterToggle(false);
      setWarnOpen(true);
      return;
    }

    void commitPatch({ [key]: checked } as Partial<NotificationPrefs>);
  };

  const handleGlobalToggle = (checked: boolean) => {
    const patch: Partial<NotificationPrefs> = {};
    visibleKeys.forEach((key) => {
      patch[key] = checked;
    });
    void commitPatch(patch);
  };

  const handleQuietHoursCommit = () => {
    void commitPatch({
      quiet_hours_start: prefs.quiet_hours_start,
      quiet_hours_end: prefs.quiet_hours_end,
    });
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const granted = await ensurePushReady();
        if (!granted) {
          setSendingTest(false);
          return;
        }
      }

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

      <CollapsibleSection
        title={`${roleLabel(normalizedRole)} 기본 알림`}
        description={`현재 사용 가능한 ${visibleKeys.length}개 항목 중 ${enabledVisibleCount}개가 켜져 있습니다.`}
        badge={globalEnabled ? '활성화' : '비활성화'}
        open={openSections.base}
        onToggle={() => toggleSection('base')}
      >
        <div className="rounded-2xl border border-[#E8ECF8] bg-[#F7F9FF] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF1FF] text-[#4F46FF]">
                {globalEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-base font-semibold text-gray-900">
                  {roleLabel(normalizedRole)} 알림 활성화
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  한 번에 켜고 끌 수 있고, 아래 항목은 개별적으로 조정할 수 있습니다.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={globalEnabled}
              onClick={() => handleGlobalToggle(!globalEnabled)}
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
                onCheckedChange={(checked) => handleToggle(item.key, checked)}
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
      </CollapsibleSection>

      {isReporter ? (
        <CollapsibleSection
          title="기자단 전용 알림"
          description="내 기사 반응과 운영 피드백을 빠르게 확인할 수 있는 기자단 전용 항목입니다."
          badge="REPORTER"
          open={openSections.reporter}
          onToggle={() => toggleSection('reporter')}
        >
          <div className="space-y-3">
            {REPORTER_NOTIFICATION_TOGGLES.map((item) => (
              <ToggleRow
                key={item.key}
                title={item.title}
                description={item.description}
                badge={item.badge}
                icon={REPORTER_ICONS[item.key]}
                checked={prefs[item.key]}
                onCheckedChange={(checked) => handleToggle(item.key, checked)}
              />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {isAdmin ? (
        <div className="space-y-5">
          {ADMIN_NOTIFICATION_GROUPS.map((group) => {
            const sectionKey = `admin-${group.id}` as SectionKey;
            return (
              <CollapsibleSection
                key={group.id}
                title={group.title}
                description={group.description}
                badge={group.badge}
                open={openSections[sectionKey]}
                onToggle={() => toggleSection(sectionKey)}
              >
                <div className="space-y-3">
                  {group.keys.map((item) => (
                    <ToggleRow
                      key={item.key}
                      title={item.title}
                      description={item.description}
                      icon={ADMIN_ICONS[item.key]}
                      checked={prefs[item.key]}
                      onCheckedChange={(checked) => handleToggle(item.key, checked)}
                    />
                  ))}
                </div>
              </CollapsibleSection>
            );
          })}
        </div>
      ) : null}

      <CollapsibleSection
        title="방해금지 시간"
        description="기본값은 22:00부터 07:00까지이며, 긴급 알림은 예외로 발송됩니다."
        open={openSections.quiet}
        onToggle={() => toggleSection('quiet')}
      >
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
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock3 className="h-4 w-4 text-gray-400" />
            저장하면 즉시 모든 알림 시간에 반영됩니다.
          </div>
          <Button variant="outline" onClick={handleQuietHoursCommit}>
            방해금지 시간 저장
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="실시간 알림 테스트"
        description="테스트 알림을 보내 브라우저 알림과 알림함 반영 여부를 바로 확인할 수 있습니다."
        open={openSections.test}
        onToggle={() => toggleSection('test')}
      >
        <div className="rounded-2xl bg-[#F8FAFF] px-4 py-3 text-sm text-gray-600">
          웹푸시 연결이 완전히 되지 않아도 로그인 상태에서는 알림함 저장과 브라우저 권한 기반 알림
          확인이 가능합니다.
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            className="rounded-xl bg-[#4F46FF] hover:bg-[#4338CA]"
            disabled={sendingTest}
            onClick={() => void handleSendTest()}
          >
            {sendingTest ? '발송 중...' : '테스트 알림 보내기'}
          </Button>
        </div>
      </CollapsibleSection>

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
