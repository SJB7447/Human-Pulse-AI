import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getSupabase } from '@/services/supabaseClient';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [, setLocation] = useLocation();

    useEffect(() => {
        const checkAuth = async () => {
            const supabase = getSupabase();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setIsAuthenticated(false);
                setLocation('/login');
            } else {
                setIsAuthenticated(true);
            }
        };
        checkAuth();
    }, [setLocation]);

    if (isAuthenticated === null) {
        return null; // or a loading spinner
    }

    return isAuthenticated ? <>{children}</> : null;
}
