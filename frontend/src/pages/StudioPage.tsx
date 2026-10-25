import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const StudioPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6] flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-[#c1d1b9] p-6 flex flex-col">
        <div className="flex items-center gap-3 text-[#1f382a] mb-10">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <span className="font-bold text-xl">Formularium</span>
        </div>

        <nav className="flex-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-[#e8f0e5] text-[#1f382a] rounded-xl font-medium transition-colors">
            My Formulations
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
            Ingredients Library
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors">
            Settings
          </button>
        </nav>

        <div className="pt-6 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-4 truncate">{user?.email}</p>
          <button 
            onClick={handleSignOut}
            className="w-full py-2.5 px-4 rounded-xl border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-bold text-[#1f382a]">My Formulations</h1>
          <button onClick={() => navigate('/studio/new')}className="py-3 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors">
            + New Formulation
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button onClick={() => navigate('/studio/new')} className="bg-white p-6 rounded-2xl border-2 border-dashed border-[#c1d1b9] shadow-sm flex flex-col items-center justify-center text-center h-48 hover:border-[#2c4c3b] hover:bg-gray-50 transition-all">
            <span className="text-[#3a5a4a] font-medium">Create your first formulation</span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default StudioPage;