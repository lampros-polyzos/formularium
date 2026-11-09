import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shown to someone using the demo account, on every page: what they make here is temporary, and how to keep their work (a real account).
 * Floats at the bottom so it never pushes a page's own header around.
 */
export default function GuestBanner() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    if (!user?.guest) return null;

    const createAccount = async () => {
        await signOut();             // the demo account ends here; the sign-up form opens on the home page
        navigate('/?signup=1');
    };

    return (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl bg-[#1f382a] text-white rounded-2xl shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
            <span><strong>You are using the demo.</strong> What you make here is deleted after about a day.</span>
            <button type="button" onClick={createAccount} className="px-4 py-1.5 bg-white text-[#1f382a] rounded-full font-semibold hover:bg-[#d8e2d3] transition-colors">
                Create a free account
            </button>
        </div>
    );
}
