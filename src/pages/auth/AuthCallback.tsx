import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// Handles Supabase email-confirmation redirects. Supabase appends
// #access_token=...&refresh_token=... to the URL; detectSessionInUrl in the
// Supabase client reads it and fires onAuthStateChange. We wait for a session
// to appear, then forward to the dashboard.
export function AuthCallbackPage() {
    const navigate = useNavigate();
    // Initialise from URL synchronously so we never call setState inside an effect.
    const [errorMessage, setErrorMessage] = useState<string | null>(() => {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const queryParams = new URLSearchParams(window.location.search);
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');
        return errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : null;
    });

    useEffect(() => {
        if (errorMessage) return;

        let cancelled = false;

        const goToDashboard = () => {
            if (cancelled) return;
            // Strip the hash so the token isn't kept in history.
            window.history.replaceState(null, '', window.location.pathname);
            navigate('/dashboard', { replace: true });
        };

        supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                goToDashboard();
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) goToDashboard();
        });

        const fallback = setTimeout(() => {
            if (!cancelled) {
                setErrorMessage('We could not confirm your session. Please sign in manually.');
            }
        }, 8000);

        return () => {
            cancelled = true;
            subscription.unsubscribe();
            clearTimeout(fallback);
        };
    }, [navigate, errorMessage]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-4">
                {errorMessage ? (
                    <>
                        <h1 className="text-xl font-bold text-red-600">Email confirmation failed</h1>
                        <p className="text-text-muted text-sm">{errorMessage}</p>
                        <button
                            onClick={() => navigate('/login', { replace: true })}
                            className="px-4 py-2 rounded-lg bg-primary text-white font-semibold"
                        >
                            Go to login
                        </button>
                    </>
                ) : (
                    <>
                        <div className="mx-auto animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                        <p className="text-text-muted">Confirming your email and signing you in…</p>
                    </>
                )}
            </div>
        </div>
    );
}
