import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { useEmotionStore } from '@/lib/store';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { DBService } from '@/services/DBService';

type SubscriptionState = {
  status: 'active' | 'inactive';
  plan: 'free' | 'premium';
  periodEnd: string | null;
};

export default function PricingPage() {
  const { user } = useEmotionStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    status: 'inactive',
    plan: 'free',
    periodEnd: null,
  });
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSubscription = async () => {
      setLoadingProfile(true);
      try {
        const auth = await DBService.getAuthContext();
        if (!mounted) return;

        if (!auth?.userId) {
          setAuthUserId(null);
          setSubscription({ status: 'inactive', plan: 'free', periodEnd: null });
          return;
        }

        setAuthUserId(auth.userId);
        const data = await DBService.getSubscription(auth.userId);
        if (!mounted) return;

        setSubscription({
          status: data?.status === 'active' ? 'active' : 'inactive',
          plan: data?.plan === 'premium' ? 'premium' : 'free',
          periodEnd: data?.periodEnd || null,
        });
      } catch {
        if (!mounted) return;
        setSubscription({ status: 'inactive', plan: 'free', periodEnd: null });
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };

    loadSubscription();

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleStartFree = () => {
    if (authUserId) {
      setLocation('/emotion/spectrum');
      return;
    }
    setLocation('/login?mode=signup');
  };

  const handlePremium = async () => {
    if (!authUserId) {
      setLocation('/login');
      return;
    }

    setLoading(true);
    try {
      const data = await DBService.subscribePremium(authUserId);
      setSubscription({
        status: data?.status === 'active' ? 'active' : 'inactive',
        plan: data?.plan === 'premium' ? 'premium' : 'free',
        periodEnd: data?.periodEnd || null,
      });

      toast({
        title: '프리미엄 구독 완료',
        description: '이용권이 프리미엄으로 변경되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '구독 처리 실패',
        description: error?.message || '잠시 후 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPremium = async () => {
    if (!authUserId) return;

    setLoading(true);
    try {
      const data = await DBService.cancelPremium(authUserId);
      setSubscription({
        status: data?.status === 'active' ? 'active' : 'inactive',
        plan: data?.plan === 'premium' ? 'premium' : 'free',
        periodEnd: data?.periodEnd || null,
      });

      toast({
        title: '프리미엄 해지 완료',
        description: '이용권이 무료 플랜으로 변경되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '해지 처리 실패',
        description: error?.message || '잠시 후 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isPremium = subscription.plan === 'premium' && subscription.status === 'active';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-14 pt-24">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">이용권</h1>
          <p className="text-gray-600 mt-3">구독 상태 조회/변경이 실제 API와 연결되어 있습니다.</p>
        </div>

        <div className="max-w-3xl mx-auto mb-8 rounded-2xl border border-gray-200 bg-white p-5">
          {loadingProfile ? (
            <div className="text-sm text-gray-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />프로필 정보를 불러오는 중...</div>
          ) : authUserId ? (
            <div className="text-sm text-gray-700">
              <p>현재 플랜: <span className="font-semibold">{isPremium ? '프리미엄' : '무료'}</span></p>
              <p className="mt-1">상태: {subscription.status === 'active' ? '활성' : '비활성'}</p>
              {subscription.periodEnd && <p className="mt-1">만료 시점: {new Date(subscription.periodEnd).toLocaleString()}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-600">구독 관리를 위해 로그인이 필요합니다.</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">무료</h2>
            <p className="text-sm text-gray-500 mt-1">기본 읽기와 생성 기능</p>
            <p className="mt-5 text-4xl font-bold text-gray-900">
              ₩0 <span className="text-base font-normal text-gray-500">/월</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-700">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />감정 뉴스 탐색</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />커뮤니티 피드 이용</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />기본 AI 기사 생성</li>
            </ul>
            <Button onClick={handleStartFree} className="w-full mt-8" disabled={loading}>
              {authUserId ? '서비스 이용하기' : '무료로 시작하기'}
            </Button>
            {isPremium && (
              <Button onClick={handleCancelPremium} className="w-full mt-3" variant="outline" disabled={loading}>
                프리미엄 해지
              </Button>
            )}
          </section>

          <section className="rounded-2xl border-2 border-blue-600 bg-white p-7 shadow-lg">
            <div className="inline-flex text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold mb-3">
              인기
            </div>
            <h2 className="text-xl font-bold text-gray-900">프리미엄</h2>
            <p className="text-sm text-gray-500 mt-1">고급 생성 및 역할 기능</p>
            <p className="mt-5 text-4xl font-bold text-gray-900">
              ₩9,900 <span className="text-base font-normal text-gray-500">/월</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-700">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-600" />AI 생성 우선 처리</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-600" />확장 인사이트/큐레이션</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-600" />기자단/관리자 워크플로 지원</li>
            </ul>
            <Button onClick={handlePremium} className="w-full mt-8 bg-blue-600 hover:bg-blue-700" disabled={loading || isPremium}>
              {isPremium ? '이미 프리미엄 이용 중' : authUserId ? '프리미엄 시작하기' : '로그인 후 구독하기'}
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
}
