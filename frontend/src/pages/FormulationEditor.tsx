import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FormulationCompanion from '../components/FormulationCompanion';
import RecommendationsPanel from '../components/RecommendationsPanel';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import CustomModal from '../components/CustomModal';

// 1. Define Types for the Database and Formula state
type DatabaseIngredient = {
    id: string;
    inci_name: string;
    trade_name: string;
    function: string;
    solubility: string;
    max_heating_temp_c: number | null;
    optimal_ph_min: number | null;
    optimal_ph_max: number | null;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
    description?: string;
    common_uses?: string;
    min_percentage?: number | null;
    max_percentage?: number | null;
    QS?: boolean; // Flag to indicate if this ingredient is a Q.S. (Quantity Sufficient) ingredient
};

type FormulaIngredient = DatabaseIngredient & {
    phase: 'A' | 'B' | 'C';
    percentage: number;
    isQS: boolean; // Flag to indicate if this ingredient is a Q.S. (Quantity Sufficient) ingredient
};

type ProfileConfig = {
    id: string;
    name: string;
    category: string;
    max_oil_phase_percent: number | null;
    default_ph_min: number | null;
    default_ph_max: number | null;
};

const FormulationEditor = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Batch setup state
    const [targetWeight, setTargetWeight] = useState<number>(100);

    // State for inline project name editing
    const [projectName, setProjectName] = useState('New Project');
    const [isEditingName, setIsEditingName] = useState(false);

    // Validation state
    const [profileId, setProfileId] = useState('');
    const [alerts, setAlerts] = useState<{ type: 'error' | 'warning' | 'success', message: string }[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [activeProfile, setActiveProfile] = useState<ProfileConfig | null>(null);
    const [formulaId, setFormulaId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // New State for Search and Ingredients
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<DatabaseIngredient[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [formulaIngredients, setFormulaIngredients] = useState<FormulaIngredient[]>([]);
    const [selectedIngredient, setSelectedIngredient] = useState<DatabaseIngredient | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    const { id } = useParams();

    const [modal, setModal] = useState({
        isOpen: false,
        type: 'error' as 'error' | 'success',
        title: '',
        message: ''
    });

    useEffect(() => {
        const loadSavedFormulation = async () => {
            if (!id || id === 'new') return;

            try {
                // 1. Fetch top-level formulation data
                const { data: formulation, error: formError } = await supabase
                    .from('formulations')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (formError) throw formError;

                setFormulaId(formulation.id);
                setProjectName(formulation.name);
                setProfileId(formulation.profile_id);
                setTargetWeight(formulation.target_weight_g);

                if (formulation.profile_id) {
                    const { data: profileData } = await supabase
                        .from('formulation_profiles')
                        .select('*')
                        .eq('id', formulation.profile_id)
                        .single();

                    if (profileData) setActiveProfile(profileData);
                }

                // 2. Fetch phases and associated ingredients in a joined query
                const { data: phaseData, error: phaseError } = await supabase
                    .from('formulation_phases')
                    .select(`
                        id,
                        phase_letter,
                        formulation_ingredients (
                            percentage,
                            is_qs,
                            ingredients (*)
                        )
                    `)
                    .eq('formulation_id', id);

                if (phaseError) throw phaseError;

                // 3. Reconstruct the flat formulaIngredients array for the UI
                const loadedIngredients: any[] = [];

                phaseData?.forEach(phase => {
                    phase.formulation_ingredients?.forEach((fi: any) => {
                        if (fi.ingredients) {
                            loadedIngredients.push({
                                ...fi.ingredients,
                                phase: phase.phase_letter,
                                percentage: Number(fi.percentage), // Ensure it's a number, not a string from Postgres
                                isQS: fi.is_qs || false,
                                originalIndex: loadedIngredients.length // <--- CRITICAL for your UI table mapping
                            });
                        }
                    });
                });

                setFormulaIngredients(loadedIngredients);

            } catch (error) {
                console.error("Error loading formulation:", error);
                setModal({ isOpen: true, type: 'error', title: 'Missing Profile', message: 'Could not load the formulation data.' });
            }
        };

        loadSavedFormulation();
    }, [id]);

    // Debounced Database Search Effect
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
                .or(`trade_name.ilike.%${cleanTerm}%,inci_name.ilike.%${cleanTerm}%,function.ilike.%${cleanTerm}%`)
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

    // Helper: Determine phase based on formulation chemistry rules
    const determinePhase = (ingredient: DatabaseIngredient): 'A' | 'B' | 'C' => {
        // 1. Any ingredient with max heat tolerance <= 50°C MUST go into Phase C (Cool Down)
        if (ingredient.max_heating_temp_c !== null && ingredient.max_heating_temp_c <= 50) {
            return 'C';
        }

        // 2. Oil-soluble ingredients that can withstand heating go to Phase B (Oil Phase)
        if (ingredient.solubility === 'oil') {
            return 'B';
        }

        // 3. Water-soluble/dispersible heat-tolerant ingredients go to Phase A (Water Phase)
        return 'A';
    };

    // Add Ingredient Handler
    const handleAddIngredient = (ingredient: DatabaseIngredient) => {
        const assignedPhase = determinePhase(ingredient);

        // Calculate smart default percentage based on safe ranges
        let defaultPct = 0;
        const min = ingredient.min_usage_pct;
        const max = ingredient.max_usage_pct;

        if (min !== null && max !== null && min !== undefined && max !== undefined) {
            if (ingredient.function === "Preservative") {
                // Always default preservatives to their maximum safe limit
                defaultPct = max;
            } else {
                // Default others to the mathematical median
                defaultPct = parseFloat(((min + max) / 2).toFixed(2));
            }
        } else if (max !== null && max !== undefined) {
            // If only max is defined
            defaultPct = ingredient.function === "Preservative" ? max : parseFloat((max / 2).toFixed(2));
        } else if (min !== null && min !== undefined) {
            // If only min is defined
            defaultPct = min;
        }

        const newIngredient: FormulaIngredient = {
            ...ingredient,
            phase: assignedPhase,
            percentage: defaultPct,
            isQS: false // Initialize the Q.S. flag
        };

        setFormulaIngredients(prev => [...prev, newIngredient]);
        setSearchTerm(''); // Clear search bar
        setSearchResults([]); // Close dropdown
    };

    // Handler allowing formulators to manually override an ingredient's phase
    const handlePhaseChange = (index: number, newPhase: 'A' | 'B' | 'C') => {
        setFormulaIngredients(prev => {
            const updated = [...prev];
            updated[index].phase = newPhase;
            return updated;
        });
    };

    // Update Ingredient Percentage Handler
    const handlePercentageChange = (index: number, newPct: string) => {
        const value = parseFloat(newPct) || 0;
        setFormulaIngredients(prev => {
            const updated = [...prev];
            updated[index].percentage = value;
            return updated;
        });
    };

    const handleProfileChange = async (newProfileId: string) => {
        setProfileId(newProfileId);

        // 1. Fetch Profile Data
        const { data: profileData, error: profileError } = await supabase
            .from('formulation_profiles')
            .select('*')
            .eq('id', newProfileId)
            .single();

        if (!profileError && profileData) {
            setActiveProfile(profileData);

            // 2. Auto-populate or update Water if required
            if (profileData.requires_water) {
                const { data: aquaData } = await supabase
                    .from('ingredients')
                    .select('*')
                    .eq('inci_name', 'Aqua')
                    .single();

                if (aquaData) {
                    setFormulaIngredients(prev => {
                        const waterIndex = prev.findIndex(ing => ing.inci_name === 'Aqua');

                        if (waterIndex >= 0) {
                            // Water exists: force it to be the Q.S. base
                            const updated = [...prev];
                            updated.forEach(ing => ing.isQS = false); // Clear others
                            updated[waterIndex] = { ...updated[waterIndex], isQS: true };
                            return updated;
                        } else {
                            // Water doesn't exist: add it to Phase A as the 100% Q.S. base
                            const waterIngredient: FormulaIngredient = {
                                ...aquaData,
                                phase: 'A',
                                percentage: 100, // Starts at 100, auto-balances down
                                isQS: true       // Automatically designated as Q.S.
                            };

                            // Clear any existing Q.S. flags before adding
                            const updatedPrev = prev.map(ing => ({ ...ing, isQS: false }));
                            return [...updatedPrev, waterIngredient];
                        }
                    });
                }
            }
        }
    };

    const removeIngredient = (index: number) => {
        setFormulaIngredients(prev => prev.filter((_, i) => i !== index));
    };

    useEffect(() => {
        if (!profileId) return;

        const validateFormula = async () => {
            const totalPct = formulaIngredients.reduce((sum, item) => sum + item.percentage, 0);

            // Calculate Oil Phase (Phase B or oil soluble)
            const oilPhasePct = formulaIngredients
                .filter(i => i.phase === 'B' || i.solubility === 'oil')
                .reduce((sum, item) => sum + item.percentage, 0);

            // Add: Calculate Water Phase (Phase A or water soluble)
            const waterPhasePct = formulaIngredients
                .filter(i => i.phase === 'A' || i.solubility === 'water')
                .reduce((sum, item) => sum + item.percentage, 0);

            const payload = {
                profileId,
                profile: activeProfile,
                ingredients: formulaIngredients.map(i => ({
                    id: i.id,
                    name: i.inci_name,
                    trade_name: i.trade_name,
                    function: i.function,
                    phase: i.phase, // Sends 'A', 'B', or 'C'
                    percentage: i.percentage,
                    solubility: i.solubility,
                    optimal_ph_min: i.optimal_ph_min,
                    optimal_ph_max: i.optimal_ph_max,
                    max_heating_temp_c: i.max_heating_temp_c,
                    min_percentage: i.min_usage_pct,
                    max_percentage: i.max_usage_pct
                })),
                totalPercentage: totalPct,
                oilPhasePercentage: oilPhasePct,
                waterPhasePercentage: waterPhasePct // Send to backend
            };

            const { data, error } = await supabase.functions.invoke('validate-formula', {
                body: payload
            });

            if (data?.alerts) {
                setAlerts(data.alerts);
                setRecommendations(data.recommendations || []);
            } else if (error) {
                console.error("Validation error:", error);
            }
        };

        const debounceTimer = setTimeout(() => {
            validateFormula();
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [profileId, activeProfile, formulaIngredients]);

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

    // Auto-balance the Q.S. ingredient
    useEffect(() => {
        const qsIndex = formulaIngredients.findIndex(i => i.isQS);

        if (qsIndex !== -1) {
            // Sum everything EXCEPT the Q.S. ingredient
            const fixedTotal = formulaIngredients
                .filter((_, idx) => idx !== qsIndex)
                .reduce((sum, i) => sum + (i.percentage || 0), 0);

            // Calculate remaining balance (prevent negative numbers)
            const newBalance = Math.max(0, parseFloat((100 - fixedTotal).toFixed(2)));

            // Only update state if the balance actually changed to prevent infinite loops
            if (formulaIngredients[qsIndex].percentage !== newBalance) {
                const updated = [...formulaIngredients];
                updated[qsIndex].percentage = newBalance;
                setFormulaIngredients(updated);
            }
        }
    }, [formulaIngredients]);

    const handleSave = async () => {
        if (!profileId) {
            setModal({ isOpen: true, type: 'error', title: 'Missing Profile', message: 'Please select a product profile before saving.' });
            return;
        }
        if (!user) {
            setModal({ isOpen: true, type: 'error', title: 'Not Logged In', message: 'You must be logged in to save.' });
            return;
        }

        setIsSaving(true);

        try {
            // 1. Prepare top-level formulation data
            const formulationData = {
                name: projectName,
                profile_id: profileId,
                target_weight_g: targetWeight,
                user_id: user.id,
                status: 'Draft' // Matches your ERD status column
            };

            let currentFormulationId = formulaId;

            // 2. Insert or Update the formulations table
            if (currentFormulationId) {
                const { error: updateError } = await supabase
                    .from('formulations')
                    .update(formulationData)
                    .eq('id', currentFormulationId);

                if (updateError) throw updateError;
            } else {
                const { data: newFormulation, error: insertError } = await supabase
                    .from('formulations')
                    .insert([formulationData])
                    .select('id')
                    .single();

                if (insertError) throw insertError;
                currentFormulationId = newFormulation.id;
                setFormulaId(currentFormulationId);
            }

            // 3. Clean up old phases (cascades to delete old ingredients)
            if (formulaId) {
                const { error: deleteError } = await supabase
                    .from('formulation_phases')
                    .delete()
                    .eq('formulation_id', currentFormulationId);

                if (deleteError) throw deleteError;
            }

            // 4. Determine unique phases used ('A', 'B', etc.) and insert them
            const uniquePhases = Array.from(new Set(formulaIngredients.map(ing => ing.phase)));

            if (uniquePhases.length > 0) {
                const phasesToInsert = uniquePhases.map(phaseLetter => ({
                    formulation_id: currentFormulationId,
                    phase_letter: phaseLetter
                }));

                const { data: insertedPhases, error: phaseError } = await supabase
                    .from('formulation_phases')
                    .insert(phasesToInsert)
                    .select('id, phase_letter');

                if (phaseError) throw phaseError;

                // 5. Map ingredients to their new phase IDs and insert
                const ingredientsToInsert = formulaIngredients.map(ing => {
                    const matchedPhase = insertedPhases.find(p => p.phase_letter === ing.phase);
                    return {
                        phase_id: matchedPhase!.id,
                        ingredient_id: ing.id,
                        percentage: ing.percentage,
                        is_qs: ing.isQS || false
                    };
                });

                const { error: ingredientsError } = await supabase
                    .from('formulation_ingredients')
                    .insert(ingredientsToInsert);

                if (ingredientsError) throw ingredientsError;
            }

            setModal({ isOpen: true, type: 'success', title: 'Save Successful', message: 'Your project has been saved successfully.' });
        } catch (error: any) {
            console.error("Error saving formula:", error.message || error);
            setModal({ isOpen: true, type: 'error', title: 'Save Failed', message: `Failed to save project: ${error.message || "Check the console for details."}` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClone = async () => {
        if (!profileId) {
            setModal({ isOpen: true, type: 'error', title: 'Missing Profile', message: 'Please select a product profile before cloning.' });
            return;
        }
        if (!user) {
            setModal({ isOpen: true, type: 'error', title: 'Not Logged In', message: 'You must be logged in to clone.' });
            return;
        }

        setIsSaving(true); // Re-using the saving state for the button spinner
        const clonedProjectName = `${projectName} - Copy`;

        try {
            // 1. Prepare cloned formulation data as a new entity
            const formulationData = {
                name: clonedProjectName,
                profile_id: profileId,
                target_weight_g: targetWeight,
                user_id: user.id,
                status: 'Draft'
            };

            // 2. Insert as a NEW formulation (generates a new UUID)
            const { data: newFormulation, error: insertError } = await supabase
                .from('formulations')
                .insert([formulationData])
                .select('id')
                .single();

            if (insertError) throw insertError;
            const newFormulationId = newFormulation.id;

            // 3. Determine unique phases and insert them tied to the NEW ID
            const uniquePhases = Array.from(new Set(formulaIngredients.map(ing => ing.phase)));

            if (uniquePhases.length > 0) {
                const phasesToInsert = uniquePhases.map(phaseLetter => ({
                    formulation_id: newFormulationId,
                    phase_letter: phaseLetter
                }));

                const { data: insertedPhases, error: phaseError } = await supabase
                    .from('formulation_phases')
                    .insert(phasesToInsert)
                    .select('id, phase_letter');

                if (phaseError) throw phaseError;

                // 4. Map existing ingredients to their new cloned phase IDs and insert
                const ingredientsToInsert = formulaIngredients.map(ing => {
                    const matchedPhase = insertedPhases.find(p => p.phase_letter === ing.phase);
                    return {
                        phase_id: matchedPhase!.id,
                        ingredient_id: ing.id,
                        percentage: ing.percentage,
                        is_qs: ing.isQS || false
                    };
                });

                const { error: ingredientsError } = await supabase
                    .from('formulation_ingredients')
                    .insert(ingredientsToInsert);

                if (ingredientsError) throw ingredientsError;
            }

            // 5. Update local state to reflect the new project
            setProjectName(clonedProjectName);
            setFormulaId(newFormulationId);

            // 6. Update the URL so a standard page refresh loads the cloned project
            navigate(`/studio/${newFormulationId}`, { replace: true });

            setModal({ isOpen: true, type: 'success', title: 'Clone Successful', message: 'Your project has been cloned successfully.' });
        } catch (error: any) {
            console.error("Error cloning formula:", error.message || error);
            setModal({ isOpen: true, type: 'error', title: 'Clone Failed', message: `Failed to clone project: ${error.message || "Check the console for details."}` });
        } finally {
            setIsSaving(false);
        }
    };

    const totalPercentage = formulaIngredients.reduce((sum, i) => sum + (i.percentage || 0), 0);
    const fixedTotal = formulaIngredients.filter(i => !i.isQS).reduce((sum, i) => sum + (i.percentage || 0), 0);
    const qsTotal = formulaIngredients.filter(i => i.isQS).reduce((sum, i) => sum + (i.percentage || 0), 0);
    const isOverLimit = totalPercentage > 100;

    const cyclePhase = (current: 'A' | 'B' | 'C', dir: number): 'A' | 'B' | 'C' => {
        const phases: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
        let idx = phases.indexOf(current) + dir;
        if (idx < 0) idx = 2;
        if (idx > 2) idx = 0;
        return phases[idx];
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
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
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
                                    <div className="relative flex items-center">
                                        <input
                                            type="number"
                                            min="1"
                                            step="any"
                                            value={targetWeight || ''}
                                            onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 0)}
                                            className="w-24 border border-[#c1d1b9] rounded px-2 py-1 pr-6 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                                            placeholder="100"
                                        />
                                        <span className="absolute right-2 text-xs text-gray-500 pointer-events-none">g</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label htmlFor="profile-select" className="text-sm text-gray-600 font-medium">Profile:</label>
                                    <select
                                        id="profile-select"
                                        value={profileId}
                                        onChange={(e) => handleProfileChange(e.target.value)}
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

                                {activeProfile && (
                                    <div className="mt-3 bg-[#e9eee7] border border-[#c1d1b9] rounded-md px-3 py-1.5 flex flex-wrap items-center gap-4 text-xs text-[#2c4c3b]">
                                        <span className="font-semibold">{activeProfile.name} Specifications:</span>
                                        {activeProfile.default_ph_min && activeProfile.default_ph_max && (
                                            <span>Target pH: <strong>{activeProfile.default_ph_min} – {activeProfile.default_ph_max}</strong></span>
                                        )}
                                        {activeProfile.max_oil_phase_percent !== null && (
                                            <span>Max Oil Phase: <strong>≤ {activeProfile.max_oil_phase_percent}%</strong></span>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`px-4 py-1.5 text-white rounded shadow-sm text-sm font-medium transition-colors 
        ${isSaving ? 'bg-[#3a5a4a] cursor-not-allowed' : 'bg-[#1f382a] hover:bg-[#2c4c3b]'}`}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={handleClone}
                                disabled={isSaving || !formulaId}
                                title={!formulaId ? "Save this project first before cloning" : "Duplicate this formula"}
                                className={`px-4 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium transition-colors
        ${isSaving || !formulaId ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                            >
                                Clone
                            </button>
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
                                placeholder="Search by ingredient, INCI, or function (e.g. emulsifier, active)..."
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

                        {(['A', 'B', 'C'] as const).map((phaseLetter) => {
                            const phaseNames = {
                                A: 'PHASE A (Water Phase)',
                                B: 'PHASE B (Oil Phase)',
                                C: 'PHASE C (Cool Down Phase)'
                            };
                            const phaseHeaderBg = {
                                A: 'bg-[#cbd8d0]',
                                B: 'bg-[#e6e1cd]',
                                C: 'bg-[#bdcdbd]'
                            };

                            const phaseItems = getPhaseIngredients(phaseLetter);

                            return (
                                <div key={phaseLetter}>
                                    {/* Phase Header */}
                                    <div className={`${phaseHeaderBg[phaseLetter]} px-4 py-2 font-semibold flex justify-between border-t first:border-t-0 border-[#c1d1b9]`}>
                                        <span>{phaseNames[phaseLetter]}</span>
                                        <span className="text-xs font-normal text-gray-700">
                                            {phaseItems.reduce((sum, item) => sum + item.percentage, 0).toFixed(2)}%
                                        </span>
                                    </div>

                                    {/* Phase Table or Empty State */}
                                    {phaseItems.length === 0 ? (
                                        <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-gray-100">
                                            No ingredients added to Phase {phaseLetter} yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse table-fixed min-w-[650px]">
                                                <tr className="border-b border-gray-200 text-xs text-gray-500">
                                                    <th className="px-4 py-2 font-medium w-[38%]">Ingredient</th>
                                                    <th className="px-4 py-2 font-medium w-[21%]">Function</th>
                                                    <th className="px-4 py-2 font-medium w-[13%] text-center">Phase</th>
                                                    <th className="px-4 py-2 font-medium w-[12%]">Target %</th>
                                                    <th className="px-4 py-2 font-medium w-[10%]">Weight (g)</th>
                                                    <th className="px-4 py-2 font-medium w-[6%] text-center">Action</th>
                                                </tr>
                                                <tbody>
                                                    {phaseItems.map((item) => (
                                                        <tr key={item.originalIndex} className="border-b border-gray-100 hover:bg-gray-50">
                                                            <td className="px-4 py-2 font-medium text-[#1f382a] truncate">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedIngredient(item);
                                                                        setIsModalOpen(true);
                                                                    }}
                                                                    className="hover:underline hover:text-[#2c4c3b] text-left transition-colors flex flex-col"
                                                                    title="View ingredient details"
                                                                >
                                                                    <span>{item.trade_name}</span>
                                                                    <span className="text-[10px] text-gray-500 font-normal">{item.inci_name}</span>
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-2 text-gray-600 truncate">{item.function}</td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button
                                                                        onClick={() => handlePhaseChange(item.originalIndex, cyclePhase(item.phase, -1))}
                                                                        className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                                    >
                                                                        ◀
                                                                    </button>
                                                                    <span className="font-bold text-gray-700 w-4 text-center">{item.phase}</span>
                                                                    <button
                                                                        onClick={() => handlePhaseChange(item.originalIndex, cyclePhase(item.phase, 1))}
                                                                        className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                                    >
                                                                        ▶
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex flex-col justify-center">
                                                                    <div className="relative w-16">
                                                                        <input
                                                                            type="number"
                                                                            step="0.5"
                                                                            min="0"
                                                                            max="100"
                                                                            value={item.percentage === 0 ? '' : item.percentage}
                                                                            disabled={item.isQS}
                                                                            onChange={(e) => handlePercentageChange(item.originalIndex, e.target.value)}
                                                                            className={`w-full border rounded py-0.5 pl-1.5 pr-4 text-sm outline-none focus:ring-1 
                    [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]
                    ${item.isQS
                                                                                    ? 'bg-blue-50 text-blue-700 font-bold border-blue-200 cursor-not-allowed'
                                                                                    : 'bg-white text-gray-800 border-gray-200 focus:ring-[#2c4c3b]'
                                                                                }
                    ${!item.isQS && ((item.min_usage_pct !== null && item.percentage < item.min_usage_pct && item.percentage > 0) || (item.max_usage_pct !== null && item.percentage > item.max_usage_pct))
                                                                                    ? 'border-amber-500 text-amber-700 focus:ring-amber-500'
                                                                                    : ''
                                                                                }`}
                                                                            placeholder="0"
                                                                        />
                                                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
                                                                    </div>

                                                                    {/* Status / Range Badge */}
                                                                    <div className="mt-1">
                                                                        {item.isQS ? (
                                                                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Q.S. Base</span>
                                                                        ) : (
                                                                            (item.min_usage_pct !== null || item.max_usage_pct !== null) && (
                                                                                <span
                                                                                    className={`text-[10px] leading-tight font-mono tracking-tighter ${(item.min_usage_pct !== null && item.percentage < item.min_usage_pct && item.percentage > 0) ||
                                                                                        (item.max_usage_pct !== null && item.percentage > item.max_usage_pct)
                                                                                        ? 'text-amber-600 font-semibold'
                                                                                        : 'text-gray-400'
                                                                                        }`}
                                                                                    title={`Recommended range: ${item.min_usage_pct ?? 0}% - ${item.max_usage_pct ?? 100}%`}
                                                                                >
                                                                                    {item.min_usage_pct !== null && item.max_usage_pct !== null
                                                                                        ? `${item.min_usage_pct}–${item.max_usage_pct}%`
                                                                                        : item.max_usage_pct !== null
                                                                                            ? `≤${item.max_usage_pct}%`
                                                                                            : `≥${item.min_usage_pct}%`}
                                                                                </span>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-gray-600">
                                                                {item.percentage
                                                                    ? `${((item.percentage / 100) * targetWeight).toFixed(2)}g`
                                                                    : '0.00g'}
                                                            </td>
                                                            <td
                                                                className="px-4 py-2 text-gray-400 cursor-pointer hover:text-red-500 text-center"
                                                                onClick={() => removeIngredient(item.originalIndex)}
                                                                title="Remove ingredient"
                                                            >
                                                                🗑
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Total Footer */}
                        <div className="bg-[#f0f4ef] px-4 py-3 text-right font-medium flex justify-end gap-2 items-center border-t border-[#c1d1b9]">
                            <span>
                                Total: {currentTotalPercentage.toFixed(2)}% | {((currentTotalPercentage / 100) * targetWeight).toFixed(2)}g
                                {targetWeight > 0 && ` (of ${targetWeight.toFixed(2)}g target)`}
                            </span>
                            {Math.abs(currentTotalPercentage - 100) > 0.001 && (
                                <span
                                    className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-white"
                                    title="Formula total must equal 100%"
                                >
                                    !
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 p-5 bg-white rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex justify-between mb-3 text-sm font-medium">
                            <span className="text-gray-700 uppercase tracking-wide text-xs font-bold">Formula Allocation</span>
                            <span className={isOverLimit ? 'text-red-600 font-bold' : 'text-[#1f382a] font-bold'}>
                                {totalPercentage.toFixed(2)}% / 100.00%
                            </span>
                        </div>

                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                            {/* Fixed Ingredients (Green) */}
                            <div
                                className="bg-[#c1d1b9] h-full transition-all duration-300"
                                style={{ width: `${Math.min(fixedTotal, 100)}%` }}
                            />
                            {/* Q.S. Auto-balance (Blue) */}
                            <div
                                className="bg-blue-300 h-full transition-all duration-300"
                                style={{ width: `${Math.min(qsTotal, Math.max(0, 100 - fixedTotal))}%` }}
                            />
                            {/* Over Limit (Red) - Only shows if > 100% */}
                            {isOverLimit && (
                                <div
                                    className="bg-red-400 h-full transition-all duration-300"
                                    style={{ width: `${totalPercentage - 100}%` }}
                                />
                            )}
                        </div>

                        {isOverLimit && (
                            <p className="text-red-500 text-xs mt-3 flex items-center gap-1">
                                <span>⚠️</span> Formula exceeds 100%. Please reduce fixed ingredient percentages.
                            </p>
                        )}
                    </div>
                </div>

                {/* Ingredient Details Modal */}
                {isModalOpen && selectedIngredient && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
                            {/* Header */}
                            <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-[#1f382a]">{selectedIngredient.trade_name}</h3>
                                    <p className="text-xs text-gray-600 font-mono">{selectedIngredient.inci_name}</p>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-gray-500 hover:text-gray-800 text-xl font-bold leading-none"
                                >
                                    &times;
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 text-sm text-gray-700 space-y-4">
                                <div>
                                    <h4 className="font-semibold text-gray-900 mb-1">Summary</h4>
                                    <p>{selectedIngredient.description || 'No summary available.'}</p>
                                </div>

                                <div>
                                    <h4 className="font-semibold text-gray-900 mb-1">Common Uses</h4>
                                    <p>{selectedIngredient.common_uses || 'No common uses specified.'}</p>
                                </div>

                                <div>
                                    <h4 className="font-semibold text-gray-900 mb-2">Key Attributes</h4>
                                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded border border-gray-100 text-xs">
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">Function</span>
                                            <span className="font-medium">{selectedIngredient.function}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">Solubility</span>
                                            <span className="font-medium capitalize">{selectedIngredient.solubility}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">Usage Rate</span>
                                            <span className="font-medium">
                                                {selectedIngredient.min_usage_pct ?? 0}% – {selectedIngredient.max_usage_pct ?? 100}%
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">Optimal pH</span>
                                            <span className="font-medium">
                                                {selectedIngredient.optimal_ph_min && selectedIngredient.optimal_ph_max
                                                    ? `${selectedIngredient.optimal_ph_min} – ${selectedIngredient.optimal_ph_max}`
                                                    : 'Broad / Not specified'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">Heat Tolerance</span>
                                            <span className="font-medium">
                                                {selectedIngredient.max_heating_temp_c
                                                    ? `≤ ${selectedIngredient.max_heating_temp_c}°C`
                                                    : 'Heat stable'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-[#2c4c3b] text-white text-sm rounded hover:bg-[#1f382a] transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Column: Sidebar */}
                <div className="flex flex-col gap-0">
                    {/* Pass alerts to the Companion */}
                    <FormulationCompanion
                        alerts={alerts}
                        hasProfile={!!activeProfile}
                    />
                    <RecommendationsPanel recommendations={recommendations} />
                </div>

            </div>

            <CustomModal
                isOpen={modal.isOpen}
                type={modal.type}
                title={modal.title}
                message={modal.message}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default FormulationEditor;