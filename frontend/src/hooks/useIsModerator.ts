import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isModerator } from '../lib/communityApi';

/** Whether the signed-in person is a community moderator (set up in the database dashboard, not in the app). */
export function useIsModerator() {
    const { user } = useAuth();
    const userId = user?.id;
    const [result, setResult] = useState<{ userId: string; moderator: boolean } | null>(null);
    useEffect(() => {
        let live = true;
        if (userId) isModerator().then(moderator => { if (live) setResult({ userId, moderator }); }).catch(() => { /* not a moderator */ });
        return () => { live = false; };
    }, [userId]);
    return !!userId && result?.userId === userId && result.moderator;
}
