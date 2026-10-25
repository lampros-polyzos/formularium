import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FormulationCompanion from '../components/FormulationCompanion';
import { supabase } from '../lib/supabase';

// 1. Define Types for the Database and Formula state
type DatabaseIngredient = {
  id: string;
  inci_name: string;
  trade_name: string;
  function: string;
  solubility: string;
  optimal_ph_min: number | null;
  optimal_ph_max: number | null;
};

type FormulaIngredient = DatabaseIngredient & {
  phase: 'A' | 'B' | 'C';
  percentage: number;
};

const FormulationEditor = () => {
  const navigate = useNavigate();
  
  // State for inline project name editing
  const [projectName, setProjectName] = useState('New Project');
  const [isEditingName, setIsEditingName] = useState(false);

  // Validation state
  const [profileId, setProfileId] = useState('');
  const [alerts, setAlerts] = useState<{type: 'error'|'warning'|'success', message: string}[]>([]);

  // 2. New State for Search and Ingredients
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<DatabaseIngredient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [formulaIngredients, setFormulaIngredients] = useState<FormulaIngredient[]>([]);

  // 3. Debounced Database Search Effect
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const fetchIngredients = async () => {
      setIsSearching(true);
      const cleanTerm = searchTerm.trim();

      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .or(`trade_name.ilike.%${cleanTerm}%,inci_name.ilike.%${cleanTerm}%`)
        .limit(10);

      if (error) {
        console.error("Ingredients search query failed:", error);
      } else if (data) {
        // Deduplicate in memory by inci_name or id
        const uniqueItems = Array.from(
          new Map(data.map((item) => [item.inci_name.toLowerCase(), item])).values()
        );
        setSearchResults(uniqueItems);
      }
      setIsSearching(false);
    };

    const delayDebounceFn = setTimeout(() => {
      fetchIngredients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // 4. Add Ingredient Handler
  const handleAddIngredient = (ingredient: DatabaseIngredient) => {
    const newIngredient: FormulaIngredient = {
      ...ingredient,
      phase: 'A', // Default to Phase A, can be updated later
      percentage: 0
    };
    
    setFormulaIngredients(prev => [...prev, newIngredient]);
    setSearchTerm(''); // Clear search bar
    setSearchResults([]); // Close dropdown
  };

  // 5. Update Ingredient Percentage Handler
  const handlePercentageChange = (index: number, newPct: string) => {
    const value = parseFloat(newPct) || 0;
    setFormulaIngredients(prev => {
      const updated = [...prev];
      updated[index].percentage = value;
      return updated;
    });
  };

  const removeIngredient = (index: number) => {
    setFormulaIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // Debounced API call to the Edge Function
  useEffect(() => {
    if (!profileId) return;

    const validateFormula = async () => {
      const totalPct = formulaIngredients.reduce((sum, item) => sum + item.percentage, 0);

      const payload = {
        profileId,
        ingredients: formulaIngredients.map(i => ({
          name: i.inci_name,
          function: i.function,
          percentage: i.percentage
        })),
        totalPercentage: totalPct
      };

      const { data, error } = await supabase.functions.invoke('validate-formula', {
        body: payload
      });

      if (data?.alerts) {
        setAlerts(data.alerts);
      } else if (error) {
        console.error("Validation error:", error);
      }
    };

    const debounceTimer = setTimeout(() => {
      validateFormula();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [profileId, formulaIngredients]); 

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditingName(false);
    }
  };

  const currentTotalPercentage = formulaIngredients.reduce((sum, item) => sum + item.percentage, 0);

  // Helper to filter ingredients by phase
  const getPhaseIngredients = (phase: 'A' | 'B' | 'C') => {
    return formulaIngredients.map((ing, idx) => ({ ...ing, originalIndex: idx })).filter(ing => ing.phase === phase);
  };

  return (
    <div className="min-h-screen bg-[#f3f5f2] text-[#1f382a] font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-[#dbe3da] px-6 py-3 flex items-center justify-between border-b border-[#c1d1b9]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/studio')}
            className="text-[#3a5a4a] hover:text-[#1f382a] font-medium flex items-center gap-1"
          >
            <span>&larr;</span> Back to Studio
          </button>
          <span className="text-gray-400">|</span>
          <h1 className="font-semibold">Formularium Workspace</h1>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <span className="cursor-pointer hover:underline">Products</span>
          <span className="cursor-pointer hover:underline">Links</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">
        
        {/* Left Column: Formulation Panel */}
        <div className="flex-1 flex flex-col gap-5">
          
          {/* Header Actions & Compact Setup */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
            <div>
              {/* Editable Project Name */}
              <h2 className="text-2xl font-bold flex items-center gap-2">
                Formulation Studio: 
                {isEditingName ? (
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={handleNameKeyDown}
                    autoFocus
                    className="font-normal text-gray-800 bg-white border border-[#c1d1b9] rounded px-2 py-0.5 text-xl outline-none focus:ring-1 focus:ring-[#2c4c3b] w-64 shadow-sm"
                  />
                ) : (
                  <span 
                    className="font-normal text-gray-600 flex items-center gap-2 group cursor-pointer"
                    onClick={() => setIsEditingName(true)}
                  >
                    {projectName}
                    <button 
                      className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#2c4c3b]" 
                      aria-label="Edit project name"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </span>
                )}
              </h2>
              
              {/* Compact Setup Inputs */}
              <div className="flex flex-wrap items-center gap-6 mt-3">
                
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 font-medium">Target Weight:</label>
                  <input 
                    type="text" 
                    defaultValue="100g" 
                    className="w-24 border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm" 
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="profile-select" className="text-sm text-gray-600 font-medium">Profile:</label>
                  <select 
                    id="profile-select"
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className="border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm text-gray-700 w-48"
                  >
                    <option value="" disabled>Select product type...</option>
                    <optgroup label="Emulsions">
                      <option value="ow_lotion">O/W Lotion or Cream</option>
                      <option value="wo_cream">W/O Rich Cream or Salve</option>
                    </optgroup>
                    <optgroup label="Anhydrous (Waterless)">
                      <option value="body_butter">Body Butter or Balm</option>
                      <option value="facial_oil">Facial or Body Oil</option>
                    </optgroup>
                    <optgroup label="Aqueous & Gels">
                      <option value="toner_mist">Toner or Face Mist</option>
                      <option value="water_serum">Water-based Serum or Gel</option>
                    </optgroup>
                    <optgroup label="Surfactants (Wash-off)">
                      <option value="body_wash">Body Wash or Gel Cleanser</option>
                      <option value="shampoo">Shampoo</option>
                    </optgroup>
                  </select>
                </div>

              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="px-4 py-1.5 bg-[#1f382a] text-white rounded shadow-sm text-sm font-medium hover:bg-[#2c4c3b]">Save</button>
              <button className="px-4 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50">Review</button>
              <button className="px-4 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50">Print</button>
            </div>
          </div>

          {/* Search Ingredients Bar with Dropdown Container */}
          <div className="relative">
            <div className="bg-white p-3 rounded-lg border border-[#c1d1b9] shadow-sm flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search and add ingredients to your formulation..." 
                className="w-full bg-transparent text-sm outline-none text-gray-700"
              />
              {isSearching && <span className="text-xs text-gray-400">Searching...</span>}
            </div>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <ul className="absolute top-full left-0 right-0 bg-white border border-[#c1d1b9] mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto z-20">
                {searchResults.map((ingredient) => (
                  <li 
                    key={ingredient.id}
                    onClick={() => handleAddIngredient(ingredient)}
                    className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-[#f3f5f2] cursor-pointer flex flex-col"
                  >
                    <span className="font-semibold text-[#1f382a]">{ingredient.trade_name}</span>
                    <span className="text-xs text-gray-500">{ingredient.inci_name} • {ingredient.function}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Phases Container */}
          <div className="bg-white border border-[#c1d1b9] rounded-lg shadow-sm overflow-hidden text-sm">
            
            {/* Phase A */}
            <div className="bg-[#cbd8d0] px-4 py-2 font-semibold flex justify-between">
              <span>PHASE A (Water Phase)</span>
              <span>^</span>
            </div>
            {getPhaseIngredients('A').length === 0 ? (
              <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-gray-100">
                No ingredients added to Phase A yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="px-4 py-2 font-medium">Ingredient</th>
                      <th className="px-4 py-2 font-medium">Function</th>
                      <th className="px-4 py-2 font-medium w-24">Target %</th>
                      <th className="px-4 py-2 font-medium w-32">Target Weight (g)</th>
                      <th className="px-4 py-2 font-medium w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPhaseIngredients('A').map((item) => (
                      <tr key={item.originalIndex} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-medium text-[#1f382a]">{item.trade_name}</td>
                        <td className="px-4 py-2 text-gray-600">{item.function}</td>
                        <td className="px-4 py-2">
                          <input 
                            type="number" 
                            value={item.percentage || ''}
                            onChange={(e) => handlePercentageChange(item.originalIndex, e.target.value)}
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 outline-none focus:border-[#2c4c3b]" 
                          />
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {/* Mock target weight calculation assuming 100g total for now */}
                          {item.percentage ? `${item.percentage.toFixed(2)}g` : '0.00g'}
                        </td>
                        <td className="px-4 py-2 text-gray-400 cursor-pointer hover:text-red-500" onClick={() => removeIngredient(item.originalIndex)}>
                          🗑
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Phase B */}
            <div className="bg-[#e6e1cd] px-4 py-2 font-semibold flex justify-between border-t border-[#c1d1b9]">
              <span>PHASE B (Oil Phase)</span>
              <span>v</span>
            </div>
            <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-gray-100">
              No ingredients added to Phase B yet.
            </div>

            {/* Phase C */}
            <div className="bg-[#bdcdbd] px-4 py-2 font-semibold flex justify-between border-t border-[#c1d1b9]">
              <span>PHASE C (Cool Down)</span>
              <span>^</span>
            </div>
            <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-[#c1d1b9]">
              No ingredients added to Phase C yet.
            </div>

            {/* Total Footer */}
            <div className="bg-[#f0f4ef] px-4 py-3 text-right font-medium flex justify-end gap-2 items-center">
              <span>Total: {currentTotalPercentage.toFixed(2)}% | {currentTotalPercentage.toFixed(2)}g</span>
              {currentTotalPercentage !== 100 && (
                <span className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-white" title="Total must be 100%">!</span>
              )}
            </div>
          </div>
        </div>

        {/* Pass alerts to the Companion */}
        <FormulationCompanion alerts={alerts} />

      </div>
    </div>
  );
};

export default FormulationEditor;