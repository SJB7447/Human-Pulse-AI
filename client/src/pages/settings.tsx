import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { DBService, type UserProfileRecord, type UserSocialConnections } from '@/services/DBService';
import { getSupabase } from '@/services/supabaseClient';
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

const createEmptySocialConnections = (): UserSocialConnections => ({
  webUrl: '',
  instagramHandle: '',
  threadsHandle: '',
  youtubeChannelUrl: '',
  updatedAt: '',
});

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfileRecord>({
    name: '',
    email: '',
    bio: '',
  });
  const [socialConnections, setSocialConnections] = useState<UserSocialConnections>(createEmptySocialConnections());
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const [targetRole, setTargetRole] = useState<'journalist' | 'admin'>('journalist');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const isDemoAccount = String(auth?.userId || '').startsWith('demo-');

  const loadRequests = async (role: string | null | undefined) => {
    if (role !== 'admin') {
      setRequests([]);
      return;
    }
    setRefreshing(true);
    try {
      const data = await DBService.getRoleRequests('pending');
      setRequests((data || []) as RoleRequest[]);
    } finally {
      setRefreshing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const authCtx = await DBService.getAuthContext();
      setAuth(authCtx);

      if (!authCtx?.userId) {
        setSubscription(null);
        setProfile({ name: '', email: '', bio: '' });
        setSocialConnections(createEmptySocialConnections());
        setRequests([]);
        return;
      }

      const [sub, loadedProfile, loadedSocial] = await Promise.all([
        DBService.getSubscription(authCtx.userId),
        DBService.getUserProfile(authCtx.userId),
        DBService.getUserSocialConnections(authCtx.userId),
      ]);

      setSubscription(sub);
      setProfile(loadedProfile);
      setSocialConnections(loadedSocial);
      await loadRequests(authCtx.role);
    } catch {
      setAuth(null);
      setSubscription(null);
      setProfile({ name: '', email: '', bio: '' });
      setSocialConnections(createEmptySocialConnections());
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSaveProfile = async () => {
    if (!auth?.userId) {
      toast({
        title: '로그인 필요',
        description: '프로필 수정은 로그인 후 가능합니다.',
        variant: 'destructive',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const saved = await DBService.updateUserProfile(auth.userId, profile);
      setProfile(saved);
      toast({
        title: '프로필 저장 완료',
        description: '이름, 이메일, 자기소개가 바로 반영되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: '프로필 저장 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSocialConnections = async () => {
    if (!auth?.userId) {
      toast({
        title: '로그인 필요',
        description: 'SNS 연결 설정은 로그인 후 저장할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setSavingSocial(true);
    try {
      const saved = await DBService.updateUserSocialConnections(auth.userId, socialConnections);
      setSocialConnections(saved);
      toast({
        title: 'SNS 연결 저장 완료',
        description: '프로필 설정에 연결 정보가 저장되었습니다.',
      });
    } catch (error: any) {
      toast({
        title: 'SNS 연결 저장 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSavingSocial(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!auth?.userId) {
      toast({
        title: '로그인 필요',
        description: '권한 요청은 로그인 후 가능합니다.',
        variant: 'destructive',
      });
      return;
    }
    if (!reason.trim()) {
      toast({
        title: '사유 입력 필요',
        description: '권한 요청 사유를 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      await DBService.submitRoleRequest(auth.userId, auth.email || '', targetRole, reason.trim());
      setReason('');
      toast({
        title: '권한 요청 제출 완료',
        description: '관리자 검토 대기열에 등록되었습니다.',
      });
      await loadRequests(auth?.role);
    } catch (e: any) {
      toast({
        title: '권한 요청 제출 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (id: string, status: 'approved' | 'rejected', userId: string) => {
    try {
      await DBService.decideRoleRequest(id, status, userId);
      toast({
        title: status === 'approved' ? '권한 요청 승인 완료' : '권한 요청 반려 완료',
      });
      await loadRequests(auth?.role);
    } catch (e: any) {
      toast({
        title: '요청 처리 실패',
        description: e?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleChangePassword = async () => {
    if (!auth?.userId && !auth?.email) {
      toast({
        title: '로그인 필요',
        description: '비밀번호 변경은 로그인 후 가능합니다.',
        variant: 'destructive',
      });
      return;
    }
    if (!currentPassword || !nextPassword || !confirmNextPassword) {
      toast({
        title: '입력 필요',
        description: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }
    if (nextPassword !== confirmNextPassword) {
      toast({
        title: '확인 불일치',
        description: '새 비밀번호와 확인 값이 다릅니다.',
        variant: 'destructive',
      });
      return;
    }
    if (nextPassword.length < 8 || !/[A-Za-z]/.test(nextPassword) || !/\d/.test(nextPassword)) {
      toast({
        title: '약한 비밀번호',
        description: '영문+숫자 포함 8자 이상으로 입력해 주세요.',
        variant: 'destructive',
      });
      return;
    }

    setChangingPassword(true);
    try {
      if (isDemoAccount) {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: auth?.userId || '',
            email: auth?.email || '',
            currentPassword,
            newPassword: nextPassword,
            confirmPassword: confirmNextPassword,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || '비밀번호 변경에 실패했습니다.');
        }
      } else {
        const supabase = getSupabase();
        const email = String(auth?.email || '').trim();
        if (!email) {
          throw new Error('이메일 정보를 찾을 수 없습니다.');
        }

        const verifyResult = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (verifyResult.error) {
          throw new Error('현재 비밀번호가 올바르지 않습니다.');
        }

        const updateResult = await supabase.auth.updateUser({
          password: nextPassword,
        });
        if (updateResult.error) {
          throw updateResult.error;
        }
      }

      toast({
        title: '비밀번호 변경 완료',
        description: isDemoAccount
          ? '데모 계정 비밀번호가 저장되었습니다.'
          : '새 비밀번호가 다음 로그인부터 적용됩니다.',
      });
      setCurrentPassword('');
      setNextPassword('');
      setConfirmNextPassword('');
    } catch (error: any) {
      toast({
        title: '비밀번호 변경 실패',
        description: error?.message || '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
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
          <p className="mt-1 text-sm text-gray-600">
            프로필 정보, 비밀번호, 알림 설정을 한 곳에서 함께 관리할 수 있습니다.
          </p>

          {auth ? (
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-gray-700">
              <p>현재 계정: {auth.email || auth.username}</p>
              <p>현재 역할: {auth.role || 'general'}</p>
              <p>
                구독 상태: {subscription?.plan || 'free'} ({subscription?.status || 'inactive'})
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              로그인 후 프로필 수정과 비밀번호 변경을 사용할 수 있습니다.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">기본 정보</h2>
          <p className="text-sm text-gray-600 mt-1">프로필 카드에 보여지는 이름, 이메일, 자기소개를 수정합니다.</p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">이름</label>
              <input
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="이름을 입력해 주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
              <input
                value={profile.email}
                onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="이메일을 입력해 주세요"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">자기소개</label>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm resize-none"
                placeholder="자기소개를 입력해 주세요"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : '프로필 저장'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SNS 계정 연결</h2>
              <p className="text-sm text-gray-600 mt-1">외부 프로필 링크와 채널 주소를 함께 관리합니다.</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                if (!auth?.userId) return;
                const loaded = await DBService.getUserSocialConnections(auth.userId);
                setSocialConnections(loaded);
                toast({ title: 'SNS 연결 정보를 다시 불러왔습니다.' });
              }}
              disabled={!auth?.userId}
            >
              불러오기
            </Button>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Web 프로필 URL</label>
              <input
                value={socialConnections.webUrl}
                onChange={(e) => setSocialConnections((prev) => ({ ...prev, webUrl: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="https://example.com/me"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instagram 계정</label>
              <input
                value={socialConnections.instagramHandle}
                onChange={(e) => setSocialConnections((prev) => ({ ...prev, instagramHandle: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="@your_instagram"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Threads 계정</label>
              <input
                value={socialConnections.threadsHandle}
                onChange={(e) => setSocialConnections((prev) => ({ ...prev, threadsHandle: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="@your_threads"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">YouTube 채널 URL</label>
              <input
                value={socialConnections.youtubeChannelUrl}
                onChange={(e) => setSocialConnections((prev) => ({ ...prev, youtubeChannelUrl: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
                placeholder="https://youtube.com/@yourchannel"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveSocialConnections} disabled={savingSocial}>
              {savingSocial ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SNS 연결 저장'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">비밀번호 변경</h2>
          <p className="text-sm text-gray-600 mt-1">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>
          {isDemoAccount ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              데모 계정 기본 비밀번호는 <span className="font-semibold">demo1234</span> 입니다. 변경 후에는 새 비밀번호가 이 세션 기준으로 유지됩니다.
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className="h-11 rounded-xl border border-gray-300 px-4 text-sm"
            />
            <input
              type="password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              placeholder="새 비밀번호"
              className="h-11 rounded-xl border border-gray-300 px-4 text-sm"
            />
            <input
              type="password"
              value={confirmNextPassword}
              onChange={(e) => setConfirmNextPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="h-11 rounded-xl border border-gray-300 px-4 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : '비밀번호 변경'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">역할 요청</h2>
          <p className="text-sm text-gray-600 mt-1">기자단 또는 관리자 권한이 필요할 때 요청 사유와 함께 제출합니다.</p>
          <div className="mt-4 grid sm:grid-cols-[160px,1fr] gap-3">
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as 'journalist' | 'admin')}
              className="h-11 rounded-xl border border-gray-300 px-4 text-sm bg-white"
            >
              <option value="journalist">기자단</option>
              <option value="admin">관리자</option>
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="권한 요청 사유를 입력해 주세요"
              className="h-11 rounded-xl border border-gray-300 px-4 text-sm"
            />
          </div>
          <div className="mt-4">
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '권한 요청 제출'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">개인정보 및 채팅 로그 안내</h2>
          <p className="text-sm text-gray-600 mt-1">
            Hue Bot 대화 기록은 서비스 품질 개선과 안전성 점검을 위해 일정 기간 보관될 수 있습니다.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>수집 항목: 사용자 메시지, 봇 응답, 시간 정보, 기본 세션 맥락</li>
            <li>보관 기간: 현재 데모 환경 기준 최대 30일</li>
            <li>사용 목적: 오류 분석, 품질 점검, 응답 정책 개선</li>
            <li>외부 판매: 제3자에게 대화 로그를 판매하지 않습니다.</li>
          </ul>
        </section>

        {auth?.role === 'admin' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">관리자 승인 대기열</h2>
                <p className="text-sm text-gray-600 mt-1">기자단/관리자 권한 요청을 검토하고 승인 또는 반려할 수 있습니다.</p>
              </div>
              <Button variant="outline" onClick={() => loadRequests(auth?.role)} disabled={refreshing}>
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : '새로고침'}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {requests.length === 0 && <div className="text-sm text-gray-600">대기 중인 권한 요청이 없습니다.</div>}
              {requests.map((req) => (
                <article key={req.id} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">{req.email || req.username || req.userId}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    요청 역할: {req.requestedRole === 'journalist' ? '기자단' : '관리자'}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">요청 사유: {req.reason || '-'}</p>
                  <p className="mt-1 text-xs text-gray-400">{new Date(req.createdAt).toLocaleString()}</p>
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
