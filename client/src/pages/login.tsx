import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowLeft, Eye, EyeOff, User, FlaskConical, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabase } from '@/services/supabaseClient';
import { useEmotionStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import type { AppLocale } from '@/lib/locale';

type UserRole = 'general' | 'journalist' | 'admin';
type AuthView = 'auth' | 'findId' | 'resetRequest' | 'resetConfirm';

const COPY = {
  ko: {
    back: '뒤로',
    login: '로그인',
    signup: '회원가입',
    subtitleLogin: '계정으로 로그인하세요.',
    subtitleSignup: 'HueBrief 계정을 만드세요.',
    role: '역할',
    name: '이름',
    phone: '휴대폰 번호',
    sendOtp: 'OTP 전송',
    resendOtp: '재전송',
    sending: '전송 중...',
    verify: '인증',
    checking: '확인 중...',
    verified: '인증 완료',
    preview: '데모 OTP 코드',
    email: '이메일',
    password: '비밀번호',
    agree: '필수 약관에 동의합니다.',
    createAccount: '가입하기',
    processing: '처리 중...',
    orContinue: '다른 방식으로 계속',
    google: 'Google로 계속',
    demoLogin: '테스트 계정 로그인',
    toggleToLogin: '이미 계정이 있나요? 로그인',
    toggleToSignup: '계정이 없나요? 회원가입',
    findId: '아이디 찾기',
    resetPw: '비밀번호 찾기',
    resetConfirm: '비밀번호 변경',
    submit: '확인',
    foundEmail: '확인된 이메일',
    resetToken: '재설정 토큰',
    newPassword: '새 비밀번호',
    confirmPassword: '새 비밀번호 확인',
    cancel: '취소',
    done: '완료',
    weakPassword: '비밀번호는 영문+숫자 포함 8자 이상이어야 합니다.',
    tokenExpired: '재설정 토큰이 만료되었거나 유효하지 않습니다.',
    passwordMismatch: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.',
    roleGeneral: '일반',
    roleJournalist: '기자',
    roleAdmin: '관리자',
    placeholderName: '이름을 입력하세요',
    placeholderOtp: 'OTP 6자리',
    placeholderEmail: 'your@email.com',
    phoneRequiredTitle: '휴대폰 번호 필요',
    phoneRequiredDesc: '휴대폰 번호를 먼저 입력해 주세요.',
    cooldownTitle: '재전송 대기',
    cooldownDesc: (sec: number) => `${sec}초 후 재전송할 수 있습니다.`,
    otpSentTitle: '데모 OTP 전송 완료',
    otpSentDesc: '아래 표시된 코드를 입력해 주세요.',
    otpSendFailed: 'OTP 전송 실패',
    tryAgainLater: '잠시 후 다시 시도해 주세요.',
    inputRequiredTitle: '입력 필요',
    inputRequiredDesc: '휴대폰 번호와 OTP 코드를 입력해 주세요.',
    phoneVerifiedTitle: '휴대폰 인증 완료',
    phoneVerifiedDesc: '회원가입을 계속 진행할 수 있습니다.',
    otpVerifyFailed: 'OTP 인증 실패',
    checkCodeRetry: '코드를 확인한 뒤 다시 시도해 주세요.',
    failedGeneric: '실패했습니다.',
    phoneVerifyRequiredTitle: '휴대폰 인증 필요',
    phoneVerifyRequiredDesc: '데모 OTP 인증을 먼저 완료해 주세요.',
    termsRequiredTitle: '약관 동의 필요',
    termsRequiredDesc: '필수 약관에 동의해 주세요.',
    signUpDoneTitle: '회원가입 완료',
    signUpDoneDesc: '이메일 인증을 진행해 주세요.',
    loginSuccessTitle: '로그인 성공',
    loginSuccessDesc: '환영합니다.',
    authErrorTitle: '인증 오류',
    authErrorDesc: '문제가 발생했습니다.',
    demoLoginDoneTitle: '데모 로그인 성공',
    demoLoginDoneDesc: '테스트 계정으로 로그인되었습니다.',
  },
  en: {
    back: 'Back',
    login: 'Login',
    signup: 'Sign Up',
    subtitleLogin: 'Sign in to continue.',
    subtitleSignup: 'Create your HueBrief account.',
    role: 'Role',
    name: 'Name',
    phone: 'Phone',
    sendOtp: 'Send OTP',
    resendOtp: 'Resend',
    sending: 'Sending...',
    verify: 'Verify',
    checking: 'Checking...',
    verified: 'Verified',
    preview: 'Demo OTP Code',
    email: 'Email',
    password: 'Password',
    agree: 'I agree to required terms and privacy policy.',
    createAccount: 'Create account',
    processing: 'Processing...',
    orContinue: 'Or continue with',
    google: 'Continue with Google',
    demoLogin: 'Test Account Login',
    toggleToLogin: 'Already have an account? Login',
    toggleToSignup: "Don't have an account? Sign up",
    findId: 'Find Email',
    resetPw: 'Reset Password',
    resetConfirm: 'Set New Password',
    submit: 'Submit',
    foundEmail: 'Found emails',
    resetToken: 'Reset Token',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    cancel: 'Cancel',
    done: 'Done',
    weakPassword: 'Password must be at least 8 chars with letters and numbers.',
    tokenExpired: 'Reset token is expired or invalid.',
    passwordMismatch: 'New password and confirmation do not match.',
    roleGeneral: 'General',
    roleJournalist: 'Journalist',
    roleAdmin: 'Admin',
    placeholderName: 'Your name',
    placeholderOtp: 'OTP 6 digits',
    placeholderEmail: 'your@email.com',
    phoneRequiredTitle: 'Phone number required',
    phoneRequiredDesc: 'Enter your phone number first.',
    cooldownTitle: 'Cooldown active',
    cooldownDesc: (sec: number) => `${sec}s left before resend.`,
    otpSentTitle: 'Demo OTP sent',
    otpSentDesc: 'Use the preview code shown below.',
    otpSendFailed: 'OTP send failed',
    tryAgainLater: 'Try again later.',
    inputRequiredTitle: 'Input required',
    inputRequiredDesc: 'Enter phone number and OTP code.',
    phoneVerifiedTitle: 'Phone verified',
    phoneVerifiedDesc: 'You can continue signup.',
    otpVerifyFailed: 'OTP verification failed',
    checkCodeRetry: 'Check the code and retry.',
    failedGeneric: 'Failed.',
    phoneVerifyRequiredTitle: 'Phone verification required',
    phoneVerifyRequiredDesc: 'Complete demo OTP verification first.',
    termsRequiredTitle: 'Terms required',
    termsRequiredDesc: 'Please agree to required terms.',
    signUpDoneTitle: 'Sign up complete',
    signUpDoneDesc: 'Please verify your email.',
    loginSuccessTitle: 'Login successful',
    loginSuccessDesc: 'Welcome back.',
    authErrorTitle: 'Authentication error',
    authErrorDesc: 'Something went wrong.',
    demoLoginDoneTitle: 'Demo login success',
    demoLoginDoneDesc: 'Signed in with test account.',
  },
} as const;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setUser } = useEmotionStore();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<UserRole>('general');
  const [termsAgreed, setTermsAgreed] = useState(false);

  const [otpCode, setOtpCode] = useState('');
  const [otpPreviewCode, setOtpPreviewCode] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(0);

  const [findPhone, setFindPhone] = useState('');
  const [findOtp, setFindOtp] = useState('');
  const [findPreview, setFindPreview] = useState('');
  const [findCooldownUntil, setFindCooldownUntil] = useState(0);
  const [findMaskedEmails, setFindMaskedEmails] = useState<string[]>([]);

  const [resetPhone, setResetPhone] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPreview, setResetPreview] = useState('');
  const [resetCooldownUntil, setResetCooldownUntil] = useState(0);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isCheckingOtp, setIsCheckingOtp] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [isSignUp, setIsSignUp] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'signup';
  });
  const [authView, setAuthView] = useState<AuthView>('auth');
  const locale: AppLocale = 'ko';
  const t = COPY[locale];
  const redirectPath = (() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('redirect') || '/';
    return raw.startsWith('/') ? raw : '/';
  })();

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const otpCooldownSeconds = Math.max(0, Math.ceil((otpCooldownUntil - nowMs) / 1000));
  const findCooldownSeconds = Math.max(0, Math.ceil((findCooldownUntil - nowMs) / 1000));
  const resetCooldownSeconds = Math.max(0, Math.ceil((resetCooldownUntil - nowMs) / 1000));

  const mapOtpError = (code: string, retryAfter = 60) => {
    const ko: Record<string, string> = {
      OTP_COOLDOWN: `재전송은 ${retryAfter}초 후 가능합니다.`,
      OTP_RATE_LIMIT: '오늘 OTP 요청 횟수를 초과했습니다.',
      OTP_NOT_REQUESTED: '먼저 OTP를 요청해 주세요.',
      OTP_EXPIRED: 'OTP가 만료되었습니다. 다시 요청해 주세요.',
      OTP_MISMATCH: 'OTP 코드가 일치하지 않습니다.',
    };
    const en: Record<string, string> = {
      OTP_COOLDOWN: `Resend available in ${retryAfter}s.`,
      OTP_RATE_LIMIT: 'Daily OTP limit exceeded.',
      OTP_NOT_REQUESTED: 'Request OTP first.',
      OTP_EXPIRED: 'OTP expired. Request a new code.',
      OTP_MISMATCH: 'OTP code mismatch.',
    };
    return locale === 'ko' ? ko[code] : en[code];
  };

  const sendOtp = async (
    phone: string,
    setPreview: (v: string) => void,
    setCooldownUntil: (v: number) => void,
    onSuccess?: () => void,
  ) => {
    const safePhone = phone.trim();
    if (!safePhone) {
      toast({ title: t.phoneRequiredTitle, description: t.phoneRequiredDesc, variant: 'destructive' });
      return;
    }

    const response = await fetch('/api/auth/phone/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: safePhone }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryAfter = Number(payload?.retryAfterSeconds || 60);
      setCooldownUntil(Date.now() + retryAfter * 1000);
      const code = String(payload?.code || '');
      throw new Error(mapOtpError(code, retryAfter) || payload?.error || 'Failed to send OTP');
    }

    setPreview(String(payload?.previewCode || ''));
    setCooldownUntil(Date.now() + Number(payload?.cooldownSeconds || 60) * 1000);
    onSuccess?.();
  };

  const handleSendOtp = async () => {
    if (otpCooldownSeconds > 0) {
      toast({ title: t.cooldownTitle, description: t.cooldownDesc(otpCooldownSeconds), variant: 'destructive' });
      return;
    }
    setIsSendingOtp(true);
    try {
      await sendOtp(phoneNumber, setOtpPreviewCode, setOtpCooldownUntil, () => setIsPhoneVerified(false));
      toast({ title: t.otpSentTitle, description: t.otpSentDesc });
    } catch (error: any) {
      toast({ title: t.otpSendFailed, description: error?.message || t.tryAgainLater, variant: 'destructive' });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const phone = phoneNumber.trim();
    const otp = otpCode.trim();
    if (!phone || !otp) {
      toast({ title: t.inputRequiredTitle, description: t.inputRequiredDesc, variant: 'destructive' });
      return;
    }

    setIsCheckingOtp(true);
    try {
      const response = await fetch('/api/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = String(payload?.code || '');
        throw new Error(mapOtpError(code) || payload?.error || 'Failed to verify OTP');
      }

      setIsPhoneVerified(true);
      toast({ title: t.phoneVerifiedTitle, description: t.phoneVerifiedDesc });
    } catch (error: any) {
      setIsPhoneVerified(false);
      toast({ title: t.otpVerifyFailed, description: error?.message || t.checkCodeRetry, variant: 'destructive' });
    } finally {
      setIsCheckingOtp(false);
    }
  };

  const handleFindId = async () => {
    try {
      const res = await fetch('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: findPhone.trim(), otp: findOtp.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(payload?.code || '');
        throw new Error(mapOtpError(code) || payload?.error || 'Failed to find email');
      }
      setFindMaskedEmails(Array.isArray(payload?.maskedEmails) ? payload.maskedEmails : []);
      toast({ title: t.done, description: t.findId });
    } catch (error: any) {
      toast({ title: t.findId, description: error?.message || t.failedGeneric, variant: 'destructive' });
    }
  };

  const handleResetRequest = async () => {
    try {
      const res = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: resetPhone.trim(), otp: resetOtp.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(payload?.code || '');
        throw new Error(mapOtpError(code) || payload?.error || 'Failed to request reset');
      }
      setResetToken(String(payload?.resetToken || ''));
      setAuthView('resetConfirm');
      toast({ title: t.done, description: t.resetPw });
    } catch (error: any) {
      toast({ title: t.resetPw, description: error?.message || t.failedGeneric, variant: 'destructive' });
    }
  };

  const handleResetConfirm = async () => {
    try {
      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), newPassword, confirmPassword }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(payload?.code || '');
        const codeMap: Record<string, string> = {
          AUTH_WEAK_PASSWORD: t.weakPassword,
          AUTH_RESET_TOKEN_EXPIRED: t.tokenExpired,
          AUTH_PASSWORD_CONFIRM_MISMATCH: t.passwordMismatch,
        };
        throw new Error(codeMap[code] || payload?.error || 'Failed to reset password');
      }
      toast({ title: t.done, description: t.resetConfirm });
      setAuthView('auth');
      setIsSignUp(false);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({ title: t.resetConfirm, description: error?.message || t.failedGeneric, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSignUp) {
      if (!isPhoneVerified) {
        toast({ title: t.phoneVerifyRequiredTitle, description: t.phoneVerifyRequiredDesc, variant: 'destructive' });
        return;
      }
      if (!termsAgreed) {
        toast({ title: t.termsRequiredTitle, description: t.termsRequiredDesc, variant: 'destructive' });
        return;
      }
    }

    setIsLoading(true);
    try {
      const supabase = getSupabase();

      if (isSignUp) {
        const consentResponse = await fetch('/api/auth/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            termsRequired: true,
            privacyRequired: true,
            marketingOptional: false,
            termsVersion: '2026-02-13-v1',
          }),
        });
        const consentPayload = await consentResponse.json().catch(() => ({}));
        if (!consentResponse.ok) {
          throw new Error(consentPayload?.error || 'Failed to save consent');
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              phone_number: phoneNumber,
              role,
              terms_agreed: true,
              phone_verified_demo: true,
            },
          },
        });
        if (error) throw error;

        toast({ title: t.signUpDoneTitle, description: t.signUpDoneDesc });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || undefined,
            name: data.user.user_metadata?.name || name,
          });
          toast({ title: t.loginSuccessTitle, description: t.loginSuccessDesc });
          setLocation(redirectPath);
        }
      }
    } catch (error: any) {
      toast({ title: t.authErrorTitle, description: error?.message || t.authErrorDesc, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
        <div className="rounded-2xl p-8" style={{ backgroundColor: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-1" />{t.back}
              </Button>
            </Link>
            <h1 className="font-serif text-3xl font-bold text-human-main mb-2" data-testid="text-title">
              {authView === 'findId' ? t.findId : authView === 'resetRequest' ? t.resetPw : authView === 'resetConfirm' ? t.resetConfirm : (isSignUp ? t.signup : t.login)}
            </h1>
            <p className="text-human-sub" data-testid="text-subtitle">
              {isSignUp ? t.subtitleSignup : t.subtitleLogin}
            </p>
          </div>

          {authView === 'auth' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {isSignUp && (
                <div>
                  <Label className="mb-2 block text-human-main">{t.role}</Label>
                  <Tabs value={role} onValueChange={(v) => setRole(v as UserRole)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="general">{t.roleGeneral}</TabsTrigger>
                      <TabsTrigger value="journalist">{t.roleJournalist}</TabsTrigger>
                      <TabsTrigger value="admin">{t.roleAdmin}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {isSignUp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-human-main">{t.name}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input id="name" placeholder={t.placeholderName} value={name} onChange={(e) => setName(e.target.value)} className="pl-10" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-human-main">{t.phone}</Label>
                    <Input
                      id="phoneNumber"
                      placeholder="010-0000-0000"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setIsPhoneVerified(false);
                      }}
                      required
                    />
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={handleSendOtp} disabled={isSendingOtp || otpCooldownSeconds > 0}>
                        {isSendingOtp ? t.sending : otpCooldownSeconds > 0 ? `${t.resendOtp} ${otpCooldownSeconds}s` : t.sendOtp}
                      </Button>
                      {isPhoneVerified && (
                        <span className="text-xs text-green-700 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />{t.verified}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input placeholder={t.placeholderOtp} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
                      <Button type="button" variant="outline" onClick={handleVerifyOtp} disabled={isCheckingOtp}>
                        {isCheckingOtp ? t.checking : t.verify}
                      </Button>
                    </div>
                    {otpPreviewCode && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{t.preview}: {otpPreviewCode}</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-human-main">{t.email}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input id="email" type="email" placeholder={t.placeholderEmail} value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required data-testid="input-email" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-human-main">{t.password}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" required minLength={6} data-testid="input-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" data-testid="button-toggle-password">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!isSignUp && (
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" onClick={() => setAuthView('findId')} className="text-blue-600 hover:underline">{t.findId}</button>
                    <button type="button" onClick={() => setAuthView('resetRequest')} className="text-blue-600 hover:underline">{t.resetPw}</button>
                  </div>
                )}
              </div>

              {isSignUp && (
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox id="terms" checked={termsAgreed} onCheckedChange={(checked) => setTermsAgreed(checked as boolean)} />
                  <Label htmlFor="terms" className="text-sm text-gray-600">{t.agree}</Label>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.processing}</>
                ) : isSignUp ? t.createAccount : t.login}
              </Button>
            </form>
          )}

          {authView === 'findId' && (
            <div className="space-y-3">
              <Label>{t.phone}</Label>
              <Input value={findPhone} onChange={(e) => setFindPhone(e.target.value)} placeholder="010-0000-0000" />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (findCooldownSeconds > 0) return;
                    try {
                      await sendOtp(findPhone, setFindPreview, setFindCooldownUntil);
                    } catch (error: any) {
                      toast({ title: t.findId, description: error?.message || t.failedGeneric, variant: 'destructive' });
                    }
                  }}
                  disabled={findCooldownSeconds > 0}
                >
                  {findCooldownSeconds > 0 ? `${t.resendOtp} ${findCooldownSeconds}s` : t.sendOtp}
                </Button>
              </div>
              <Input value={findOtp} onChange={(e) => setFindOtp(e.target.value)} placeholder={t.placeholderOtp} maxLength={6} />
              {findPreview && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{t.preview}: {findPreview}</p>}
              <Button type="button" className="w-full" onClick={handleFindId}>{t.submit}</Button>
              {findMaskedEmails.length > 0 && (
                <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <p className="font-semibold mb-1">{t.foundEmail}</p>
                  {findMaskedEmails.map((v) => <p key={v}>{v}</p>)}
                </div>
              )}
              <Button type="button" variant="outline" className="w-full" onClick={() => setAuthView('auth')}>{t.cancel}</Button>
            </div>
          )}

          {authView === 'resetRequest' && (
            <div className="space-y-3">
              <Label>{t.phone}</Label>
              <Input value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="010-0000-0000" />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (resetCooldownSeconds > 0) return;
                    try {
                      await sendOtp(resetPhone, setResetPreview, setResetCooldownUntil);
                    } catch (error: any) {
                      toast({ title: t.resetPw, description: error?.message || t.failedGeneric, variant: 'destructive' });
                    }
                  }}
                  disabled={resetCooldownSeconds > 0}
                >
                  {resetCooldownSeconds > 0 ? `${t.resendOtp} ${resetCooldownSeconds}s` : t.sendOtp}
                </Button>
              </div>
              <Input value={resetOtp} onChange={(e) => setResetOtp(e.target.value)} placeholder={t.placeholderOtp} maxLength={6} />
              {resetPreview && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{t.preview}: {resetPreview}</p>}
              <Button type="button" className="w-full" onClick={handleResetRequest}>{t.submit}</Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setAuthView('auth')}>{t.cancel}</Button>
            </div>
          )}

          {authView === 'resetConfirm' && (
            <div className="space-y-3">
              <Label>{t.resetToken}</Label>
              <Input value={resetToken} onChange={(e) => setResetToken(e.target.value)} />
              <Label>{t.newPassword}</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Label>{t.confirmPassword}</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              <Button type="button" className="w-full" onClick={handleResetConfirm}>{t.submit}</Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setAuthView('auth')}>{t.cancel}</Button>
            </div>
          )}

          {authView === 'auth' && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-300" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-500 rounded-full">{t.orContinue}</span></div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full relative"
                onClick={async () => {
                  const supabase = getSupabase();
                  await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}${redirectPath}` },
                  });
                }}
                data-testid="button-google-login"
              >
                {t.google}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full relative mt-2 border-dashed border-human-main/40 text-human-main hover:bg-human-main/5"
                onClick={() => {
                  setIsLoading(true);
                  setTimeout(() => {
                    const inferredRole: UserRole = redirectPath.startsWith('/admin')
                      ? 'admin'
                      : redirectPath.startsWith('/journalist') || redirectPath.startsWith('/reporter')
                        ? 'journalist'
                        : 'general';
                    const demoTarget = redirectPath === '/'
                      ? (inferredRole === 'admin' ? '/admin' : inferredRole === 'journalist' ? '/journalist' : '/')
                      : redirectPath;
                    setUser({ id: 'demo-user-123', email: 'demo@example.com', name: 'Demo User', role: inferredRole });
                    toast({ title: t.demoLoginDoneTitle, description: t.demoLoginDoneDesc });
                    setLocation(demoTarget);
                    setIsLoading(false);
                  }, 500);
                }}
                data-testid="button-demo-login"
              >
                <FlaskConical className="w-4 h-4 mr-2" />{t.demoLogin}
              </Button>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setRole('general');
                    setIsPhoneVerified(false);
                    setOtpCode('');
                  }}
                  className="text-sm text-human-sub hover:text-human-main transition-colors"
                  data-testid="button-toggle-mode"
                >
                  {isSignUp ? t.toggleToLogin : t.toggleToSignup}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
