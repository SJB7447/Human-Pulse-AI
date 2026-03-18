import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { NotificationSettingsPage } from '@/components/notifications/NotificationSettingsPage';
import { DBService } from '@/services/DBService';

type AuthState = {
  userId: string;
  role: 'general' | 'journalist' | 'admin';
};

export default function MyPageNotificationsPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const ctx = await DBService.getAuthContext();
        if (mounted && ctx?.userId) {
          setAuth({
            userId: ctx.userId,
            role: (ctx.role as AuthState['role']) || 'general',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-12 pt-28">
        {loading || !auth ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              알림 설정 페이지를 준비하는 중...
            </div>
          </div>
        ) : (
          <NotificationSettingsPage userId={auth.userId} role={auth.role} />
        )}
      </main>
    </div>
  );
}
