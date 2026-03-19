import { BellRing, CheckCircle2, ShieldAlert, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PermissionStatusBannerProps = {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  loading?: boolean;
  onEnable: () => void | Promise<void>;
  onDisable: () => void | Promise<void>;
  roleLabel: string;
};

function permissionLabel(permission: NotificationPermission): string {
  if (permission === 'granted') return '허용됨';
  if (permission === 'denied') return '차단됨';
  return '요청 전';
}

function connectionLabel(
  isSupported: boolean,
  permission: NotificationPermission,
  isSubscribed: boolean,
): string {
  if (!isSupported) return '미지원';
  if (isSubscribed) return '웹푸시 연결됨';
  if (permission === 'granted') return '브라우저 알림 활성';
  return '미연결';
}

export function PermissionStatusBanner({
  isSupported,
  permission,
  isSubscribed,
  loading = false,
  onEnable,
  onDisable,
  roleLabel,
}: PermissionStatusBannerProps) {
  const isDenied = permission === 'denied';
  const isReady = permission === 'granted';
  const canDisable = permission === 'granted' || isSubscribed;

  return (
    <section className="rounded-[28px] border border-[#E3E8F4] bg-white p-5 shadow-[0_18px_40px_rgba(43,51,69,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF1FF] text-[#4F46FF]">
              {isReady ? <CheckCircle2 className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">브라우저 알림 연결</h2>
              <p className="mt-1 text-sm text-gray-600">
                {roleLabel} 알림은 로그인 상태에서 알림함으로 바로 저장됩니다. 브라우저 권한까지
                허용하면 화면이 열려 있을 때 브라우저 알림으로도 함께 받을 수 있습니다.
              </p>
            </div>
          </div>

          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E8ECF8] bg-[#F8FAFF] px-4 py-3">
              <p className="text-[11px] font-medium text-gray-500">브라우저 지원</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {isSupported ? '지원됨' : '미지원'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#E8ECF8] bg-[#F8FAFF] px-4 py-3">
              <p className="text-[11px] font-medium text-gray-500">브라우저 권한</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{permissionLabel(permission)}</p>
            </div>
            <div className="rounded-2xl border border-[#E8ECF8] bg-[#F8FAFF] px-4 py-3">
              <p className="text-[11px] font-medium text-gray-500">현재 수신 방식</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {connectionLabel(isSupported, permission, isSubscribed)}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {canDisable ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[#D8DEEC] bg-white"
              disabled={loading}
              onClick={() => void onDisable()}
            >
              {loading ? '처리 중...' : '브라우저 연결 해제'}
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-xl bg-[#4F46FF] hover:bg-[#4338CA]"
              disabled={loading || !isSupported}
              onClick={() => void onEnable()}
            >
              {loading ? '연결 중...' : '알림 연결하기'}
            </Button>
          )}
        </div>
      </div>

      {!isSupported ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            현재 브라우저에서는 알림 기능을 지원하지 않습니다. Chrome 또는 Edge 최신 버전에서
            다시 확인해 주세요.
          </p>
        </div>
      ) : null}

      {permission === 'granted' && !isSubscribed ? (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          웹푸시 구독이 실패해도 로그인 상태에서는 알림함 동기화와 브라우저 알림으로 계속 받을 수
          있습니다.
        </div>
      ) : null}

      {isDenied ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            브라우저에서 알림 권한이 차단되어 있습니다. 주소창의 사이트 권한 설정에서 HueBrief
            알림을 허용으로 바꿔 주세요.
          </p>
        </div>
      ) : null}
    </section>
  );
}
