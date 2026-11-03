import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import DilutionTool from '../components/tools/DilutionTool';
import HlbTool from '../components/tools/HlbTool';
import PhDoseTool from '../components/tools/PhDoseTool';
import PreservativeTool from '../components/tools/PreservativeTool';
import UnitsTool from '../components/tools/UnitsTool';
import { usePageTitle } from '../components/content/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { TOOLS, isToolId, type ToolId } from '../lib/toolLinks';

export default function ToolsPage() {
    usePageTitle('Calculators');
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const requested = params.get('tool');
    const tool: ToolId = isToolId(requested) ? requested : 'hlb';
    const active = TOOLS.find(t => t.id === tool)!;

    // Switching tabs drops the prefill values so one tool's numbers don't leak into the next.
    const select = (id: ToolId) => setParams({ tool: id });

    return (
        <div className="min-h-screen bg-[#f7f8f6] text-gray-900 font-sans">
            <Header title="Calculators" backPath={user ? "/studio" : undefined} backLabel="Back to Studio" />

            <section className="bg-[#d8e2d3] px-6 py-10 rounded-b-[3rem]">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-3xl md:text-4xl font-bold text-[#1f382a] mb-3">Formulator's calculators</h1>
                    <p className="text-[#3a5a4a] max-w-2xl mx-auto">The small sums you keep reaching for mid-batch, in one place. Free, no account needed.</p>
                </div>
            </section>

            <main className="max-w-3xl mx-auto px-6 py-8">
                <div role="tablist" aria-label="Calculators" className="flex flex-wrap gap-2 mb-2">
                    {TOOLS.map(t => (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={t.id === tool}
                            onClick={() => select(t.id)}
                            className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${t.id === tool ? 'bg-[#1f382a] text-white border-[#1f382a]' : 'bg-white text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#e9eee7]'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <p className="text-gray-600 mb-6">{active.blurb}</p>

                <div role="tabpanel" key={tool}>
                    {tool === 'hlb' && <HlbTool params={params} />}
                    {tool === 'ph' && <PhDoseTool params={params} />}
                    {tool === 'dilution' && <DilutionTool />}
                    {tool === 'preservative' && <PreservativeTool params={params} />}
                    {tool === 'units' && <UnitsTool />}
                </div>

                <p className="text-xs text-gray-500 mt-8">These calculators are aids, not a substitute for supplier datasheets or safety testing. Always test pH and stability on your own batches.</p>
            </main>
        </div>
    );
}
