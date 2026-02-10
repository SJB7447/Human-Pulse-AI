import { Link, useLocation } from 'wouter';
import { GlassButton } from '@/components/ui/glass-button';
import { useEmotionStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { getSupabase } from '@/services/supabaseClient';
import { LogIn, UserPlus, LogOut, User, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
    transparent?: boolean;
}

export function Header({ transparent = false }: HeaderProps) {
    const { user, setUser } = useEmotionStore();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const handleLogout = async () => {
        const supabase = getSupabase();
        await supabase.auth.signOut();
        setUser(null);
        setLocation('/');
    };

    const handleRestrictedAccess = (path: string, label: string) => {
        if (!user) {
            toast({
                title: '로그인 필요',
                description: `${label} 접근을 위해 로그인이 필요합니다.`,
                variant: 'destructive',
            });
            setLocation('/login');
        } else {
            setLocation(path);
        }
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between transition-all duration-300 ${transparent
                ? 'bg-transparent'
                : 'bg-white/80 backdrop-blur-xl border-b border-gray-100'
                }`}
        >
            <div className="flex items-center gap-8">
                <Link href="/">
                    <span
                        className="text-xl font-serif font-bold cursor-pointer transition-colors"
                        style={{ color: '#1bbca8' }}
                    >
                        HueBrief
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestrictedAccess('/journalist', '기자 전용')}
                        className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2"
                    >
                        <Users className="w-4 h-4" />
                        Journalist
                    </Button>
                    <Link href="/admin">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2"
                        >
                            <Shield className="w-4 h-4" />
                            Admin
                        </Button>
                    </Link>
                </nav>
            </div>

            <div className="flex items-center gap-3">
                {user ? (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 hidden md:inline font-medium">
                            {user.email?.split('@')[0]}님
                        </span>
                        <Link href="/mypage">
                            <GlassButton
                                variant="outline"
                                size="sm"
                                className="bg-white/50 hover:bg-white/80"
                            >
                                <User className="w-4 h-4" />
                                <span className="hidden sm:inline">My Page</span>
                            </GlassButton>
                        </Link>
                        <GlassButton
                            variant="outline"
                            size="sm"
                            onClick={handleLogout}
                            className="bg-white/50 hover:bg-white/80 text-red-500 hover:text-red-600 border-red-100 hover:border-red-200"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden sm:inline">Logout</span>
                        </GlassButton>
                    </div>
                ) : (
                    <>
                        <Link href="/login">
                            <GlassButton
                                variant="outline"
                                size="sm"
                                className="bg-white/50 hover:bg-white/80"
                            >
                                <LogIn className="w-4 h-4" />
                                <span className="hidden sm:inline">Login</span>
                            </GlassButton>
                        </Link>
                        <Link href="/login?mode=signup">
                            <GlassButton
                                variant="primary"
                                size="sm"
                            >
                                <UserPlus className="w-4 h-4" />
                                <span className="hidden sm:inline">Sign Up</span>
                            </GlassButton>
                        </Link>
                    </>
                )}
            </div>
        </header>
    );
}
