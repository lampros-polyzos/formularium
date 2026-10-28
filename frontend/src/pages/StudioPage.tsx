import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import CustomModal from '../components/CustomModal';

// Define the formula type based on your database schema
type SavedFormula = {
  id: string;
  name: string;
  profile_id: string;
  target_weight_g: number;
  created_at: string;
  status?: string;
};

const StudioPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formulas, setFormulas] = useState<SavedFormula[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modal, setModal] = useState({
    isOpen: false,
    type: 'confirm' as 'confirm' | 'error',
    title: '',
    message: '',
    targetId: ''
  });

  // Fetch saved formulas on mount
  useEffect(() => {
    const fetchFormulas = async () => {
      try {
        const { data, error } = await supabase
          .from('formulations') // <-- Changed from 'formulas'
          .select('*');
        // Note: Removed the .order('created_at') because that column doesn't exist in your ERD

        if (error) throw error;
        if (data) setFormulas(data);
      } catch (error) {
        console.error("Error fetching formulations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFormulas();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const requestDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Formulation',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      targetId: id
    });
  };

  const executeDelete = async () => {
    try {
      const { error } = await supabase
        .from('formulations')
        .delete()
        .eq('id', modal.targetId);

      if (error) throw error;

      setFormulas(prev => prev.filter(formula => formula.id !== modal.targetId));
      setModal(prev => ({ ...prev, isOpen: false }));

    } catch (error: any) {
      console.error("Error deleting formulation:", error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Delete Failed',
        message: error.code === '23503'
          ? "Please ensure your database is set to CASCADE deletes for formulation_phases."
          : error.message || "An unexpected error occurred.",
        targetId: ''
      });
    }
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
          <button
            onClick={() => navigate('/studio/new')}
            className="py-3 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors"
          >
            + New Formulation
          </button>
        </header>

        {isLoading ? (
          <div className="flex justify-center items-center h-48 text-gray-500">
            Loading projects...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* New Project Card */}
            <button
              onClick={() => navigate('/studio/new')}
              className="bg-white p-6 rounded-2xl border-2 border-dashed border-[#c1d1b9] shadow-sm flex flex-col items-center justify-center text-center h-48 hover:border-[#2c4c3b] hover:bg-gray-50 transition-all"
            >
              <span className="text-[#3a5a4a] font-medium">Create new formulation</span>
            </button>

            {/* Saved Formula Cards */}
            {formulas.map((formula) => {
              const formattedDate = formula.created_at
                ? new Date(formula.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Just now';

              const profileName = formula.profile_id
                ? formula.profile_id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                : 'Custom Profile';

              return (
                <div
                  key={formula.id}
                  onClick={() => navigate(`/studio/${formula.id}`)}
                  className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between h-48 cursor-pointer transition-all hover:shadow-md hover:border-[#2c4c3b] group relative overflow-hidden"
                >
                  {/* Subtle top color bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#2c4c3b] to-[#4a755d] opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                        {formula.status || 'Draft'}
                      </span>
                      <span className="text-xs font-semibold text-[#3a5a4a] bg-[#e8f0e5] px-2 py-1 rounded-md">
                        {formula.target_weight_g}g
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mt-2 mb-1 group-hover:text-[#2c4c3b] line-clamp-1">
                      {formula.name}
                    </h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      {profileName}
                    </p>
                  </div>

                  <div className="border-t border-gray-100 pt-3 mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">
                      Created {formattedDate}
                    </span>

                    {/* Action Buttons Container */}
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">

                      {/* Delete Button */}
                      <button
                        onClick={(e) => requestDelete(e, formula.id, formula.name)}
                        className="text-gray-400 hover:text-red-500 transition-colors flex items-center p-1"
                        title="Delete formulation"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      {/* Edit Button Text */}
                      <span className="text-sm font-medium text-[#2c4c3b] flex items-center gap-1">
                        Edit
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>

                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        )}

        <CustomModal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
          onConfirm={executeDelete}
        />
      </main>
    </div>
  );
};

export default StudioPage;