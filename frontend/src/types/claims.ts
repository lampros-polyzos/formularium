export type MarketingClaim =
    | "VEGAN"
    | "SULFATE_FREE"
    | "SILICONE_FREE"
    | "PARABEN_FREE"
    | "FRAGRANCE_FREE"
    | "COSMOS"
    | "NON_COMEDOGENIC";

export interface ClaimViolation {
    claim: MarketingClaim;
    ingredientName: string;
    reason: string;
}

export const CLAIM_LABELS: Record<MarketingClaim, string> = {
    "VEGAN": "Vegan",
    "SULFATE_FREE": "Sulfate-Free",
    "SILICONE_FREE": "Silicone-Free",
    "PARABEN_FREE": "Paraben-Free",
    "FRAGRANCE_FREE": "Fragrance-Free",
    "COSMOS": "COSMOS Compliant",
    "NON_COMEDOGENIC": "Non-Comedogenic (≤2)",
};
