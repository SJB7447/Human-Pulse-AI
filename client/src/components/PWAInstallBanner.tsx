import { useState } from 'react';
import { usePWA } from '@/hooks/usePWA';
import { useToast } from '@/hooks/use-toast';

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, isIOS, install } = usePWA();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isInstalled || dismissed || !isInstallable) return null;

  const handleInstall = async () => {
    const confirmed = window.confirm('HueBrief를 이 기기에 설치할까요?');
    if (!confirmed) return;

    if (isIOS) {
      toast({
        title: '앱으로 설치하기',
        description: "Safari 하단의 공유 버튼(□↑)을 누른 뒤 '홈 화면에 추가'를 선택해 주세요.",
      });
      setDismissed(true);
      return;
    }

    setLoading(true);
    const accepted = await install();
    setLoading(false);

    if (accepted) {
      toast({
        title: '설치 완료',
        description: 'HueBrief가 홈 화면에 추가되었습니다.',
      });
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, width: 'calc(100% - 32px)', maxWidth: '420px' }}>
      <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <img src="/favicon.png?v=20260317" alt="HueBrief" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))' }}>앱으로 설치하기</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{isIOS ? 'Safari에서 홈 화면에 추가' : '홈 화면에서 바로 실행'}</p>
        </div>
        <button onClick={handleInstall} disabled={loading} style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', fontSize: 13, fontWeight: 500, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? '설치 중...' : '설치'}
        </button>
        <button onClick={() => setDismissed(true)} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 14, background: 'hsl(var(--muted))', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))', fontSize: 16 }} aria-label="닫기">×</button>
      </div>
    </div>
  );
}
