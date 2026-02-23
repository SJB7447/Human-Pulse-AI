import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { DBService } from '@/services/DBService';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

type RoleRequest = {
  id: string;
  userId: string;
  email?: string;
  username?: string;
  requestedRole: 'journalist' | 'admin';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [targetRole, setTargetRole] = useState<'journalist' | 'admin'>('journalist');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const authCtx = await DBService.getAuthContext();
      setAuth(authCtx);
      if (authCtx?.userId) {
        const sub = await DBService.getSubscription(authCtx.userId);
        setSubscription(sub);
      } else {
        setSubscription(null);
      }
    } catch {
      setAuth(null);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    if (auth?.role !== 'admin') return;
    setRefreshing(true);
    try {
      const data = await DBService.getRoleRequests('pending');
      setRequests((data || []) as RoleRequest[]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadRequests();
  }, [auth?.role]);

  const handleSubmitRequest = async () => {
    if (!auth?.userId) {
      toast({ title: '로그인 필요', description: '먼저 로그인해주세요.', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: '사유 입력 필요', description: '요청 사유를 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await DBService.submitRoleRequest(auth.userId, auth.email || '', targetRole, reason.trim());
      setReason('');
      toast({ title: '요청 제출 완료', description: '역할 요청이 접수되었습니다.' });
      loadRequests();
    } catch (e: any) {
      toast({ title: '요청 제출 실패', description: e?.message || '잠시 후 다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (id: string, status: 'approved' | 'rejected', userId: string) => {
    try {
      await DBService.decideRoleRequest(id, status, userId);
      toast({ title: status === 'approved' ? '요청 승인 완료' : '요청 반려 완료' });
      loadRequests();
    } catch (e: any) {
      toast({ title: '처리 실패', description: e?.message || '잠시 후 다시 시도해주세요.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-4xl mx-auto px-6 pt-28 pb-10 text-gray-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          설정 정보를 불러오는 중...
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-4xl mx-auto px-6 pt-28 pb-10 space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-bold text-gray-900">설정</h1>
          <p className="text-sm text-gray-600 mt-1">구독 상태와 역할 권한을 관리합니다.</p>
          {auth ? (
            <div className="mt-4 text-sm text-gray-700">
              <p>사용자: {auth.email || auth.username}</p>
              <p>역할: {auth.role || 'general'}</p>
              <p>구독: {subscription?.plan || 'free'} ({subscription?.status || 'inactive'})</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-600">로그인 상태가 아닙니다.</p>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">역할 요청</h2>
          <p className="text-sm text-gray-600 mt-1">기자단 또는 관리자 권한을 요청할 수 있습니다.</p>
          <div className="mt-4 grid sm:grid-cols-[160px,1fr] gap-3">
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as 'journalist' | 'admin')}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm bg-white"
            >
              <option value="journalist">기자단</option>
              <option value="admin">관리자</option>
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="요청 사유를 입력하세요"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm"
            />
          </div>
          <Button onClick={handleSubmitRequest} disabled={submitting} className="mt-3">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '역할 요청 제출'}
          </Button>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Privacy and Chat Log Policy</h2>
          <p className="text-sm text-gray-600 mt-1">
            Hue Bot chat messages can be stored for service quality and safety review.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>Collection: user message, bot response, timestamp, and basic session context.</li>
            <li>Retention: up to 30 days in current demo environment.</li>
            <li>Usage: troubleshooting, quality audit, and response policy tuning.</li>
            <li>Sharing: no external third-party sale for chat logs.</li>
          </ul>
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-sm text-slate-700">
              Deletion request path: send a support request with account email and request date.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Self-service deletion controls will be added in production phase.
            </p>
          </div>
        </section>

        {auth?.role === 'admin' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">관리자 승인 대기열</h2>
              <Button variant="outline" onClick={loadRequests} disabled={refreshing}>
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : '새로고침'}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {requests.length === 0 && (
                <div className="text-sm text-gray-600">대기 중인 요청이 없습니다.</div>
              )}
              {requests.map((req) => (
                <article key={req.id} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-900 font-medium">{req.email || req.username || req.userId}</p>
                  <p className="text-xs text-gray-600 mt-1">요청 역할: {req.requestedRole === 'journalist' ? '기자단' : '관리자'}</p>
                  <p className="text-xs text-gray-600 mt-1">요청 사유: {req.reason || '-'}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(req.createdAt).toLocaleString()}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => handleDecision(req.id, 'approved', req.userId)}>
                      승인
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDecision(req.id, 'rejected', req.userId)}>
                      반려
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
