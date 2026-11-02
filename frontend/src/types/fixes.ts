// A one-click remedy the server attaches to an alert or insight (see Fix.java in the backend).

export type FixCategory =
    | 'preservative' | 'emulsifier' | 'chelator' | 'antioxidant' | 'ferulic'
    | 'soother' | 'neutralizer' | 'photostabilizer' | 'water' | 'oil';

export type FixKind = 'move-phase' | 'set-percentage' | 'set-ph' | 'balance' | 'add-ingredient' | 'remove-ingredient';

export interface Fix {
    kind: FixKind;
    label: string;
    ingredientIds?: string[];
    value?: number;
    phase?: 'A' | 'B' | 'C';
    category?: FixCategory;
}
