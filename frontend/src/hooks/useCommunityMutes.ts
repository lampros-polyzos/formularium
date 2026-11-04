import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listMutes, muteMember, unmuteMember } from '../lib/communityApi';

/** The members the signed-in person has muted. Their posts and comments are hidden from this person only. */
export function useCommunityMutes() {
    const { user } = useAuth();
    const userId = user?.id;
    const [muted, setMuted] = useState<string[]>([]);

    useEffect(() => {
        let live = true;
        if (!userId) { setMuted([]); return; }
        listMutes().then(ids => { if (live) setMuted(ids); }).catch(() => { /* hiding is a convenience: show everything if it cannot load */ });
        return () => { live = false; };
    }, [userId]);

    const mute = useCallback(async (id: string) => { await muteMember(id); setMuted(prev => (prev.includes(id) ? prev : [...prev, id])); }, []);
    const unmute = useCallback(async (id: string) => { await unmuteMember(id); setMuted(prev => prev.filter(x => x !== id)); }, []);
    return { muted, mute, unmute };
}
