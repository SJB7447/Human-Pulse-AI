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
                if (session?.user) {
                    let role: 'admin' | 'journalist' | 'general' =
                        (session.user.user_metadata?.role as 'admin' | 'journalist' | 'general') || 'general';

                    try {
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('role')
                            .eq('id', session.user.id)
                            .single();
                        const profileRole = String(profile?.role || '').trim().toLowerCase();
                        if (profileRole === 'admin' || profileRole === 'journalist' || profileRole === 'general') {
                            role = profileRole;
                        }
                    } catch {
                        // Keep metadata/default role when profile lookup is unavailable.
                    }

                    if (!user || user.id !== session.user.id || user.role !== role) {
                        setUser({
                            id: session.user.id,
                            email: session.user.email || undefined,
                            name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || undefined,
                            role,
                        });
                    }
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
