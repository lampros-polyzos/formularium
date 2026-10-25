type Alert = {
  type: 'error' | 'warning' | 'success';
  message: string;
};

interface CompanionProps {
  alerts: Alert[];
}

const FormulationCompanion = ({ alerts }: CompanionProps) => {
  return (
    <div className="w-full lg:w-80 flex flex-col gap-6">
      <div className="bg-[#e4ebd3] rounded-lg border border-[#c1d1b9] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#c1d1b9] flex justify-between items-center bg-[#d8e0c8]">
          <h3 className="font-semibold">Formulation Companion</h3>
          <span className="cursor-pointer text-gray-500 hover:text-gray-700">X</span>
        </div>
        
        <div className="p-4">
          <h4 className="font-medium mb-3 text-[#1f382a]">Live Health Check</h4>
          
          <ul className="text-sm space-y-3 mt-4">
            {alerts.length === 0 ? (
              <li className="text-gray-500 italic">Select a profile and add ingredients to see health checks.</li>
            ) : (
              alerts.map((alert, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className={alert.type === 'error' ? 'text-red-500' : 'text-yellow-600'}>
                    {alert.type === 'error' ? '✖' : '⚠'}
                  </span>
                  <span className="text-gray-700 leading-tight">{alert.message}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FormulationCompanion;