import { Link, useLocation } from 'wouter';
import { useState } from 'react';
import { GlassButton } from '@/components/ui/glass-button';
import { useEmotionStore } from '@/lib/store';
import { EMOTION_NEWS_LINKS } from '@/lib/emotionNewsLinks';
import { useToast } from '@/hooks/use-toast';
import { getSupabase } from '@/services/supabaseClient';
import { getInitialLocale, type AppLocale } from '@/lib/locale';
import { LogIn, UserPlus, LogOut, User, Shield, Users, MessageSquare, CreditCard, Newspaper, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  transparent?: boolean;
}

const COPY = {
  ko: {
    navNews: '뉴스',
    navCommunity: '커뮤니티',
    navPricing: '요금제',
    navJournalist: '기자',
    navAdmin: '관리자',
    newsDropdownTitle: '감정 카테고리 뉴스',
    myPage: '마이페이지',
    logout: '로그아웃',
    login: '로그인',
    signUp: '회원가입',
    restrictedTitle: '로그인 필요',
    restrictedDesc: (label: string) => `${label} 접근을 위해 로그인이 필요합니다.`,
    userSuffix: '님',
  },
  en: {
    navNews: 'News',
    navCommunity: 'Community',
    navPricing: 'Pricing',
    navJournalist: 'Journalist',
    navAdmin: 'Admin',
    newsDropdownTitle: 'Emotion News Categories',
    myPage: 'My Page',
    logout: 'Logout',
    login: 'Login',
    signUp: 'Sign Up',
    restrictedTitle: 'Login required',
    restrictedDesc: (label: string) => `Login is required to access ${label}.`,
    userSuffix: '',
  },
} as const;

export function Header({ transparent = false }: HeaderProps) {
  const { user, setUser } = useEmotionStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [locale] = useState<AppLocale>(() => getInitialLocale());
  const t = COPY[locale];

  const handleLogout = async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setUser(null);
    setLocation('/');
  };

  const handleRestrictedAccess = (path: string, label: string) => {
    if (!user) {
      toast({
        title: t.restrictedTitle,
        description: t.restrictedDesc(label),
        variant: 'destructive',
      });
      setLocation(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    setLocation(path);
  };

  const renderNewsDropdown = (mobile = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            mobile
              ? 'h-8 shrink-0 gap-1 px-2 text-xs text-gray-700'
              : 'text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2'
          }
        >
          <Newspaper className={mobile ? 'h-3.5 w-3.5' : 'w-4 h-4'} />
          {t.navNews}
          <ChevronDown className={mobile ? 'h-3.5 w-3.5 opacity-70' : 'w-4 h-4 opacity-70'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <DropdownMenuLabel>{t.newsDropdownTitle}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EMOTION_NEWS_LINKS.map((item) => (
          <DropdownMenuItem
            key={item.type}
            onClick={() => setLocation(`/emotion/${item.type}`)}
            className="cursor-pointer rounded-md px-3 py-2.5 mb-1 last:mb-0"
            style={{
              backgroundColor: `${item.color}20`,
              border: `1px solid ${item.color}40`,
            }}
          >
            <div className="flex w-full items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm font-medium text-gray-900">
                {locale === 'ko'
                  ? `${item.labelKo}(${item.categoryKo})`
                  : `${item.labelEn} (${item.categoryEn})`}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header
      id="app-header"
      className={`fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 px-3 py-3 sm:px-6 sm:py-4 transition-all duration-300 ${
        transparent ? 'bg-transparent' : 'bg-white/80 backdrop-blur-xl border-b border-gray-100'
      }`}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-8">
          <Link href="/">
            <span className="cursor-pointer text-lg font-serif font-bold transition-colors sm:text-xl" style={{ color: '#00abaf' }}>
              HueBrief
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {renderNewsDropdown()}
            <Link href="/community">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2">
                <MessageSquare className="w-4 h-4" />
                {t.navCommunity}
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2">
                <CreditCard className="w-4 h-4" />
                {t.navPricing}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRestrictedAccess('/journalist', t.navJournalist)}
              className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2"
            >
              <Users className="w-4 h-4" />
              {t.navJournalist}
            </Button>
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 hover:bg-black/5 gap-2">
                <Shield className="w-4 h-4" />
                {t.navAdmin}
              </Button>
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-3">
              <span className="text-sm text-gray-600 hidden md:inline font-medium">
                {user.email?.split('@')[0]}{t.userSuffix}
              </span>
              <Link href="/mypage">
                <GlassButton variant="outline" size="sm" className="bg-white/50 px-2 sm:px-3 hover:bg-white/80">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.myPage}</span>
                </GlassButton>
              </Link>
              <GlassButton
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="bg-white/50 px-2 text-red-500 hover:bg-white/80 hover:text-red-600 border-red-100 hover:border-red-200 sm:px-3"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{t.logout}</span>
              </GlassButton>
            </div>
          ) : (
            <>
              <Link href="/login">
                <GlassButton variant="outline" size="sm" className="bg-white/50 px-2 sm:px-3 hover:bg-white/80">
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.login}</span>
                </GlassButton>
              </Link>
              <Link href="/login?mode=signup">
                <GlassButton variant="primary" size="sm" className="px-2 sm:px-3">
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.signUp}</span>
                </GlassButton>
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="flex w-full items-center gap-1 overflow-x-auto pb-1 md:hidden">
        {renderNewsDropdown(true)}
        <Link href="/community">
          <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs text-gray-700">
            <MessageSquare className="h-3.5 w-3.5" />
            {t.navCommunity}
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs text-gray-700">
            <CreditCard className="h-3.5 w-3.5" />
            {t.navPricing}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRestrictedAccess('/journalist', t.navJournalist)}
          className="h-8 shrink-0 gap-1 px-2 text-xs text-gray-700"
        >
          <Users className="h-3.5 w-3.5" />
          {t.navJournalist}
        </Button>
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs text-gray-700">
            <Shield className="h-3.5 w-3.5" />
            {t.navAdmin}
          </Button>
        </Link>
      </nav>
    </header>
  );
}
