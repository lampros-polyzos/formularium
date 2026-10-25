import { useNavigate } from 'react-router-dom';
import FormulationCompanion from '../components/FormulationCompanion';

const FormulationEditor = () => {
  const navigate = useNavigate();

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
              <h2 className="text-2xl font-bold">Formulation Studio: <span className="font-normal text-gray-600">New Project</span></h2>
              {/* Compact Target Weight Input */}
              <div className="flex items-center gap-2 mt-2">
                <label className="text-sm text-gray-600 font-medium">Target Weight:</label>
                <input 
                  type="text" 
                  defaultValue="100g" 
                  className="w-24 border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm" 
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 bg-[#1f382a] text-white rounded shadow-sm text-sm font-medium hover:bg-[#2c4c3b]">Save</button>
              <button className="px-4 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50">Review</button>
              <button className="px-4 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50">Print</button>
            </div>
          </div>

          {/* Search Ingredients Bar (Moved Above Table) */}
          <div className="bg-white p-3 rounded-lg border border-[#c1d1b9] shadow-sm flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search and add ingredients to your formulation..." 
              className="w-full bg-transparent text-sm outline-none text-gray-700"
            />
          </div>

          {/* Phases Container */}
          <div className="bg-white border border-[#c1d1b9] rounded-lg shadow-sm overflow-hidden text-sm">
            {/* Phase A */}
            <div className="bg-[#cbd8d0] px-4 py-2 font-semibold flex justify-between">
              <span>PHASE A (Water Phase)</span>
              <span>^</span>
            </div>
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
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2">Distilled Water</td>
                    <td className="px-4 py-2">Solvent</td>
                    <td className="px-4 py-2"><input type="text" className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50" defaultValue="70%" /></td>
                    <td className="px-4 py-2">70.00g</td>
                    <td className="px-4 py-2 text-gray-400 cursor-pointer hover:text-gray-700">✎ 🗑</td>
                  </tr>
                </tbody>
              </table>
            </div>

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
              <span>Total: 70.00% | 70.00g</span>
              <span className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-white" title="Incomplete">!</span>
            </div>
          </div>
        </div>

        {/* Right Column: Formulation Companion */}
        <FormulationCompanion />

      </div>
    </div>
  );
};

export default FormulationEditor;