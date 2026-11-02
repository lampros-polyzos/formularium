import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function NotificationBell() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!user) return;

        // Fetch initial unread notifications
        const fetchNotifications = async () => {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('recipient_id', user.id)
                .eq('is_read', false)
                .order('created_at', { ascending: false });

            if (data) setNotifications(data);
        };

        fetchNotifications();

        // Optional: Subscribe to real-time new notifications
        const channel = supabase.channel('realtime_notifications')
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}`
            }, (payload) => {
                setNotifications(prev => [payload.new, ...prev]);
            }).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user]);

    const handleRead = async (id: string, postId: string) => {
        // Mark as read in DB
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        // Remove from local state
        setNotifications(prev => prev.filter(n => n.id !== id));
        setIsOpen(false);
        // Navigate to the post
        navigate(`/community/${postId}`);
    };

    if (!user) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-500 hover:text-[#2c4c3b] transition-colors"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-[#c1d1b9] rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="bg-[#e9eee7] px-4 py-2 border-b border-[#c1d1b9] font-bold text-sm text-[#1f382a]">
                        Notifications
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500 italic">No new notifications.</div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {notifications.map(notif => (
                                    <button
                                        key={notif.id}
                                        onClick={() => handleRead(notif.id, notif.post_id)}
                                        className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <p className="text-sm text-gray-800">
                                            <strong>{notif.actor_name}</strong> commented on your post.
                                        </p>
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            {new Date(notif.created_at).toLocaleDateString()}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}