import { Bell, BellOff, CheckCircle2, Smartphone } from "lucide-react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string | null;
}

function statusLabel(permission: NotificationPermission) {
  switch (permission) {
    case "granted":
      return "허용됨";
    case "denied":
      return "차단됨";
    default:
      return "미설정";
  }
}

export function PushNotificationSettingsPanel({ userId }: Props) {
  const { isSupported, isSubscribed, loading, permission, subscribe, unsubscribe } = usePushNotification(userId);
  const { toast } = useToast();

  const handleEnable = async () => {
    if (!isSupported) return;
    const nextPermission = await Notification.requestPermission();
    if (nextPermission !== "granted") {
      toast({
        title: "알림 권한 필요",
        description: "브라우저에서 HueBrief 알림을 허용하면 새 뉴스와 댓글 알림을 받을 수 있어요.",
        variant: "destructive",
      });
      return;
    }

    const ok = await subscribe();
    if (ok) {
      toast({
        title: "알림 설정 완료",
        description: "새 뉴스, 댓글, 관리자 알림을 받을 수 있어요.",
      });
    }
  };

  const handleDisable = async () => {
    const ok = await unsubscribe();
    if (ok) {
      toast({
        title: "알림 해제",
        description: "브라우저 푸시 알림이 해제됐어요.",
      });
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-slate-50 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">알림 설정</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            새 뉴스 등록, 내 기사 댓글, 관리자 조치 같은 중요한 변화를 브라우저 알림으로 받을 수 있어요.
          </p>
        </div>
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: isSubscribed ? "rgba(63,101,239,0.12)" : "rgba(15,23,42,0.06)",
            color: isSubscribed ? "#3f65ef" : "#475569",
          }}
        >
          {isSubscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-gray-100">
          <p className="text-[11px] text-gray-500">기기 지원</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{isSupported ? "지원됨" : "미지원"}</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-gray-100">
          <p className="text-[11px] text-gray-500">브라우저 권한</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{statusLabel(permission)}</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-3 shadow-sm ring-1 ring-gray-100">
          <p className="text-[11px] text-gray-500">현재 구독 상태</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{isSubscribed ? "알림 받는 중" : "알림 꺼짐"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white/80 px-3 py-3 ring-1 ring-gray-100">
        <div className="flex items-start gap-2 text-xs leading-5 text-gray-600">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <p>설치형 앱(PWA)이나 브라우저 상태에서 모두 받을 수 있습니다.</p>
            <p>알림이 차단된 경우 브라우저 주소창 또는 사이트 설정에서 다시 허용할 수 있어요.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isSubscribed ? (
          <button
            type="button"
            onClick={handleDisable}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? "처리 중..." : "알림 해제"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={loading || !isSupported}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #00abaf 0%, #3f65ef 100%)" }}
          >
            {loading ? "요청 중..." : permission === "granted" ? "알림 바로 켜기" : "브라우저 권한 요청"}
          </button>
        )}

        {isSubscribed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            활성화됨
          </span>
        )}
      </div>
    </div>
  );
}
