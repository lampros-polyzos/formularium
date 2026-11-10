import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listMutes, muteMember, unmuteMember } from '../lib/communityApi';

const NONE: string[] = [];

/** The members the signed-in person has muted. Their posts and comments are hidden from this person only. */
export function useCommunityMutes() {
    const { user } = useAuth();
    const userId = user?.id;
    // Remembered together with whose list it is, so a list is never shown to someone else, and signing out shows none (no reset effect needed)
    const [state, setState] = useState<{ userId?: string; ids: string[] }>({ ids: [] });
    const muted = state.userId === userId ? state.ids : NONE;

    useEffect(() => {
        let live = true;
        if (!userId) return;
        listMutes().then(ids => { if (live) setState({ userId, ids }); }).catch(() => { /* hiding is a convenience: show everything if it cannot load */ });
        return () => { live = false; };
    }, [userId]);

    const mute = useCallback(async (id: string) => {
        await muteMember(id);
        setState(prev => { const ids = prev.userId === userId ? prev.ids : []; return { userId, ids: ids.includes(id) ? ids : [...ids, id] }; });
    }, [userId]);
    const unmute = useCallback(async (id: string) => {
        await unmuteMember(id);
        setState(prev => ({ userId, ids: (prev.userId === userId ? prev.ids : []).filter(x => x !== id) }));
    }, [userId]);
    return { muted, mute, unmute };
}
