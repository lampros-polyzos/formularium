const FormulationCompanion = () => {
  return (
    <div className="w-full lg:w-80 flex flex-col gap-6">
      <div className="bg-[#e4ebd3] rounded-lg border border-[#c1d1b9] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#c1d1b9] flex justify-between items-center bg-[#d8e0c8]">
          <h3 className="font-semibold">Formulation Companion</h3>
          <span className="cursor-pointer text-gray-500 hover:text-gray-700">X</span>
        </div>
        
        <div className="p-4">
          <h4 className="font-medium mb-3 text-[#1f382a]">Live Health Check</h4>
          <div className="flex items-center gap-2 mb-2 text-sm">
            <span className="bg-[#c2d0c2] px-2 py-0.5 rounded text-[#1f382a] font-medium text-xs">Active</span>
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium text-xs">Green</span>
          </div>
          
          <ul className="text-sm space-y-2 mt-4 text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-yellow-600">⚠</span> Phases unbalanced (70%)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">○</span> pH target not set
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">○</span> Preservative missing
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FormulationCompanion;