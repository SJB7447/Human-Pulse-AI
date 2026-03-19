import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getSupabase } from '@/services/supabaseClient';
import { useEmotionStore } from '@/lib/store';

type UserRole = 'admin' | 'journalist' | 'general';

export function ProtectedRoute({
    children,
    allowedRoles,
}: {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
}) {
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
                return;
            }

            let effectiveRole: UserRole = user?.role || 'general';

            if (!session?.user && user?.id?.startsWith('demo-')) {
                try {
                    const response = await fetch(`/api/demo-role?userId=${encodeURIComponent(String(user.id).trim())}`);
                    if (response.ok) {
                        const payload = await response.json();
                        const nextRole = String(payload?.role || '').trim().toLowerCase();
                        if (nextRole === 'admin' || nextRole === 'journalist' || nextRole === 'general') {
                            effectiveRole = nextRole;
                            if (user.role !== nextRole) {
                                setUser({ ...user, role: nextRole });
                            }
                        }
                    }
                } catch {
                    // keep existing demo role when sync fails
                }
            }

            if (session?.user) {
                let role: UserRole =
                    (session.user.user_metadata?.role as UserRole) || 'general';

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

                effectiveRole = role;

                if (!user || user.id !== session.user.id || user.role !== role) {
                    setUser({
                        id: session.user.id,
                        email: session.user.email || undefined,
                        name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || undefined,
                        role,
                    });
                }
            }

            if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
                setIsAuthenticated(false);
                setLocation('/');
                return;
            }

            setIsAuthenticated(true);
        };
        checkAuth();
    }, [allowedRoles, setLocation, user, setUser]);

    if (isAuthenticated === null) {
        return null; // or a loading spinner
    }

    return isAuthenticated ? <>{children}</> : null;
}
