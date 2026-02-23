import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getSupabase } from '@/services/supabaseClient';
import { useEmotionStore } from '@/lib/store';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [, setLocation] = useLocation();
    const { user, setUser } = useEmotionStore();

    useEffect(() => {
        const checkAuth = async () => {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session && !user) {
                setIsAuthenticated(false);
                const currentPath = `${window.location.pathname}${window.location.search || ''}`;
                setLocation(`/login?redirect=${encodeURIComponent(currentPath)}`);
            } else {
                if (session?.user && !user) {
                    setUser({
                        id: session.user.id,
                        email: session.user.email || undefined,
                        name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || undefined,
                        role: session.user.user_metadata?.role || 'general',
                    });
                }
                setIsAuthenticated(true);
            }
        };
        checkAuth();
    }, [setLocation, user, setUser]);

    if (isAuthenticated === null) {
        return null; // or a loading spinner
    }

    return isAuthenticated ? <>{children}</> : null;
}
