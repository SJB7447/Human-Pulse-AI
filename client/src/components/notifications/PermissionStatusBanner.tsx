import { useState } from 'react';
import { BellRing, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePushNotification } from '@/hooks/usePushNotification';
import { useToast } from '@/hooks/use-toast';

type PermissionStatusBannerProps = {
  userId: string | null;
};

export function PermissionStatusBanner({ userId }: PermissionStatusBannerProps) {
  const { permission, subscribe, isSupported } = usePushNotification(userId);
  const { toast } = useToast();
  const [showHelp, setShowHelp] = useState(false);

  if (!isSupported || permission === 'granted') {
    return null;
  }

  const handleEnable = async () => {
    const nextPermission = await Notification.requestPermission();
    if (nextPermission !== 'granted') {
      toast({
        title: '알림 권한이 필요해요',
        description: '브라우저에서 HueBrief 알림을 허용해야 설정한 알림을 받을 수 있어요.',
        variant: 'destructive',
      });
      return;
    }

    const ok = await subscribe();
    if (!ok) {
      toast({
        title: '알림 설정 실패',
        description: '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: '알림 권한 설정 완료',
      description: '이제 브라우저 푸시 알림을 받을 수 있어요.',
    });
  };

  if (permission === 'default') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold">알림 권한이 아직 허용되지 않았어요</p>
              <p className="mt-1 text-xs leading-5 text-amber-800/90">
                속보와 기자 알림을 받으려면 브라우저 권한을 허용해 주세요.
              </p>
            </div>
          </div>
          <Button size="sm" className="shrink-0 bg-amber-500 hover:bg-amber-600" onClick={() => void handleEnable()}>
            지금 허용하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold">브라우저 알림이 차단되어 있어요</p>
              <p className="mt-1 text-xs leading-5 text-red-800/90">
                사이트 권한 설정에서 알림을 다시 허용하면 뉴스와 운영 알림을 받을 수 있어요.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-red-200 bg-white text-red-700 hover:bg-red-100"
            onClick={() => setShowHelp(true)}
          >
            설정 방법 보기
          </Button>
        </div>
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>알림 허용 방법</DialogTitle>
            <DialogDescription>
              브라우저 주소창 왼쪽의 사이트 정보 버튼을 눌러 알림 권한을 다시 허용해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm leading-6 text-gray-700">
            <p>1. 주소창 왼쪽 자물쇠 또는 사이트 정보 버튼을 누릅니다.</p>
            <p>2. 알림 권한을 찾습니다.</p>
            <p>3. 차단을 허용으로 바꾼 뒤 페이지를 새로고침합니다.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
