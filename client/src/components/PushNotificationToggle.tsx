import { usePushNotification } from "@/hooks/usePushNotification";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string | null;
}

export function PushNotificationToggle({ userId }: Props) {
  const { isSupported, isSubscribed, loading, subscribe, unsubscribe } = usePushNotification(userId);
  const { toast } = useToast();

  if (!isSupported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      const ok = await unsubscribe();
      if (ok) toast({ title: "알림 해제", description: "푸시 알림이 해제됐어요." });
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({
          title: "알림 권한 필요",
          description: "브라우저 설정에서 알림을 허용해주세요.",
          variant: "destructive",
        });
        return;
      }
      const ok = await subscribe();
      if (ok) toast({ title: "알림 설정 완료", description: "새 뉴스와 댓글 알림을 받을 수 있어요." });
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 8,
        border: "1px solid hsl(var(--border))",
        background: isSubscribed ? "hsl(var(--primary))" : "hsl(var(--muted))",
        color: isSubscribed ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
        fontSize: 13,
        fontWeight: 500,
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "all 0.15s",
      }}
    >
      {isSubscribed ? "🔔 알림 켜짐" : "🔕 알림 받기"}
    </button>
  );
}
