import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Prefers a real browser "back" — this preserves the previous page's URL
// (e.g. a list's filter query params) instead of discarding it. Falls back to
// a fixed path only when there's no in-app history to return to (the page was
// opened directly via a bookmark, shared link, or full refresh).
export function useGoBack(fallbackPath: string) {
    const navigate = useNavigate();
    return useCallback(() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx;
        if (typeof idx === 'number' && idx > 0) {
            navigate(-1);
        } else {
            navigate(fallbackPath);
        }
    }, [navigate, fallbackPath]);
}
