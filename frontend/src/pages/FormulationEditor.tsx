import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FormulationCompanion from '../components/FormulationCompanion';
import RecommendationsPanel from '../components/RecommendationsPanel';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/api';
import { saveFormulation } from '../lib/saveFormulation';
import { settleQS } from '../lib/qs';
import { applyImmediateFix, isFixApplicable } from '../lib/fixes';
import { CATEGORY_INFO, suggestIngredients } from '../lib/fixSuggestions';
import type { Fix, FixCategory } from '../types/fixes';
import FixSuggestionModal from '../components/FixSuggestionModal';
import FixToast from '../components/FixToast';
import MakeBatchModal from '../components/MakeBatchModal';
import { clearDraft, formulaSnapshot, loadDraft, saveDraft, type FormulaDraft } from '../lib/draftStore';
import { useAutosave } from '../hooks/useAutosave';
import { notifyBatchesChanged } from '../hooks/useDueChecks';
import AutosaveIndicator from '../components/AutosaveIndicator';
import { useAuth } from '../contexts/AuthContext';
import CustomModal from '../components/CustomModal';
import { ClaimsPanel } from '../components/ClaimsPanel';
import type { MarketingClaim, ClaimViolation } from '../types/claims';
import FormulationCostCalculator from '../components/FormulationCostCalculator';
import { useSettings } from '../contexts/SettingsContext';
import ShareFormulaModal from '../components/ShareFormulaModal';
import Header from '../components/Header';
import GuidedTour from '../components/GuidedTour';
import { EDITOR_TOUR_STEPS } from '../components/editorTourSteps';
import SubstitutionHint from '../components/SubstitutionHint';
import BalancePreviewModal from '../components/BalancePreviewModal';
import { Lock, LockOpen, PackageCheck, Scale } from 'lucide-react';
import { balanceFormula, inferKind, isWaterBase, startingPercentage, type BalanceResult } from '../lib/autoBalance';
import { fixToolLink, toolsUrl } from '../lib/toolLinks';
import {
    analyzeFormula,
    buildSourcingPayload,
    displayName,
    type CatalogIngredient,
    type StashEntry,
    type SubstituteOption,
} from '../lib/substitutions';

const TOUR_SEEN_KEY = 'formularium.editorTourSeen';
const STASH_CHECK_KEY = 'formularium.stashCheckHidden';
const AUTO_BALANCE_KEY = 'formularium.autoBalance';

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
    ionic_charge?: string | null;
    default_min_usage?: number | null;
    default_max_usage?: number | null;
    min_usage_pct: number | null;
    max_usage_pct: number | null;
    description?: string;
    common_uses?: string;
    min_percentage?: number | null;
    max_percentage?: number | null;
    QS?: boolean;
};

type FormulaIngredient = DatabaseIngredient & {
    phase: 'A' | 'B' | 'C';
    percentage: number;
    isQS: boolean;
    originalIndex?: number;
    is_vegan?: boolean;
    is_sulfate?: boolean;
    is_silicone?: boolean;
    is_paraben?: boolean;
    is_fragrance?: boolean;
    cosmos_compliant?: boolean;
    comedogenic_rating?: number;
    cas_number?: string | null;
    substitutedFor?: FormulaIngredient; // in-memory only, lets the user undo a swap
    locked?: boolean; // in-memory only: balancing never changes a locked percentage
};

type ProfileConfig = {
    id: string;
    name: string;
    category: string;
    max_oil_phase_percent: number | null;
    default_ph_min: number | null;
    default_ph_max: number | null;
    requires_water?: boolean;
    requires_oil?: boolean;
    requires_emulsifier?: boolean;
    requires_preservative?: boolean;
};

// Shape the backend expects for validation and PDF exports
const toApiIngredient = (i: FormulaIngredient) => ({
    id: i.id,
    name: `${i.inci_name || ''} ${i.trade_name || ''}`.trim() || "Unknown",
    inciName: i.inci_name || null,
    tradeName: i.trade_name || null,
    casNumber: i.cas_number || null,
    function: i.function || "None",
    phase: i.phase || "A",
    percentage: i.percentage || 0,
    solubility: i.solubility || "water",
    maxHeatingTempC: i.max_heating_temp_c ?? null,
    minPercentage: i.min_usage_pct ?? i.min_percentage ?? null,
    maxPercentage: i.max_usage_pct ?? i.max_percentage ?? null,
    isVegan: i.is_vegan ?? null,
    isSulfate: i.is_sulfate ?? null,
    isSilicone: i.is_silicone ?? null,
    isParaben: i.is_paraben ?? null,
    isFragrance: i.is_fragrance ?? null,
    cosmosCompliant: i.cosmos_compliant ?? null,
    comedogenicRating: i.comedogenic_rating ?? null,
    ionicCharge: i.ionic_charge ?? null,
    optimalPhMin: i.optimal_ph_min ?? null,
    optimalPhMax: i.optimal_ph_max ?? null
});

const FormulationEditor = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Batch setup state
    const [targetWeight, setTargetWeight] = useState<number>(100);
    const [targetPh, setTargetPh] = useState<number | null>(5.5);

    // State for inline project name editing
    const [projectName, setProjectName] = useState('New Project');
    const [isEditingName, setIsEditingName] = useState(false);

    // Validation state
    const [profileId, setProfileId] = useState('');
    const [alerts, setAlerts] = useState<{ type: 'error' | 'warning' | 'success', message: string, fix?: Fix }[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [activeProfile, setActiveProfile] = useState<ProfileConfig | null>(null);
    const [formulaId, setFormulaId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [targetClaims, setTargetClaims] = useState<MarketingClaim[]>([]);
    const [claimViolations, setClaimViolations] = useState<ClaimViolation[]>([]);
    const [communityPostId, setCommunityPostId] = useState<string | null>(null);

    // Search and Ingredients State
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<DatabaseIngredient[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [formulaIngredients, setFormulaIngredients] = useState<FormulaIngredient[]>([]);
    const [selectedIngredient, setSelectedIngredient] = useState<DatabaseIngredient | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const isHealthCheckPassed = formulaIngredients.length > 0 && alerts.length === 0;

    const { id } = useParams();

    const [modal, setModal] = useState({
        isOpen: false,
        type: 'error' as 'error' | 'success',
        title: '',
        message: ''
    });

    const [showPrintMenu, setShowPrintMenu] = useState(false);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [isMakeBatchOpen, setIsMakeBatchOpen] = useState(false);

    // Autosave: which formula's data is loaded, and any unsaved work found from a previous session
    const routeKey = !id || id === 'new' ? 'new' : id;
    const [hydratedFor, setHydratedFor] = useState<string | null>(routeKey === 'new' ? 'new' : null);
    const [pendingDraft, setPendingDraft] = useState<FormulaDraft | null>(() => (routeKey === 'new' ? loadDraft(null) : null));
    const createdIdRef = useRef<string | null>(null);

    // Percentage balancing
    const [isBalanceOpen, setIsBalanceOpen] = useState(false);
    const [keepLipidLoad, setKeepLipidLoad] = useState(false);
    const [isAutoBalance, setIsAutoBalance] = useState(() => {
        try { return localStorage.getItem(AUTO_BALANCE_KEY) === '1'; } catch { return false; }
    });

    // Show the guided tour automatically on a user's first visit
    useEffect(() => {
        try {
            if (localStorage.getItem(TOUR_SEEN_KEY)) return;
        } catch {
            return; // storage blocked; don't nag on every visit
        }
        const timer = setTimeout(() => setIsTourOpen(true), 600); // let the layout settle first
        return () => clearTimeout(timer);
    }, []);

    // Stash check & substitutions
    const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
    const [stashEntries, setStashEntries] = useState<StashEntry[]>([]);
    const [isStashLoaded, setIsStashLoaded] = useState(false);
    const [isStashCheckHidden, setIsStashCheckHidden] = useState(() => {
        try { return localStorage.getItem(STASH_CHECK_KEY) === '1'; } catch { return false; }
    });

    const closeTour = () => {
        setIsTourOpen(false);
        try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* ignore */ }
    };

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
                setCommunityPostId(formulation.community_post_id);
                setTargetWeight(formulation.target_weight_g || 100);
                if (formulation.target_ph) setTargetPh(formulation.target_ph);

                if (formulation.profile_id) {
                    const { data: profileData } = await supabase
                        .from('formulation_profiles')
                        .select('*')
                        .eq('id', formulation.profile_id)
                        .single();

                    if (profileData) {
                        setActiveProfile(profileData);
                        if (!formulation.target_ph && profileData.default_ph_min && profileData.default_ph_max) {
                            setTargetPh(parseFloat(((profileData.default_ph_min + profileData.default_ph_max) / 2).toFixed(1)));
                        }
                    }
                }

                // 2. Fetch phases and associated ingredients
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

                const loadedIngredients: FormulaIngredient[] = [];

                phaseData?.forEach(phase => {
                    phase.formulation_ingredients?.forEach((fi: any) => {
                        if (fi.ingredients) {
                            loadedIngredients.push({
                                ...fi.ingredients,
                                phase: phase.phase_letter,
                                percentage: Number(fi.percentage),
                                isQS: fi.is_qs || false,
                                originalIndex: loadedIngredients.length
                            });
                        }
                    });
                });

                setFormulaIngredients(loadedIngredients);
                // Autosave stays off until the whole formula has loaded, so a half-loaded state is never written back
                setPendingDraft(loadDraft(id));
                setHydratedFor(id);

            } catch (error) {
                console.error("Error loading formulation:", error);
                setModal({ isOpen: true, type: 'error', title: 'Error', message: 'Could not load the formulation data.' });
            }
        };

        loadSavedFormulation();
    }, [id]);

    useEffect(() => {
        if (!user) return;

        const fetchSourcingData = async () => {
            const [catalogRes, stashRes] = await Promise.all([
                supabase.from('ingredients').select('*'),
                supabase.from('user_stash').select('ingredient_id, amount_left_g').eq('user_id', user.id),
            ]);
            if (catalogRes.error) console.error("Error loading ingredient catalog:", catalogRes.error);
            else setCatalog(catalogRes.data ?? []);
            if (stashRes.error) console.error("Error loading stash:", stashRes.error);
            else setStashEntries(stashRes.data ?? []);
            setIsStashLoaded(!stashRes.error);
        };

        fetchSourcingData();
    }, [user]);

    // Favorites State
    const [favorites, setFavorites] = useState<DatabaseIngredient[]>([]);
    const [showFavoritesMenu, setShowFavoritesMenu] = useState(false);

    // Fetch favorites on load
    useEffect(() => {
        if (!user) return;

        const fetchFavorites = async () => {
            const { data, error } = await supabase
                .from('favorite_ingredients')
                .select('ingredients(*)')
                .eq('user_id', user.id);

            if (!error && data) {
                const validFavorites = data.map((item: any) => item.ingredients).filter(Boolean);
                setFavorites(validFavorites);
            }
        };

        fetchFavorites();
    }, [user]);

    // Toggle favorite status
    const toggleFavorite = async (ingredient: DatabaseIngredient) => {
        if (!user) return;

        const isFav = favorites.some(f => f.id === ingredient.id);

        if (isFav) {
            setFavorites(prev => prev.filter(f => f.id !== ingredient.id));
            await supabase
                .from('favorite_ingredients')
                .delete()
                .match({ user_id: user.id, ingredient_id: ingredient.id });
        } else {
            setFavorites(prev => [...prev, ingredient]);
            await supabase
                .from('favorite_ingredients')
                .insert({ user_id: user.id, ingredient_id: ingredient.id });
        }
    };

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

    const determinePhase = (ingredient: DatabaseIngredient): 'A' | 'B' | 'C' => {
        if (ingredient.max_heating_temp_c !== null && ingredient.max_heating_temp_c <= 50) {
            return 'C';
        }
        if (ingredient.solubility === 'oil') {
            return 'B';
        }
        return 'A';
    };

    // Applies a balance result: new percentages, and the filler becomes the Q.S. ingredient
    const applyBalance = (list: FormulaIngredient[], result: BalanceResult): FormulaIngredient[] =>
        list.map((ing, i) => ({
            ...ing,
            percentage: result.lines[i]?.after ?? ing.percentage,
            isQS: result.fillerIndex === null ? ing.isQS : i === result.fillerIndex,
        }));

    // In auto mode, rebalance after the formula's make-up changes (not after the user's own edits)
    const withAutoBalance = (list: FormulaIngredient[], profile: ProfileConfig | null = activeProfile) =>
        isAutoBalance && list.length > 0 ? applyBalance(list, balanceFormula(list, profile)) : list;

    const handleAddIngredient = (ingredient: DatabaseIngredient) => {
        const assignedPhase = determinePhase(ingredient);
        const kind = inferKind([...formulaIngredients, { ...ingredient, percentage: 0 }], activeProfile);

        const newIngredient: FormulaIngredient = {
            ...ingredient,
            phase: assignedPhase,
            percentage: startingPercentage({ ...ingredient, percentage: 0 }, kind),
            isQS: false
        };

        setFormulaIngredients(prev => withAutoBalance([...prev, newIngredient]));
        setSearchTerm('');
        setSearchResults([]);
    };

    // ---------- One-click fixes for alerts and insights ----------
    const [fixPicker, setFixPicker] = useState<FixCategory | null>(null);
    const [fixToast, setFixToast] = useState<{ message: string; afterSnapshot: string; undo: () => void } | null>(null);

    const fixState = { ingredients: formulaIngredients, targetPh };
    const canFix = (fix: Fix) => isFixApplicable(fix, fixState);

    const handleFix = (fix: Fix) => {
        // These two need a decision from the user, so they open a window instead of changing anything
        if (fix.kind === 'balance') { setIsBalanceOpen(true); return; }
        if (fix.kind === 'add-ingredient') { if (fix.category) setFixPicker(fix.category); return; }

        // Values set by a fix are locked while Auto is on, so the next rebalance doesn't undo them
        const result = applyImmediateFix(fix, fixState, { lockEdited: isAutoBalance });
        if (!result) return;
        const before = fixState;
        // Settle the Q.S. ingredient now, so the formula is in its final state when the confirmation appears
        const next = settleQS(fix.kind === 'remove-ingredient' ? withAutoBalance(result.state.ingredients) : result.state.ingredients);
        setFormulaIngredients(next);
        setTargetPh(result.state.targetPh);
        setFixToast({
            message: result.message,
            afterSnapshot: formulaSnapshot({ name: projectName, profileId, targetWeight, targetPh: result.state.targetPh, ingredients: next }),
            undo: () => {
                setFormulaIngredients(before.ingredients);
                setTargetPh(before.targetPh);
                setFixToast(null);
            },
        });
    };

    const fixSuggestions = useMemo(() => (fixPicker
        ? suggestIngredients(fixPicker, catalog, {
            targetPh,
            claims: targetClaims as string[],
            inFormulaIds: new Set(formulaIngredients.map(i => i.id)),
            stashIds: new Set(stashEntries.map(entry => entry.ingredient_id)),
        })
        : []), [fixPicker, catalog, targetPh, targetClaims, formulaIngredients, stashEntries]);

    const fixTool = useMemo(() => {
        if (!fixPicker) return null;
        const waterPct = formulaIngredients.filter(isWaterBase).reduce((sum, i) => sum + (i.percentage || 0), 0);
        return fixToolLink(fixPicker, { batchG: targetWeight, waterPct, targetPh });
    }, [fixPicker, formulaIngredients, targetWeight, targetPh]);

    useEffect(() => {
        if (!fixToast) return;
        const timer = setTimeout(() => setFixToast(null), 10000);
        return () => clearTimeout(timer);
    }, [fixToast]);

    const handlePhaseChange = (index: number, newPhase: 'A' | 'B' | 'C') => {
        setFormulaIngredients(prev => {
            const updated = [...prev];
            updated[index].phase = newPhase;
            return updated;
        });
    };

    const handlePercentageChange = (index: number, newPct: string) => {
        const value = parseFloat(newPct) || 0;
        setFormulaIngredients(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], percentage: value, locked: updated[index].locked || isAutoBalance };
            return updated;
        });
    };

    const toggleLock = (index: number) => {
        setFormulaIngredients(prev => prev.map((ing, i) => (i === index ? { ...ing, locked: !ing.locked } : ing)));
    };

    const toggleAutoBalance = (on: boolean) => {
        setIsAutoBalance(on);
        try { localStorage.setItem(AUTO_BALANCE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
        if (on) setFormulaIngredients(prev => (prev.length ? applyBalance(prev, balanceFormula(prev, activeProfile)) : prev));
    };

    const balancePreview = useMemo(
        () => (isBalanceOpen ? balanceFormula(formulaIngredients, activeProfile, { keepLipidLoad }) : null),
        [isBalanceOpen, formulaIngredients, activeProfile, keepLipidLoad]
    );

    const handleProfileChange = async (newProfileId: string) => {
        setProfileId(newProfileId);

        const { data: profileData, error: profileError } = await supabase
            .from('formulation_profiles')
            .select('*')
            .eq('id', newProfileId)
            .single();

        if (!profileError && profileData) {
            setActiveProfile(profileData);

            if (profileData.default_ph_min && profileData.default_ph_max) {
                setTargetPh(parseFloat(((profileData.default_ph_min + profileData.default_ph_max) / 2).toFixed(1)));
            }

            if (profileData.requires_water) {
                const { data: aquaData } = await supabase
                    .from('ingredients')
                    .select('*')
                    .eq('inci_name', 'Aqua')
                    .single();

                if (aquaData) {
                    setFormulaIngredients(prev => {
                        const waterIndex = prev.findIndex(ing => ing.inci_name.toLowerCase() === 'aqua');

                        if (waterIndex >= 0) {
                            const updated = [...prev];
                            updated.forEach(ing => ing.isQS = false);
                            updated[waterIndex] = { ...updated[waterIndex], isQS: true };
                            return withAutoBalance(updated, profileData);
                        } else {
                            const waterIngredient: FormulaIngredient = {
                                ...aquaData,
                                phase: 'A',
                                percentage: 100,
                                isQS: true
                            };
                            const updatedPrev = prev.map(ing => ({ ...ing, isQS: false }));
                            return withAutoBalance([...updatedPrev, waterIngredient], profileData);
                        }
                    });
                }
            } else {
                setFormulaIngredients(prev => withAutoBalance(prev, profileData));
            }
        }
    };

    const removeIngredient = (index: number) => {
        setFormulaIngredients(prev => withAutoBalance(prev.filter((_, i) => i !== index)));
    };

    // Auto-balance the Q.S. ingredient
    useEffect(() => {
        const settled = settleQS(formulaIngredients);
        if (settled !== formulaIngredients) setFormulaIngredients(settled);
    }, [formulaIngredients]);

    // Run Validation via Spring Boot Backend
    useEffect(() => {
        if (!profileId) return;

        const validateFormula = async () => {
            const totalPct = formulaIngredients.reduce((sum, item) => sum + (item.percentage || 0), 0);

            const oilPhasePct = formulaIngredients
                .filter(i => i.phase === 'B' || i.solubility === 'oil')
                .reduce((sum, item) => sum + (item.percentage || 0), 0);

            const waterPhasePct = formulaIngredients
                .filter(i => i.phase === 'A' || i.solubility === 'water')
                .reduce((sum, item) => sum + (item.percentage || 0), 0);

            const payload = {
                projectName: projectName || "Untitled Project",
                targetWeight: targetWeight || 100,
                profileId,
                profile: activeProfile,
                targetPh: targetPh ?? null,
                targetClaims: targetClaims,
                ingredients: formulaIngredients.map(toApiIngredient),
                totalPercentage: totalPct,
                oilPhasePercentage: oilPhasePct,
                waterPhasePercentage: waterPhasePct
            };

            try {
                const response = await fetch(apiUrl('/api/v1/validate'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();
                    setAlerts(data.alerts || []);
                    setRecommendations(data.recommendations || []);
                    setClaimViolations(data.claimViolations || []);
                } else {
                    console.error("Validation engine returned an error status:", response.status);
                }
            } catch (error) {
                console.error("Failed to connect to Spring Boot validation engine:", error);
            }
        };

        const debounceTimer = setTimeout(() => {
            validateFormula();
        }, 400);

        return () => clearTimeout(debounceTimer);
    }, [profileId, activeProfile, targetPh, targetWeight, projectName, formulaIngredients, targetClaims]);

    const handleNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditingName(false);
        }
    };

    const currentTotalPercentage = formulaIngredients.reduce((sum, item) => sum + item.percentage, 0);

    // Stock status + substitution suggestions for every row, keyed by its index
    const sourcing = useMemo(() => {
        if (!isStashLoaded || catalog.length === 0) return [];
        const lines = formulaIngredients.map(ing => ({
            ingredient: ing as unknown as CatalogIngredient,
            phase: ing.phase,
            percentage: ing.percentage || 0,
            isQS: ing.isQS,
        }));
        return analyzeFormula(lines, catalog, stashEntries, targetWeight || 100, targetPh);
    }, [formulaIngredients, catalog, stashEntries, isStashLoaded, targetWeight, targetPh]);

    const isStashEmpty = isStashLoaded && stashEntries.length === 0;
    const showStashHints = !isStashCheckHidden && !isStashEmpty;
    const missingCount = sourcing.filter(s => s.status === 'missing').length;
    const lowCount = sourcing.filter(s => s.status === 'low').length;

    const toggleStashCheck = (hidden: boolean) => {
        setIsStashCheckHidden(hidden);
        try { localStorage.setItem(STASH_CHECK_KEY, hidden ? '1' : '0'); } catch { /* ignore */ }
    };

    const handleSwap = (index: number, option: SubstituteOption) => {
        setFormulaIngredients(prev => prev.map((ing, i) => i !== index ? ing : {
            ...(option.ingredient as unknown as DatabaseIngredient),
            phase: ing.phase,
            percentage: option.percentage,
            isQS: false,
            substitutedFor: ing.substitutedFor ?? ing, // undo always returns to the recipe's original
        }));
    };

    const handleUndoSwap = (index: number) => {
        setFormulaIngredients(prev => prev.map((ing, i) =>
            i === index && ing.substitutedFor ? { ...ing.substitutedFor, phase: ing.phase } : ing
        ));
    };

    const getPhaseIngredients = (phase: 'A' | 'B' | 'C') => {
        return formulaIngredients
            .map((ing, idx) => ({ ...ing, originalIndex: idx }))
            .filter(ing => ing.phase === phase);
    };

    // ---------- Saving ----------
    const snapshot = useMemo(
        () => formulaSnapshot({ name: projectName, profileId, targetWeight, targetPh, ingredients: formulaIngredients }),
        [projectName, profileId, targetWeight, targetPh, formulaIngredients]
    );
    const isReady = hydratedFor === routeKey;
    const canAutosave = isReady && !!user && !!profileId && (!!formulaId || formulaIngredients.length > 0);

    const persist = async () => {
        if (!user) throw new Error('You must be logged in to save.');
        const existingId = formulaId ?? createdIdRef.current;
        const savedId = await saveFormulation({
            formulaId: existingId,
            userId: user.id,
            name: projectName,
            profileId,
            targetWeight,
            targetPh,
            ingredients: formulaIngredients.map(i => ({ id: i.id, phase: i.phase, percentage: i.percentage || 0, isQS: i.isQS || false })),
        });
        if (!existingId) {
            createdIdRef.current = savedId;
            setFormulaId(savedId);
            clearDraft(null);
            // From now on a reload opens this formula instead of a blank one
            window.history.replaceState(window.history.state, '', `/studio/${savedId}`);
        }
    };

    const autosave = useAutosave({ snapshot, ready: isReady, enabled: canAutosave, save: persist });

    // Keep a local copy of unsaved work; remove it once everything is saved
    const visibleDraft = pendingDraft && formulaSnapshot(pendingDraft) !== snapshot ? pendingDraft : null;
    useEffect(() => {
        if (!isReady || visibleDraft) return;
        if (!autosave.dirty) {
            clearDraft(formulaId);
            return;
        }
        const timer = setTimeout(() => saveDraft(formulaId, {
            name: projectName,
            profileId,
            targetWeight,
            targetPh,
            ingredients: formulaIngredients.map(i => ({ ...i, substitutedFor: undefined })),
        }), 400);
        return () => clearTimeout(timer);
    }, [isReady, visibleDraft, autosave.dirty, formulaId, projectName, profileId, targetWeight, targetPh, formulaIngredients]);

    const restoreDraft = async () => {
        const draft = pendingDraft;
        if (!draft) return;
        setPendingDraft(null);
        setProjectName(draft.name);
        setTargetWeight(draft.targetWeight);
        setTargetPh(draft.targetPh);
        setProfileId(draft.profileId);
        setFormulaIngredients(draft.ingredients as unknown as FormulaIngredient[]);
        if (draft.profileId) {
            const { data } = await supabase.from('formulation_profiles').select('*').eq('id', draft.profileId).single();
            if (data) setActiveProfile(data);
        }
    };

    const discardDraft = () => {
        clearDraft(formulaId);
        setPendingDraft(null);
    };

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
        const failure = await autosave.saveNow();
        if (failure) {
            console.error("Error saving formula:", failure);
            setModal({ isOpen: true, type: 'error', title: 'Save Failed', message: `Failed to save project: ${failure}` });
        } else {
            // Show the rows the way they are stored: by phase, largest first
            setFormulaIngredients(prev => [...prev].sort((a, b) =>
                a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : (b.percentage || 0) - (a.percentage || 0)));
            setModal({ isOpen: true, type: 'success', title: 'Save Successful', message: 'Your project has been saved successfully.' });
        }
        setIsSaving(false);
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

        setIsSaving(true);
        const clonedProjectName = `${projectName} Copy`;

        try {
            const formulationData = {
                name: clonedProjectName,
                profile_id: profileId,
                target_weight_g: targetWeight,
                target_ph: targetPh,
                user_id: user.id,
                status: 'Draft'
            };

            const { data: newFormulation, error: insertError } = await supabase
                .from('formulations')
                .insert([formulationData])
                .select('id')
                .single();

            if (insertError) throw insertError;
            const newFormulationId = newFormulation.id;

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

                const sortedIngredients = [...formulaIngredients].sort((a, b) => {
                    if (a.phase < b.phase) return -1;
                    if (a.phase > b.phase) return 1;
                    return (b.percentage || 0) - (a.percentage || 0);
                });

                const ingredientsToInsert = sortedIngredients.map(ing => {
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

                setFormulaIngredients(sortedIngredients);
            }

            setProjectName(clonedProjectName);
            setFormulaId(newFormulationId);
            navigate(`/studio/${newFormulationId}`, { replace: true });
            setModal({ isOpen: true, type: 'success', title: 'Clone Successful', message: 'Your project has been cloned successfully.' });
        } catch (error: any) {
            console.error("Error cloning formula:", error.message || error);
            setModal({ isOpen: true, type: 'error', title: 'Clone Failed', message: `Failed to clone project: ${error.message || "Check the console for details."}` });
        } finally {
            setIsSaving(false);
        }
    };

    const cyclePhase = (current: 'A' | 'B' | 'C', dir: number): 'A' | 'B' | 'C' => {
        const phases: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
        let idx = phases.indexOf(current) + dir;
        if (idx < 0) idx = 2;
        if (idx > 2) idx = 0;
        return phases[idx];
    };

    const handleExportPDF = async (documentType: 'pif' | 'batch' | 'shopping') => {
        setIsSaving(true);
        setShowPrintMenu(false);

        try {
            const payload = {
                projectName: projectName || "Untitled Project",
                targetWeight: targetWeight || 100,
                profileId: profileId || "Unassigned",
                profile: activeProfile || null,
                targetPh: targetPh ?? null,
                targetClaims: targetClaims,
                ingredients: formulaIngredients.map(toApiIngredient),
                totalPercentage: formulaIngredients.reduce((sum, item) => sum + (item.percentage || 0), 0),
                oilPhasePercentage: formulaIngredients.filter(i => i.phase === 'B' || i.solubility === 'oil').reduce((sum, item) => sum + (item.percentage || 0), 0),
                waterPhasePercentage: formulaIngredients.filter(i => i.phase === 'A' || i.solubility === 'water').reduce((sum, item) => sum + (item.percentage || 0), 0)
            };

            const res = await fetch(apiUrl(`/api/v1/export/${documentType}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to generate PDF");

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${projectName.replace(/\s+/g, '_')}_${documentType.toUpperCase()}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {
            console.error("PDF Export error:", error);
            setModal({ isOpen: true, type: 'error', title: 'Export Failed', message: `Could not generate the ${documentType.toUpperCase()} document.` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportSourcing = async () => {
        setIsSaving(true);
        setShowPrintMenu(false);

        try {
            const payload = buildSourcingPayload(projectName || "Untitled Project", targetWeight || 100, targetPh, sourcing);
            const res = await fetch(apiUrl('/api/v1/export/sourcing'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to generate PDF");

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${projectName.replace(/\s+/g, '_')}_SOURCING.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {
            console.error("Sourcing export error:", error);
            setModal({ isOpen: true, type: 'error', title: 'Export Failed', message: 'Could not generate the sourcing guide.' });
        } finally {
            setIsSaving(false);
        }
    };

    const calculatorIngredients = formulaIngredients.map(ing => ({
        ingredient_id: ing.id,
        name: ing.trade_name || ing.inci_name,
        percentage: ing.percentage || 0
    }));
    const { currency } = useSettings();

    return (
        <div className="min-h-screen bg-[#f3f5f2] text-[#1f382a] font-sans flex flex-col">
            {/* Top Navigation Bar */}
            <Header
                title="Formularium Workspace"
                backPath="/studio"
                backLabel="Back to Studio"
            >
                {/* Page-Specific Action: Replay the guided tour */}
                <button
                    onClick={() => setIsTourOpen(true)}
                    className="flex items-center gap-1.5 hover:text-[#2c4c3b] transition-colors"
                    title="Take a guided tour of the editor"
                >
                    <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-[11px] font-bold leading-none">?</span>
                    Guide
                </button>

                {/* Page-Specific Action: Calculators (new tab, so the open formula is untouched) */}
                <a
                    href="/tools"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2c4c3b] transition-colors"
                    title="Open the calculators in a new tab"
                >
                    Calculators
                </a>

                {/* Page-Specific Action: Favorites Dropdown */}
                <div className="relative" data-tour="favorites">
                    <button
                        onClick={() => setShowFavoritesMenu(!showFavoritesMenu)}
                        className="flex items-center gap-1.5 hover:text-[#2c4c3b] transition-colors"
                    >
                        Favorites <span className="text-red-500 text-lg leading-none">♥</span>
                    </button>

                    {showFavoritesMenu && (
                        <div className="absolute right-0 mt-3 w-80 bg-white border border-[#c1d1b9] rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
                            <div className="bg-[#e9eee7] px-4 py-2.5 border-b border-[#c1d1b9] font-bold text-[#1f382a] text-sm flex justify-between items-center">
                                Saved Ingredients
                                <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full">{favorites.length}</span>
                            </div>

                            <div className="max-h-96 overflow-y-auto">
                                {favorites.length === 0 ? (
                                    <div className="p-6 text-sm text-gray-500 text-center italic">
                                        No favorites yet. Open an ingredient's details to star it!
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {favorites.map(fav => (
                                            <li key={fav.id} className="group flex items-center justify-between p-3 hover:bg-[#f3f5f2] transition-colors">
                                                <button
                                                    onClick={() => { handleAddIngredient(fav); setShowFavoritesMenu(false); }}
                                                    className="flex-1 text-left"
                                                >
                                                    <div className="font-medium text-[#1f382a] text-sm truncate">{fav.trade_name || fav.inci_name}</div>
                                                    <div className="text-xs text-gray-500 truncate">{fav.function}</div>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(fav); }}
                                                    className="text-gray-300 hover:text-red-500 p-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-50"
                                                    title="Remove from favorites"
                                                >
                                                    ✖
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Visual divider before global links */}
                <span className="text-gray-400">|</span>
            </Header>

            {/* Main Workspace */}
            <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">

                {/* Left Column: Formulation Panel */}
                <div className="flex-1 flex flex-col gap-5">

                    {/* Title and actions share one compact row */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 w-full">
                        <div className="min-w-0 flex-1">
                            {isEditingName ? (
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    onBlur={() => setIsEditingName(false)}
                                    onKeyDown={handleNameKeyDown}
                                    autoFocus
                                    aria-label="Project name"
                                    className="w-full max-w-md text-2xl font-bold text-[#1f382a] bg-white border border-[#c1d1b9] rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                                />
                            ) : (
                                <h2 className="text-2xl font-bold text-[#1f382a] min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingName(true)}
                                        aria-label="Edit project name"
                                        title="Click to rename"
                                        className="group flex items-center gap-2 max-w-full text-left"
                                    >
                                        <span className="truncate">{projectName}</span>
                                        <svg className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-[#2c4c3b] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                </h2>
                            )}
                            <div className="mt-0.5 min-h-[1rem]">
                                <AutosaveIndicator
                                    status={autosave.status}
                                    error={autosave.error}
                                    lastSavedAt={autosave.lastSavedAt}
                                    isSavedFormula={!!formulaId}
                                    canAutosave={canAutosave}
                                    hasProfile={!!profileId}
                                    onRetry={() => { void autosave.saveNow(); }}
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0" data-tour="actions">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`px-4 py-1.5 text-white rounded shadow-sm text-sm font-medium transition-colors
                                    ${isSaving ? 'bg-[#3a5a4a] cursor-not-allowed' : 'bg-[#1f382a] hover:bg-[#2c4c3b]'}`}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => setIsMakeBatchOpen(true)}
                                disabled={isSaving || formulaIngredients.length === 0}
                                title={formulaIngredients.length === 0 ? "Add ingredients first" : "Log a real batch of this formula, optionally using up your stash"}
                                className={`px-3 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap
                                    ${isSaving || formulaIngredients.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                            >
                                <PackageCheck size={14} aria-hidden /> Make batch
                            </button>
                            <button
                                onClick={() => setIsShareModalOpen(true)}
                                disabled={isSaving || !isHealthCheckPassed}
                                title={!isHealthCheckPassed ? "Resolve all companion warnings to share this formula" : "Publish this recipe to the Community Hub"}
                                className={`px-3 py-1.5 border rounded shadow-sm text-sm font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap
                                    ${(isSaving || !isHealthCheckPassed)
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                        : 'bg-[#e9eee7] text-[#2c4c3b] border-[#c1d1b9] hover:bg-[#dbe3da]'}`}
                            >
                                <span aria-hidden>🌎</span> Share
                            </button>
                            <div className="relative">
                                <button
                                    onClick={() => setShowPrintMenu(!showPrintMenu)}
                                    disabled={isSaving}
                                    aria-haspopup="menu"
                                    aria-expanded={showPrintMenu}
                                    className="px-3 py-1.5 bg-white border border-[#c1d1b9] rounded shadow-sm text-sm font-medium hover:bg-gray-50 flex items-center gap-1 transition-colors"
                                >
                                    More
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {showPrintMenu && (
                                    <div role="menu" className="absolute right-0 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                                        <button
                                            role="menuitem"
                                            onClick={() => { setShowPrintMenu(false); void handleClone(); }}
                                            disabled={!formulaId}
                                            title={!formulaId ? "Save this project first before cloning" : "Duplicate this formula"}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Clone this formula <span className="text-xs text-gray-400" aria-hidden>⎘</span>
                                        </button>
                                        <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Print &amp; export</div>
                                        <button
                                            role="menuitem"
                                            onClick={() => handleExportPDF('batch')}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center"
                                        >
                                            Lab Batch Ticket <span className="text-xs text-gray-400" aria-hidden>🖨️</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => handleExportPDF('shopping')}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center"
                                        >
                                            Shopping List <span className="text-xs text-gray-400" aria-hidden>🛒</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={handleExportSourcing}
                                            disabled={sourcing.length === 0}
                                            title={sourcing.length === 0 ? "Add ingredients first" : "Stash check, substitutions and shopping options"}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Substitutions &amp; Sourcing <span className="text-xs text-gray-400" aria-hidden>⇄</span>
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => handleExportPDF('pif')}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-[#2c4c3b] hover:bg-gray-50 flex justify-between items-center"
                                        >
                                            Download PIF (PDF) <span className="text-xs text-[#2c4c3b]" aria-hidden>↓</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {visibleDraft && (
                        <div role="alert" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
                            <span className="text-amber-900">
                                We found unsaved changes from <strong>{new Date(visibleDraft.savedAt).toLocaleString()}</strong>
                                {' '}({visibleDraft.ingredients.length} ingredient{visibleDraft.ingredients.length !== 1 && 's'}).
                            </span>
                            <span className="flex gap-2">
                                <button onClick={restoreDraft} className="px-3 py-1 bg-[#1f382a] text-white rounded text-xs font-bold hover:bg-[#2c4c3b]">Restore</button>
                                <button onClick={discardDraft} className="px-3 py-1 bg-white border border-amber-300 rounded text-xs font-bold text-amber-900 hover:bg-amber-100">Discard</button>
                            </span>
                        </div>
                    )}

                    <div className="flex items-center gap-4 md:gap-8 w-full bg-transparent overflow-x-auto pb-2 -mt-1" data-tour="settings">

                        {/* Profile Selector */}
                        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
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

                        {/* Target Weight */}
                        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
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

                        {/* Target pH */}
                        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                            <label className="text-sm text-gray-600 font-medium">Target pH:</label>
                            <input
                                type="number"
                                step="0.1"
                                min="2"
                                max="12"
                                value={targetPh ?? ''}
                                onChange={(e) => setTargetPh(e.target.value === '' ? null : parseFloat(e.target.value))}
                                className="w-20 border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                                placeholder="5.5"
                            />
                            <a
                                href={toolsUrl('ph', { batch: targetWeight, target: targetPh })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-[#2c4c3b] hover:underline"
                                title="Work out how much acid or base to add"
                            >
                                Adjust pH
                            </a>
                        </div>
                    </div>

                    {/* Search Ingredients Bar with Dropdown Container */}
                    <div className="relative" data-tour="search">
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

                    {/* Stash check summary */}
                    {formulaIngredients.length > 0 && isStashLoaded && (
                        isStashEmpty ? (
                            <div data-tour="sourcing" className="bg-white border border-dashed border-[#c1d1b9] rounded-lg px-4 py-3 text-sm text-gray-600">
                                🧺 Add what you own on the <button onClick={() => navigate('/stash')} className="font-semibold text-[#2c4c3b] hover:underline">Stash page</button> to see what you're missing and get substitutions from your own shelf.
                            </div>
                        ) : isStashCheckHidden ? (
                            <button onClick={() => toggleStashCheck(false)} className="self-start text-xs font-medium text-[#2c4c3b] hover:underline">
                                🧺 Show stash check
                            </button>
                        ) : missingCount + lowCount > 0 ? (
                            <div data-tour="sourcing" className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
                                <span className="text-amber-900">
                                    🧺 For a {targetWeight || 100} g batch you're missing <strong>{missingCount}</strong> ingredient{missingCount !== 1 && 's'}
                                    {lowCount > 0 && <> and are low on <strong>{lowCount}</strong></>}. Swap suggestions are shown under each one.
                                </span>
                                <span className="flex gap-2">
                                    <button
                                        onClick={handleExportSourcing}
                                        disabled={isSaving}
                                        className="px-3 py-1 bg-white border border-amber-300 rounded text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
                                    >
                                        🖨️ Print sourcing guide
                                    </button>
                                    <button onClick={() => toggleStashCheck(true)} className="px-2 text-xs text-amber-800 hover:underline">
                                        Hide
                                    </button>
                                </span>
                            </div>
                        ) : (
                            <div data-tour="sourcing" className="bg-[#e9eee7] border border-[#c1d1b9] rounded-lg px-4 py-2 text-sm text-[#1f382a] flex justify-between items-center gap-3">
                                <span>✅ You have everything in your stash for a {targetWeight || 100} g batch.</span>
                                <button onClick={() => toggleStashCheck(true)} className="text-xs text-gray-500 hover:underline">Hide</button>
                            </div>
                        )
                    )}

                    {/* Phases Container */}
                    <div className="bg-white border border-[#c1d1b9] rounded-lg shadow-sm overflow-hidden text-sm" data-tour="phases">

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
                                    <div className={`${phaseHeaderBg[phaseLetter]} px-4 py-2 font-semibold flex justify-between border-t first:border-t-0 border-[#c1d1b9]`}>
                                        <span>{phaseNames[phaseLetter]}</span>
                                        <span className="text-xs font-normal text-gray-700">
                                            {phaseItems.reduce((sum, item) => sum + item.percentage, 0).toFixed(2)}%
                                        </span>
                                    </div>

                                    {phaseItems.length === 0 ? (
                                        <div className="p-4 text-gray-500 text-center text-xs italic bg-gray-50 border-b border-gray-100">
                                            No ingredients added to Phase {phaseLetter} yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse table-fixed min-w-[650px]">
                                                <thead>
                                                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                                                        <th className="px-4 py-2 font-medium w-[36%]">Ingredient</th>
                                                        <th className="px-4 py-2 font-medium w-[23%]">Function</th>
                                                        <th className="px-4 py-2 font-medium w-[12%]">Target %</th>
                                                        <th className="px-4 py-2 font-medium w-[10%]">Weight (g)</th>
                                                        <th className="px-4 py-2 font-medium w-[13%] text-center">Phase</th>
                                                        <th className="px-4 py-2 font-medium w-[6%] text-center">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {phaseItems.map((item) => {
                                                        const stock = showStashHints ? sourcing[item.originalIndex!] : undefined;
                                                        const needsAttention = stock && (stock.status === 'missing' || stock.status === 'low');
                                                        return (
                                                        <Fragment key={item.originalIndex}>
                                                        <tr className={`hover:bg-gray-50 ${needsAttention ? 'bg-amber-50/40' : 'border-b border-gray-100'}`}>
                                                            {/* 1. Ingredient Column */}
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
                                                                {item.substitutedFor && (
                                                                    <div className="text-[10px] text-gray-500 font-normal mt-0.5 truncate">
                                                                        ⇄ replaces {displayName(item.substitutedFor as unknown as CatalogIngredient)} ·{' '}
                                                                        <button onClick={() => handleUndoSwap(item.originalIndex!)} className="text-[#2c4c3b] font-medium hover:underline">
                                                                            Undo
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>

                                                            {/* 2. Function Column */}
                                                            <td className="px-4 py-2 text-gray-600 truncate">{item.function}</td>

                                                            {/* 3. Target % Column (with tightened spacing) */}
                                                            <td className="px-4 py-2">
                                                                <div className="flex flex-col justify-center items-start">
                                                                    <div className="flex items-center gap-1">
                                                                    <div className="relative w-16">
                                                                        <input
                                                                            type="number"
                                                                            step="0.5"
                                                                            min="0"
                                                                            max="100"
                                                                            value={item.percentage === 0 ? '' : item.percentage}
                                                                            disabled={item.isQS}
                                                                            onChange={(e) => handlePercentageChange(item.originalIndex!, e.target.value)}
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
                                                                    {!item.isQS && (
                                                                        <button
                                                                            onClick={() => toggleLock(item.originalIndex!)}
                                                                            aria-label={item.locked ? 'Unlock percentage' : 'Lock percentage'}
                                                                            aria-pressed={!!item.locked}
                                                                            title={item.locked ? 'Locked: balancing keeps this value. Click to unlock.' : 'Lock this value so balancing never changes it'}
                                                                            className={`p-0.5 rounded transition-colors ${item.locked ? 'text-[#2c4c3b]' : 'text-gray-300 hover:text-gray-500'}`}
                                                                        >
                                                                            {item.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                                                                        </button>
                                                                    )}
                                                                    </div>

                                                                    <div className="mt-0.5 leading-none">
                                                                        {item.isQS ? (
                                                                            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Q.S. Base</span>
                                                                        ) : (
                                                                            (item.min_usage_pct !== null || item.max_usage_pct !== null) && (
                                                                                <span
                                                                                    className={`text-[9px] font-mono tracking-tighter ${(item.min_usage_pct !== null && item.percentage < item.min_usage_pct && item.percentage > 0) ||
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

                                                            {/* 4. Weight Column */}
                                                            <td className="px-4 py-2 text-gray-600">
                                                                {item.percentage
                                                                    ? `${((item.percentage / 100) * targetWeight).toFixed(2)}g`
                                                                    : '0.00g'}
                                                            </td>

                                                            {/* 5. Phase Column (Moved here) */}
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button
                                                                        onClick={() => handlePhaseChange(item.originalIndex!, cyclePhase(item.phase, -1))}
                                                                        className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                                    >
                                                                        ◀
                                                                    </button>
                                                                    <span className="font-bold text-gray-700 w-4 text-center">{item.phase}</span>
                                                                    <button
                                                                        onClick={() => handlePhaseChange(item.originalIndex!, cyclePhase(item.phase, 1))}
                                                                        className="text-gray-400 hover:text-[#2c4c3b] font-bold px-1"
                                                                    >
                                                                        ▶
                                                                    </button>
                                                                </div>
                                                            </td>

                                                            {/* 6. Action Column */}
                                                            <td
                                                                className="px-4 py-2 text-gray-400 cursor-pointer hover:text-red-500 text-center"
                                                                onClick={() => removeIngredient(item.originalIndex!)}
                                                                title="Remove ingredient"
                                                            >
                                                                🗑
                                                            </td>
                                                        </tr>
                                                        {needsAttention && (
                                                            <SubstitutionHint
                                                                item={stock}
                                                                onSwap={(option) => handleSwap(item.originalIndex!, option)}
                                                            />
                                                        )}
                                                        </Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Total Footer */}
                        <div className="bg-[#f0f4ef] px-4 py-3 text-right font-medium flex flex-wrap justify-between gap-3 items-center border-t border-[#c1d1b9]" data-tour="total">
                            <div className="flex items-center gap-3" data-tour="balance">
                                <button
                                    onClick={() => setIsBalanceOpen(true)}
                                    disabled={formulaIngredients.length === 0}
                                    title="Suggest logical percentages and fill to 100%"
                                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#c1d1b9] rounded shadow-sm text-xs font-bold text-[#2c4c3b] hover:bg-[#e9eee7] disabled:opacity-50 transition-colors"
                                >
                                    <Scale size={14} aria-hidden /> Balance
                                </button>
                                <label className="flex items-center gap-1.5 text-xs font-normal text-gray-600 cursor-pointer" title="Rebalance automatically when you add or remove ingredients. Values you type are locked.">
                                    <input
                                        type="checkbox"
                                        checked={isAutoBalance}
                                        onChange={(e) => toggleAutoBalance(e.target.checked)}
                                        className="w-3.5 h-3.5 accent-[#2c4c3b]"
                                    />
                                    Auto
                                </label>
                            </div>
                            <div className="flex items-center gap-2">
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
                    </div>
                    <div data-tour="cost">
                        <FormulationCostCalculator formulaIngredients={calculatorIngredients} currencySymbol={currency} initialBatchSize={targetWeight} />
                    </div>
                </div>

                {/* Ingredient Details Modal */}
                {isModalOpen && selectedIngredient && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
                            <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-start">
                                <div className="pr-4">
                                    <h3 className="text-lg font-bold text-[#1f382a]">{selectedIngredient.trade_name}</h3>
                                    <p className="text-xs text-gray-600 font-mono">{selectedIngredient.inci_name}</p>
                                </div>
                                <div className="flex items-center gap-4 pt-1">
                                    <button
                                        onClick={() => toggleFavorite(selectedIngredient)}
                                        className={`text-2xl transition-colors hover:scale-110 ${favorites.some(f => f.id === selectedIngredient.id)
                                            ? 'text-red-500 drop-shadow-sm'
                                            : 'text-gray-300 hover:text-red-400'
                                            }`}
                                        title={favorites.some(f => f.id === selectedIngredient.id) ? "Remove from favorites" : "Add to favorites"}
                                    >
                                        {favorites.some(f => f.id === selectedIngredient.id) ? '♥' : '♡'}
                                    </button>
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none -mt-1"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>

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
                <div className="flex flex-col gap-4 w-full lg:w-80">
                    <div data-tour="companion">
                        <FormulationCompanion
                            alerts={alerts}
                            hasProfile={!!activeProfile}
                            onFix={handleFix}
                            canFix={canFix}
                        />
                    </div>
                    {/* Render the new Claims Panel */}
                    <div data-tour="claims">
                        <ClaimsPanel
                            selectedClaims={targetClaims}
                            violations={claimViolations}
                            onChangeClaims={(newClaims) => {
                                setTargetClaims(newClaims);
                            }}
                        />
                    </div>
                    <div data-tour="recommendations">
                        <RecommendationsPanel recommendations={recommendations} onFix={handleFix} canFix={canFix} />
                    </div>
                </div>

            </div>

            <CustomModal
                isOpen={modal.isOpen}
                type={modal.type}
                title={modal.title}
                message={modal.message}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
            />

            {isMakeBatchOpen && user && (
                <MakeBatchModal
                    userId={user.id}
                    formulationId={formulaId}
                    formulaName={projectName}
                    targetPh={targetPh}
                    defaultBatchSizeG={targetWeight || 100}
                    rows={formulaIngredients.map(i => ({
                        ingredient_id: i.id,
                        name: i.trade_name || i.inci_name,
                        inci_name: i.inci_name || null,
                        phase: i.phase,
                        percentage: i.percentage || 0,
                    }))}
                    onClose={() => setIsMakeBatchOpen(false)}
                    onCreated={(batchId) => {
                        setIsMakeBatchOpen(false);
                        notifyBatchesChanged();
                        navigate(`/batches/${batchId}`);
                    }}
                />
            )}

            {fixPicker && (
                <FixSuggestionModal
                    category={fixPicker}
                    suggestions={fixSuggestions}
                    toolLink={fixTool}
                    onPick={({ ingredient }) => {
                        handleAddIngredient(ingredient as unknown as DatabaseIngredient);
                        setFixPicker(null);
                    }}
                    onBrowse={() => {
                        setSearchTerm(CATEGORY_INFO[fixPicker].search);
                        setFixPicker(null);
                    }}
                    onClose={() => setFixPicker(null)}
                />
            )}

            {fixToast && fixToast.afterSnapshot === snapshot && (
                <FixToast message={fixToast.message} onUndo={fixToast.undo} onDismiss={() => setFixToast(null)} />
            )}

            {balancePreview && (
                <BalancePreviewModal
                    result={balancePreview}
                    names={formulaIngredients.map(i => i.trade_name || i.inci_name)}
                    keepLipidLoad={keepLipidLoad}
                    onKeepLipidLoadChange={setKeepLipidLoad}
                    onApply={() => {
                        setFormulaIngredients(prev => applyBalance(prev, balancePreview));
                        setIsBalanceOpen(false);
                    }}
                    onClose={() => setIsBalanceOpen(false)}
                />
            )}

            {isTourOpen && <GuidedTour steps={EDITOR_TOUR_STEPS} onClose={closeTour} />}

            <ShareFormulaModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                currentProjectName={projectName}
                recipeData={formulaIngredients}
                activeProfileName={activeProfile?.name || null}
                formulaId={formulaId}
                communityPostId={communityPostId}
                onShareSuccess={(newPostId) => setCommunityPostId(newPostId)}
            />
        </div>
    );
};

export default FormulationEditor;