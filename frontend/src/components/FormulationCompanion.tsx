type Alert = {
  type: 'error' | 'warning' | 'success';
  message: string;
};

interface CompanionProps {
  alerts: Alert[];
  hasProfile: boolean;
}

const FormulationCompanion = ({ alerts, hasProfile }: CompanionProps) => {
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
            {!hasProfile ? (
              <li className="text-gray-500 italic">Select a profile to activate the live health check.</li>
            ) : alerts.length === 0 ? (
              <li className="flex items-start gap-2 bg-[#e9eee7] p-3 rounded border border-[#c1d1b9] text-[#1f382a] font-medium">
                <span className="text-green-600 text-base">✅</span>
                <span className="leading-tight">All health checks passing! The formulation structure is sound.</span>
              </li>
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