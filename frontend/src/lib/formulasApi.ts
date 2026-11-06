// Formulas, their version history and the product types, as served by the Spring backend. Everything needs a signed-in user.

import { request } from './apiClient';
import type { DatabaseIngredient, ProfileConfig } from '../types/formulation';

/** A formula as stored (without its contents). */
export interface FormulaRow {
    id: string;
    user_id: string;
    name: string;
    target_weight_g: number | null;
    status: string | null;
    profile_id: string | null;
    created_at: string;
    target_ph: number | null;
    community_post_id: string | null;
    cloned_from_formulation_id: string | null;
    remixed_from_post_id: string | null;
}

/** A formula with its phases, each with its lines, each with the whole ingredient: the shape the editor and the planners read. */
export interface FormulaDetail extends FormulaRow {
    formulation_phases: {
        id: string;
        phase_letter: string;
        formulation_ingredients: { percentage: number | string; is_qs: boolean | null; ingredients: (DatabaseIngredient & { id: string }) | null }[];
    }[];
}

export interface SaveLine { ingredient_id: string; phase_letter: string; percentage: number; is_qs: boolean }

export interface FormulaInput {
    name: string;
    profile_id?: string | null;
    target_weight_g?: number | null;
    target_ph?: number | null;
    /** Only read when creating */
    cloned_from_formulation_id?: string | null;
    remixed_from_post_id?: string | null;
    ingredients: SaveLine[];
}

// ---- product types

export const fetchProfiles = () => request<ProfileConfig[]>('/api/v1/profiles');
export const fetchProfile = (id: string) => request<ProfileConfig>(`/api/v1/profiles/${encodeURIComponent(id)}`);

// ---- formulas

/** Your formulas, newest first. */
export const fetchFormulas = () => request<FormulaRow[]>('/api/v1/formulas');
/** Your formulas with their phases and ingredients, sorted by name. */
export const fetchFormulasWithLines = () => request<FormulaDetail[]>('/api/v1/formulas?lines=true');
export const fetchFormula = (id: string) => request<FormulaDetail>(`/api/v1/formulas/${id}`);

/**
 * Creates a draft. With `copy`, lines using an ingredient you cannot see (another member's private one) are left out
 * instead of refused, which is what copying someone else's recipe needs.
 */
export const createFormula = (formula: FormulaInput, options: { copy?: boolean } = {}) =>
    request<FormulaDetail>(`/api/v1/formulas${options.copy ? '?copy=true' : ''}`, { method: 'POST', body: formula });

/** Saves over a formula: the details, and the whole contents replaced. */
export const saveFormula = (id: string, formula: FormulaInput) => request<FormulaDetail>(`/api/v1/formulas/${id}`, { method: 'PUT', body: formula });
export const deleteFormula = (id: string) => request<void>(`/api/v1/formulas/${id}`, { method: 'DELETE' });
/** Remembers which community post a formula was shared as. */
export const linkFormulaToPost = (id: string, postId: string) => request<void>(`/api/v1/formulas/${id}/post`, { method: 'PUT', body: { community_post_id: postId } });

// ---- version history

export interface VersionRowLine { ingredient_id: string; inci_name: string; trade_name: string; phase: string; percentage: number; is_qs: boolean }

export interface VersionRow {
    id: string;
    version_number: number;
    note: string | null;
    name: string;
    profile_id: string | null;
    target_weight_g: number | string | null;
    target_ph: number | string | null;
    lines: VersionRowLine[];
    created_at: string | null;
}

export interface VersionInputBody {
    note?: string | null;
    name: string;
    profile_id?: string | null;
    target_weight_g?: number | null;
    target_ph?: number | null;
    lines: VersionRowLine[];
}

export const fetchVersions = (formulaId: string) => request<VersionRow[]>(`/api/v1/formulas/${formulaId}/versions`);
export const addVersion = (formulaId: string, version: VersionInputBody) => request<VersionRow>(`/api/v1/formulas/${formulaId}/versions`, { method: 'POST', body: version });
export const removeVersion = (formulaId: string, versionId: string) => request<void>(`/api/v1/formulas/${formulaId}/versions/${versionId}`, { method: 'DELETE' });
