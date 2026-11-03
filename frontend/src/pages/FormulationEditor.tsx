import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FormulationCompanion from '../components/FormulationCompanion';
import RecommendationsPanel from '../components/RecommendationsPanel';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/api';
import { saveFormulation } from '../lib/saveFormulation';
import { settleQS } from '../lib/qs';
import { applyImmediateFix, isFixApplicable } from '../lib/fixes';
import { CATEGORY_FILTERS, CATEGORY_INFO, suggestIngredients } from '../lib/fixSuggestions';
import type { Fix, FixCategory } from '../types/fixes';
import FixSuggestionModal from '../components/FixSuggestionModal';
import FixToast from '../components/FixToast';
import MakeBatchModal from '../components/MakeBatchModal';
import { clearDraft, formulaSnapshot, loadDraft, saveDraft, type FormulaDraft } from '../lib/draftStore';
import { useAutosave } from '../hooks/useAutosave';
import { useFavorites } from '../hooks/useFavorites';
import { useCatalogCandidates } from '../hooks/useCatalogCandidates';
import { useLineage } from '../hooks/useLineage';
import { withLineage } from '../lib/lineage';
import LineageNotice from '../components/LineageNotice';
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
import BalancePreviewModal from '../components/BalancePreviewModal';
import IngredientDetailsModal from '../components/editor/IngredientDetailsModal';
import IngredientSearch from '../components/editor/IngredientSearch';
import StashCheckSummary from '../components/editor/StashCheckSummary';
import PhasesPanel from '../components/editor/PhasesPanel';
import FavoritesMenu from '../components/editor/FavoritesMenu';
import ProjectTitle from '../components/editor/ProjectTitle';
import EditorActions from '../components/editor/EditorActions';
import DraftBanner from '../components/editor/DraftBanner';
import FormulaSettings from '../components/editor/FormulaSettings';
import { balanceFormula, inferKind, isWaterBase, startingPercentage, type BalanceResult } from '../lib/autoBalance';
import { fixToolLink } from '../lib/toolLinks';
import type { DatabaseIngredient, FormulaIngredient, ProfileConfig } from '../types/formulation';
import { buildExportPayload, toApiIngredient } from '../lib/formulationApi';
import { downloadPdf, pdfFilename } from '../lib/exportPdf';
import {
    analyzeFormula,
    linesNeedingSubstitutes,
    substituteFilters,
    buildSourcingPayload,
    type CatalogIngredient,
    type StashEntry,
    type SubstituteOption,
} from '../lib/substitutions';

const TOUR_SEEN_KEY = 'formularium.editorTourSeen';
const STASH_CHECK_KEY = 'formularium.stashCheckHidden';
const AUTO_BALANCE_KEY = 'formularium.autoBalance';


const FormulationEditor = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Batch setup state
    const [targetWeight, setTargetWeight] = useState<number>(100);
    const [targetPh, setTargetPh] = useState<number | null>(5.5);

    // State for inline project name editing
    const [projectName, setProjectName] = useState('New Project');

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
    // Where this formula came from: a community recipe, and/or another of the user's formulas
    const [remixedFromPostId, setRemixedFromPostId] = useState<string | null>(null);
    const [clonedFromFormulationId, setClonedFromFormulationId] = useState<string | null>(null);
    const { remixedFrom, clonedFrom } = useLineage(remixedFromPostId, clonedFromFormulationId);

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

    // Stash check & substitutions. Substitute and suggestion candidates are fetched on demand, never the whole catalog.
    const [stashEntries, setStashEntries] = useState<StashEntry[]>([]);
    const [isStashLoaded, setIsStashLoaded] = useState(false);
    const stashIds = useMemo(() => stashEntries.map(entry => entry.ingredient_id), [stashEntries]);
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
                setRemixedFromPostId(formulation.remixed_from_post_id ?? null);
                setClonedFromFormulationId(formulation.cloned_from_formulation_id ?? null);
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
            const stashRes = await supabase.from('user_stash').select('ingredient_id, amount_left_g').eq('user_id', user.id);
            if (stashRes.error) console.error("Error loading stash:", stashRes.error);
            else setStashEntries(stashRes.data ?? []);
            setIsStashLoaded(!stashRes.error);
        };

        fetchSourcingData();
    }, [user]);

    const { favorites, toggleFavorite } = useFavorites(user?.id);

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

    // Only the ingredients that can fill the chosen role are fetched, once the picker is opened
    const fixGroups = useMemo(() => (fixPicker ? [CATEGORY_FILTERS[fixPicker]] : []), [fixPicker]);
    const { candidates: fixCandidates, isLoading: isLoadingFixCandidates } = useCatalogCandidates(fixGroups, stashIds);

    const fixSuggestions = useMemo(() => (fixPicker
        ? suggestIngredients(fixPicker, fixCandidates, {
            targetPh,
            claims: targetClaims as string[],
            inFormulaIds: new Set(formulaIngredients.map(i => i.id)),
            stashIds: new Set(stashIds),
        })
        : []), [fixPicker, fixCandidates, targetPh, targetClaims, formulaIngredients, stashIds]);

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

    const currentTotalPercentage = formulaIngredients.reduce((sum, item) => sum + item.percentage, 0);

    // Stock status + substitution suggestions for every row, keyed by its index
    const formulaLines = useMemo(() => formulaIngredients.map(ing => ({
        ingredient: ing as unknown as CatalogIngredient,
        phase: ing.phase,
        percentage: ing.percentage || 0,
        isQS: ing.isQS,
    })), [formulaIngredients]);

    // Substitutes are only looked up for what the user is missing, and only among ingredients that could replace it
    const substituteGroups = useMemo(() => (isStashLoaded
        ? linesNeedingSubstitutes(formulaLines, stashEntries, targetWeight || 100).map(line => substituteFilters(line.ingredient))
        : []), [isStashLoaded, formulaLines, stashEntries, targetWeight]);
    const { candidates: substituteCandidates, isLoading: isSearchingSubstitutes } = useCatalogCandidates(substituteGroups, stashIds);

    const sourcing = useMemo(
        () => (isStashLoaded ? analyzeFormula(formulaLines, substituteCandidates, stashEntries, targetWeight || 100, targetPh) : []),
        [formulaLines, substituteCandidates, stashEntries, isStashLoaded, targetWeight, targetPh]
    );

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

            // The copy remembers what it was copied from, and keeps the community recipe the original started as
            const { data: newFormulation, error: insertError } = await withLineage(
                extra => supabase.from('formulations').insert([{ ...formulationData, ...extra }]).select('id').single(),
                { cloned_from_formulation_id: formulaId, remixed_from_post_id: remixedFromPostId },
            );

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

    const handleExportPDF = async (documentType: 'pif' | 'batch' | 'shopping') => {
        setIsSaving(true);
        try {
            const payload = buildExportPayload({ projectName, targetWeight, profileId, activeProfile, targetPh, targetClaims, formulaIngredients });
            await downloadPdf(`/api/v1/export/${documentType}`, payload, pdfFilename(projectName, documentType.toUpperCase()));
        } catch (error) {
            console.error("PDF Export error:", error);
            setModal({ isOpen: true, type: 'error', title: 'Export Failed', message: `Could not generate the ${documentType.toUpperCase()} document.` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportSourcing = async () => {
        setIsSaving(true);
        try {
            const payload = buildSourcingPayload(projectName || "Untitled Project", targetWeight || 100, targetPh, sourcing);
            await downloadPdf('/api/v1/export/sourcing', payload, pdfFilename(projectName, 'SOURCING'));
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
                <FavoritesMenu favorites={favorites} onAdd={handleAddIngredient} onRemove={toggleFavorite} />

                {/* Visual divider before global links */}
                <span className="text-gray-400">|</span>
            </Header>

            {/* Main Workspace */}
            <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto w-full">

                {/* Left Column: Formulation Panel */}
                <div className="flex-1 flex flex-col gap-5">

                    {/* Title and actions share one compact row */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 w-full">
                        <ProjectTitle projectName={projectName} onProjectNameChange={setProjectName}>
                            <AutosaveIndicator
                                status={autosave.status}
                                error={autosave.error}
                                lastSavedAt={autosave.lastSavedAt}
                                isSavedFormula={!!formulaId}
                                canAutosave={canAutosave}
                                hasProfile={!!profileId}
                                onRetry={() => { void autosave.saveNow(); }}
                            />
                            <LineageNotice remixedFrom={remixedFrom} clonedFrom={clonedFrom} className="mt-0.5" />
                        </ProjectTitle>

                        <EditorActions
                            isSaving={isSaving}
                            hasIngredients={formulaIngredients.length > 0}
                            hasSourcing={sourcing.length > 0}
                            isHealthCheckPassed={isHealthCheckPassed}
                            formulaId={formulaId}
                            onSave={handleSave}
                            onMakeBatch={() => setIsMakeBatchOpen(true)}
                            onShare={() => setIsShareModalOpen(true)}
                            onClone={handleClone}
                            onExportPDF={handleExportPDF}
                            onExportSourcing={handleExportSourcing}
                        />
                    </div>

                    {visibleDraft && <DraftBanner draft={visibleDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}

                    <FormulaSettings
                        profileId={profileId}
                        onProfileChange={handleProfileChange}
                        targetWeight={targetWeight}
                        onTargetWeightChange={setTargetWeight}
                        targetPh={targetPh}
                        onTargetPhChange={setTargetPh}
                    />

                    <IngredientSearch
                        searchTerm={searchTerm}
                        onSearchTermChange={setSearchTerm}
                        isSearching={isSearching}
                        results={searchResults}
                        onAdd={handleAddIngredient}
                    />

                    {formulaIngredients.length > 0 && isStashLoaded && (
                        <StashCheckSummary
                            targetWeight={targetWeight}
                            isStashEmpty={isStashEmpty}
                            isHidden={isStashCheckHidden}
                            missingCount={missingCount}
                            lowCount={lowCount}
                            isSaving={isSaving}
                            onToggleHidden={toggleStashCheck}
                            onPrintSourcing={handleExportSourcing}
                        />
                    )}

                    <PhasesPanel
                        formulaIngredients={formulaIngredients}
                        targetWeight={targetWeight}
                        currentTotalPercentage={currentTotalPercentage}
                        sourcing={sourcing}
                        showStashHints={showStashHints}
                        isSearchingSubstitutes={isSearchingSubstitutes}
                        isAutoBalance={isAutoBalance}
                        onOpenDetails={(item) => { setSelectedIngredient(item); setIsModalOpen(true); }}
                        onPercentageChange={handlePercentageChange}
                        onToggleLock={toggleLock}
                        onPhaseChange={handlePhaseChange}
                        onRemove={removeIngredient}
                        onSwap={handleSwap}
                        onUndoSwap={handleUndoSwap}
                        onBalance={() => setIsBalanceOpen(true)}
                        onToggleAutoBalance={toggleAutoBalance}
                    />
                    <div data-tour="cost">
                        <FormulationCostCalculator formulaIngredients={calculatorIngredients} currencySymbol={currency} initialBatchSize={targetWeight} />
                    </div>
                </div>

                {/* Ingredient Details Modal */}
                {isModalOpen && selectedIngredient && (
                    <IngredientDetailsModal
                        ingredient={selectedIngredient}
                        isFavorite={favorites.some(f => f.id === selectedIngredient.id)}
                        onToggleFavorite={() => toggleFavorite(selectedIngredient)}
                        onClose={() => setIsModalOpen(false)}
                    />
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
                    isLoading={isLoadingFixCandidates}
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
                remixedFromPostId={remixedFromPostId}
                onShareSuccess={(newPostId) => setCommunityPostId(newPostId)}
            />
        </div>
    );
};

export default FormulationEditor;