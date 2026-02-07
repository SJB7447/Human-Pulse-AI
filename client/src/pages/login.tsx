import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowLeft, Eye, EyeOff, User, Newspaper, Shield, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { getSupabase } from '@/services/supabaseClient';
import { useEmotionStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

type UserRole = 'general' | 'journalist' | 'admin';

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
    const [isVerified, setIsVerified] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const [isSignUp, setIsSignUp] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('mode') === 'signup';
    });

    const handleRoleChange = (newRole: string) => {
        setRole(newRole as UserRole);
        setIsVerified(false); // Reset verification when changing role
    };

    const verifyRole = async () => {
        setIsVerifying(true);
        // Mock verification delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsVerifying(false);
        setIsVerified(true);

        const messages = {
            journalist: '동아일보 기자단 인증이 완료되었습니다.',
            admin: '관리자 인증이 완료되었습니다.'
        };

        toast({
            title: '인증 성공',
            description: messages[role as keyof typeof messages],
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isSignUp) {
            if (!termsAgreed) {
                toast({
                    title: '약관 동의 필요',
                    description: '서비스 이용약관에 동의해주세요.',
                    variant: 'destructive',
                });
                return;
            }

            if ((role === 'journalist' || role === 'admin') && !isVerified) {
                toast({
                    title: '인증 필요',
                    description: `${role === 'journalist' ? '기자단' : '관리자'} 인증을 완료해주세요.`,
                    variant: 'destructive',
                });
                return;
            }
        }

        setIsLoading(true);

        try {
            const supabase = getSupabase();

            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: name,
                            phone_number: phoneNumber,
                            role: role,
                            terms_agreed: true,
                        }
                    }
                });

                if (error) throw error;

                toast({
                    title: '회원가입 완료',
                    description: '이메일을 확인해주세요.',
                });
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                if (data.user) {
                    setUser({
                        id: data.user.id,
                        email: data.user.email || undefined,
                        name: data.user.user_metadata?.name || name,
                    });

                    toast({
                        title: '로그인 성공',
                        description: '환영합니다!',
                    });

                    setLocation('/');
                }
            }
        } catch (error: any) {
            toast({
                title: '오류',
                description: error.message || '인증 중 오류가 발생했습니다.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4 py-12"
            style={{
                background: 'linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)',
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <div
                    className="rounded-2xl p-8"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.5)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
                    }}
                >
                    <div className="mb-8">
                        <Link href="/">
                            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                홈으로
                            </Button>
                        </Link>
                        <h1 className="font-serif text-3xl font-bold text-human-main mb-2" data-testid="text-title">
                            {isSignUp ? '회원가입' : '로그인'}
                        </h1>
                        <p className="text-human-sub" data-testid="text-subtitle">
                            {isSignUp
                                ? 'HueBrief의 회원이 되어주세요'
                                : 'HueBrief에 오신 것을 환영합니다'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Role Selection for Sign Up */}
                        {isSignUp && (
                            <div className="mb-6">
                                <Label className="mb-2 block text-human-main">가입 유형 선택</Label>
                                <Tabs value={role} onValueChange={handleRoleChange} className="w-full">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="general">일반</TabsTrigger>
                                        <TabsTrigger value="journalist">기자단</TabsTrigger>
                                        <TabsTrigger value="admin">관리자</TabsTrigger>
                                    </TabsList>

                                    <div className="mt-4 min-h-[60px] flex items-center justify-center p-3 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                                        <p className="text-xs text-center text-gray-500">
                                            {role === 'general' && "일반 사용자를 위한 가입 공간입니다."}
                                            {role === 'journalist' && "동아일보 기자단 전용 가입 공간입니다. 별도 인증이 필요합니다."}
                                            {role === 'admin' && "시스템 관리자 전용 공간입니다. 승인된 관리자만 가입 가능합니다."}
                                        </p>
                                    </div>
                                </Tabs>
                            </div>
                        )}

                        {/* Extra Fields for Sign Up */}
                        {isSignUp && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-human-main">이름</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <Input
                                            id="name"
                                            placeholder="홍길동"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="pl-10"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phoneNumber" className="text-human-main">휴대폰 번호</Label>
                                    <div className="relative">
                                        <Input
                                            id="phoneNumber"
                                            placeholder="010-0000-0000"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-human-main">이메일</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10"
                                    required
                                    data-testid="input-email"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-human-main">비밀번호</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10"
                                    required
                                    minLength={6}
                                    data-testid="input-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    data-testid="button-toggle-password"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Special Role Verification */}
                        {isSignUp && (role === 'journalist' || role === 'admin') && (
                            <div className="space-y-2 pt-2">
                                <Label className="text-human-main mb-2 block">
                                    {role === 'journalist' ? '기자단 인증' : '관리자 권한 인증'}
                                </Label>
                                {isVerified ? (
                                    <div className="flex items-center justify-center w-full p-3 bg-green-50 text-green-700 rounded-md border border-green-200">
                                        <Check className="w-4 h-4 mr-2" />
                                        <span className="text-sm font-medium">인증 완료</span>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border-human-main/20 hover:bg-human-main/5 text-human-main"
                                        onClick={verifyRole}
                                        disabled={isVerifying}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                인증 중...
                                            </>
                                        ) : (
                                            <>
                                                {role === 'journalist' ? <Newspaper className="w-4 h-4 mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                                                {role === 'journalist' ? '동아일보 인증하기' : '관리자 권한 인증하기'}
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Terms Agreement */}
                        {isSignUp && (
                            <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                    id="terms"
                                    checked={termsAgreed}
                                    onCheckedChange={(checked) => setTermsAgreed(checked as boolean)}
                                />
                                <Label htmlFor="terms" className="text-sm text-gray-600 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    <span className="text-human-main font-medium">[필수]</span>{' '}
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <span className="underline cursor-pointer hover:text-human-main">서비스 이용약관</span>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>서비스 이용약관</DialogTitle>
                                                <DialogDescription>
                                                    HueBrief 서비스 이용을 위한 약관입니다.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="text-sm text-gray-600 space-y-4 pt-4">
                                                <p><strong>제 1 조 (목적)</strong><br />
                                                    본 약관은 HueBrief(이하 "회사")가 제공하는 서비스의 이용조건 및 절차, 이용자와 회사의 권리, 의무, 책임사항을 규정함을 목적으로 합니다.</p>

                                                <p><strong>제 2 조 (용어의 정의)</strong><br />
                                                    1. "서비스"라 함은 회사가 제공하는 모든 온라인 서비스를 말합니다.<br />
                                                    2. "이용자"라 함은 본 약관에 따라 회사가 제공하는 서비스를 받는 회원 및 비회원을 말합니다.</p>

                                                <p><strong>제 3 조 (약관의 효력 및 변경)</strong><br />
                                                    1. 본 약관은 서비스를 이용하고자 하는 모든 이용자에게 효력이 발생합니다.<br />
                                                    2. 회사는 필요한 경우 관련 법령을 위배하지 않는 범위 내에서 약관을 변경할 수 있습니다.</p>

                                                <p><strong>제 4 조 (회원가입)</strong><br />
                                                    이용자는 회사가 정한 가입 양식에 따라 회원정보를 기입한 후 본 약관에 동의한다는 의사표시를 함으로써 회원가입을 신청합니다.</p>

                                                <p className="text-gray-400 italic">이하 생략...</p>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                    에 동의합니다
                                </Label>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                            data-testid="button-submit"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    처리 중...
                                </>
                            ) : (
                                isSignUp ? '가입하기' : '로그인'
                            )}
                        </Button>
                    </form>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-gray-500 rounded-full">Or continue with</span>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full relative"
                        onClick={async () => {
                            const supabase = getSupabase();
                            await supabase.auth.signInWithOAuth({
                                provider: 'google',
                                options: {
                                    redirectTo: `${window.location.origin}/`,
                                },
                            });
                        }}
                        data-testid="button-google-login"
                    >
                        <svg className="w-4 h-4 mr-2" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                            <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                        </svg>
                        {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
                    </Button>

                    <div className="mt-6 text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setRole('general'); // Reset role when toggling
                                setIsVerified(false);
                            }}
                            className="text-sm text-human-sub hover:text-human-main transition-colors"
                            data-testid="button-toggle-mode"
                        >
                            {isSignUp
                                ? '이미 계정이 있으신가요? 로그인'
                                : '계정이 없으신가요? 회원가입'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
