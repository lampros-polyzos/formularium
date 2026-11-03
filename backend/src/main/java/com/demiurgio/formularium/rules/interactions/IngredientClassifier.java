package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.FormulaIngredient;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static com.demiurgio.formularium.rules.interactions.Tag.*;

/**
 * Tags an ingredient from its INCI name, trade name, function and data flags.
 * INCI is matched first because trade names vary between suppliers.
 */
public final class IngredientClassifier {

    private IngredientClassifier() {}

    private static Pattern p(String regex) {
        return Pattern.compile(regex);
    }

    private static final Pattern VITAMIN_C_DERIVATIVE_P = p("ascorbyl|ascorbate|ethyl ascorbic");
    private static final Pattern RETINOID_P = p("retinol|retinal\\b|retinyl|retinoate");
    private static final Pattern STRONG_RETINOID_P = p("\\bretinol\\b|\\bretinal\\b");
    private static final Pattern SHAMPOO_SAFE_CATIONIC_P = p("polyquaternium-(10|7)\\b|guar hydroxypropyltrimonium");
    private static final Pattern ELECTROLYTE_SENSITIVE_P = p("^carbomer|acrylates/c10-30|acryloyldimethyltaurate|sodium polyacrylate$|glyceryl stearate se");
    private static final Pattern ELECTROLYTE_P = p("sodium chloride|magnesium sulfate|sodium pca|zinc pca|sodium lactate|sodium citrate|ascorbyl phosphate|sodium polyglutamate|azeloyl diglycinate|aloe barbadensis leaf extract|potassium alum");
    private static final Pattern POWDER_THICKENER_P = p("xanthan|guar gum|cyamopsis|sclerotium|gellan|cellulose|carbomer|acrylates/c10-30|polyacrylate|acryloyldimethyltaurate|magnesium aluminum silicate|^sodium hyaluronate(?! crosspolymer)|carrageenan|^algin|amorphophallus|ceratonia|^pectin|^agar$|pullulan|acacia senegal|hectorite");
    private static final Pattern NEUTRALIZER_P = p("sodium hydroxide|potassium hydroxide|triethanolamine|^arginine|aminomethyl propanol|tromethamine");
    private static final Pattern LOW_HLB_P = p("dipolyhydroxystearate|polyricinoleate|steareth-2$|steareth-2 |sorbitan (sesqui)?oleate|peg/ppg-10/1 dimethicone");
    private static final Pattern LIQUID_HUMECTANT_P = p("^glycerin|propanediol|butylene glycol|propylene glycol|sorbitol|pentylene glycol");
    private static final Pattern SOLVENT_P = p("propanediol|butylene glycol|propylene glycol|dipropylene glycol|pentylene glycol|dimethyl isosorbide|ethoxydiglycol|hexanediol|^alcohol");
    private static final Pattern CHELATOR_P = p("edta|phytate|phytic|glutamate diacetate|gluconate");
    private static final Pattern CLAY_P = p("kaolin|bentonite|^illite|moroccan lava|magnesium aluminum silicate|rhassoul");
    private static final Pattern OIL_ANTIOXIDANT_P = p("^tocopherol$|^tocopherol |rosmarinus officinalis.*leaf extract|ascorbyl palmitate|^bht$");
    private static final Pattern FRAGILE_OIL_P = p("cannabis sativa|rosa canina|oenothera|vitis vinifera.*\\boil\\b|triticum vulgare|\\bsqualene\\b|linum usitatissimum|borago|hippophae|rubus idaeus|carthamus tinctorius|punica granatum|nigella sativa|cucurbita pepo|opuntia ficus|aleurites moluccana");
    private static final Pattern PHOTOTOXIC_P = p("citrus (limon|aurantifolia|paradisi|bergamia)|aurantium amara (peel|fruit)");
    private static final Pattern SOOTHER_P = p("panthenol|allantoin|bisabolol|madecassoside|centella|avena sativa|beta-glucan|calendula|chamomil|anthemis|aloe barbadensis|ectoin|hydrolyzed oat|cucumis|althaea|arnica");
    private static final Pattern BOTANICAL_P = p(" extract|juice| water$|hydrosol|distillate");
    private static final Pattern FATTY_ACID_P = p("^stearic acid|linoleic acid|palmitic acid");
    private static final Pattern PHOTOSTABILIZER_P = p("octocrylene|bis-ethylhexyloxyphenol|methylene bis-benzotriazolyl");
    // Filters that cover UVA (long wave, ageing), and UVB (short wave, burning). Zinc oxide and the Tinosorbs cover both
    private static final Pattern UVA_P = p("butyl methoxydibenzoylmethane|diethylamino hydroxybenzoyl hexyl benzoate|bis-ethylhexyloxyphenol|methylene bis-benzotriazolyl|^zinc oxide");
    private static final Pattern UVB_P = p("octocrylene|homosalate|ethylhexyl salicylate|ethylhexyl triazone|ethylhexyl methoxycinnamate|bis-ethylhexyloxyphenol|methylene bis-benzotriazolyl|^zinc oxide|^titanium dioxide");
    private static final Pattern EMULSIFIER_P = p("(^|[^-])emulsifier");

    public static Set<Tag> classify(FormulaIngredient ing) {
        String inci = lower(ing.inciName() != null && !ing.inciName().isBlank() ? ing.inciName() : ing.name());
        String trade = lower(ing.tradeName());
        String fn = lower(ing.function());
        String charge = lower(ing.ionicCharge());
        String text = inci + " | " + trade;
        Set<Tag> t = EnumSet.noneOf(Tag.class);

        // ---------- Base ----------
        boolean water = inci.equals("aqua") || inci.startsWith("aqua ") || inci.endsWith(" water") || inci.contains("juice")
                || trade.contains("hydrosol") || trade.contains("distillate");
        if (water) t.add(WATER);
        if ("oil".equals(lower(ing.solubility()))) t.add(OIL_SOLUBLE);
        if (EMULSIFIER_P.matcher(fn).find()) t.add(EMULSIFIER);
        if (LOW_HLB_P.matcher(inci).find()) t.add(LOW_HLB_EMULSIFIER);
        if (inci.matches("steareth-2\\b.*") && !inci.startsWith("steareth-20")) t.add(STEARETH_2);
        if (inci.startsWith("steareth-20")) t.add(STEARETH_20);
        if (fn.contains("surfactant")) t.add(SURFACTANT);
        if (fn.contains("solubilizer") || t.contains(SURFACTANT)) t.add(SOLUBILIZER);
        if (LIQUID_HUMECTANT_P.matcher(inci).find()) t.add(LIQUID_HUMECTANT);
        if (SOLVENT_P.matcher(inci).find()) t.add(SOLVENT);
        if (inci.startsWith("alcohol denat")) t.add(ALCOHOL_DENAT);

        // ---------- Actives ----------
        if (inci.matches("(l-)?ascorbic acid")) t.add(L_ASCORBIC_ACID);
        else if (VITAMIN_C_DERIVATIVE_P.matcher(inci).find() && !inci.contains("palmitate")) t.add(VITAMIN_C_DERIVATIVE);
        if (inci.contains("niacinamide")) t.add(NIACINAMIDE);
        // Acids added in small amounts only to adjust pH don't exfoliate
        boolean pHAdjusterDose = fn.contains("ph adjuster") && ing.percentage() < 1;
        if (fn.contains("(aha)") && !pHAdjusterDose) t.add(AHA);
        if (fn.contains("(bha)")) t.add(BHA);
        if (fn.contains("(pha)")) t.add(PHA);
        if (RETINOID_P.matcher(inci).find()) t.add(RETINOID);
        if (STRONG_RETINOID_P.matcher(inci).find()) t.add(STRONG_RETINOID);
        if (inci.contains("bakuchiol")) t.add(BAKUCHIOL);
        if (inci.contains("ascorbyl palmitate")) t.add(ASCORBYL_PALMITATE);
        boolean peptide = inci.contains("peptide") || trade.contains("matrixyl") || trade.contains("argireline");
        if (peptide && inci.contains("copper")) t.add(COPPER_PEPTIDE);
        else if (peptide) t.add(PEPTIDE);
        if (inci.matches(".*\\b(papain|bromelain)\\b.*")) t.add(ENZYME);
        if (inci.contains("benzoyl peroxide")) t.add(BENZOYL_PEROXIDE);
        if (inci.equals("kojic acid")) t.add(KOJIC_ACID);
        if (inci.contains("acetyl glucosamine")) t.add(ACETYL_GLUCOSAMINE);
        if (inci.contains("zinc pca")) t.add(ZINC_PCA);
        if (inci.contains("tranexamic")) t.add(TRANEXAMIC_ACID);
        if (inci.contains("arbutin")) t.add(ARBUTIN);
        if (inci.contains("glycyrrhiza")) t.add(LICORICE);
        if (inci.contains("azelaic") || inci.contains("azeloyl")) t.add(AZELAIC);
        if (inci.contains("hyaluron")) t.add(HYALURONIC);
        if (inci.contains("ceramide")) t.add(CERAMIDE);
        if (inci.startsWith("cholesterol")) t.add(CHOLESTEROL);
        if (FATTY_ACID_P.matcher(inci).find()) t.add(BARRIER_FATTY_ACID);
        if (SOOTHER_P.matcher(inci).find() && !t.contains(WATER)) t.add(SOOTHER);
        if (inci.equals("caffeine")) t.add(CAFFEINE);
        if (inci.contains("hedera helix") || inci.contains("aesculus hippocastanum") || inci.contains("ruscus aculeatus")) t.add(SAPONIN_EXTRACT);
        if (t.contains(SAPONIN_EXTRACT) || inci.contains("paullinia cupana") || inci.contains("coffea arabica") || inci.contains("fucus vesiculosus")
                || inci.contains("capsicum")) t.add(CONTOURING_EXTRACT);
        if (inci.contains("capsicum") || inci.contains("zingiber officinale")) t.add(WARMING_IRRITANT);
        if (inci.equals("urea")) t.add(UREA);
        if (inci.equals("gluconolactone")) t.add(GLUCONOLACTONE);
        if ("alcohol".equals(lower(ing.solubility())) || inci.equals("azelaic acid")) t.add(NEEDS_SOLVENT);

        // ---------- Charge & structure ----------
        boolean cationic = charge.equals("cationic") || fn.contains("cationic");
        boolean anionic = charge.equals("anionic") || fn.contains("anionic");
        if (t.contains(SURFACTANT) && anionic) t.add(ANIONIC_SURFACTANT);
        if (t.contains(SURFACTANT) && (charge.equals("amphoteric") || fn.contains("amphoteric"))) t.add(AMPHOTERIC_SURFACTANT);
        if (t.contains(SURFACTANT) && inci.contains("glucoside")) t.add(GLUCOSIDE_SURFACTANT);
        if (t.contains(SURFACTANT) && (Boolean.TRUE.equals(ing.isSulfate()) || inci.contains(" sulfate"))) t.add(SULFATE_SURFACTANT);
        if (SHAMPOO_SAFE_CATIONIC_P.matcher(inci).find()) t.add(SHAMPOO_SAFE_CATIONIC);
        else if (cationic && fn.matches(".*(conditioning|conditioner|cationic emulsifier).*")) t.add(CATIONIC_CONDITIONER);
        if (anionic && (fn.contains("rheology") || fn.contains("suspending"))) t.add(ANIONIC_THICKENER);
        if (ELECTROLYTE_SENSITIVE_P.matcher(inci).find()) t.add(ELECTROLYTE_SENSITIVE);
        if (ELECTROLYTE_P.matcher(inci).find()) t.add(ELECTROLYTE);
        if (POWDER_THICKENER_P.matcher(inci).find()) t.add(POWDER_THICKENER);
        if (inci.startsWith("xanthan gum")) t.add(XANTHAN);
        if (inci.contains("cyamopsis") || inci.contains("ceratonia") || inci.contains("caesalpinia spinosa")) t.add(GALACTOMANNAN);
        if (inci.contains("amorphophallus")) t.add(KONJAC);
        if (inci.startsWith("carbomer") || inci.contains("acrylates/c10-30")) t.add(CARBOMER);
        if (NEUTRALIZER_P.matcher(inci).find()) t.add(NEUTRALIZER);
        if (inci.startsWith("magnesium sulfate")) t.add(MAGNESIUM_SULFATE);
        if (inci.startsWith("sodium bicarbonate")) t.add(SODIUM_BICARBONATE);
        if (inci.startsWith("citric acid")) t.add(CITRIC_ACID);
        if (inci.matches("(sodium lactate|lactic acid|sodium citrate|citric acid).*")) t.add(BUFFER);

        // ---------- Preservation ----------
        if (fn.startsWith("preservative") && !fn.contains("booster")) {
            t.add(PRESERVATIVE);
            // Narrow-spectrum systems; everything else is treated as broad-spectrum
            // Sorbates only cover mold and yeast, unless blended with something antibacterial (benzoate, benzyl alcohol, phenoxyethanol)
            boolean antibacterialPartner = inci.contains("benzo") || inci.contains("benzyl alcohol") || inci.contains("phenoxy") || inci.contains("hydroxamic");
            boolean sorbateAlone = (inci.contains("sorbate") || inci.contains("sorbic")) && !antibacterialPartner;
            boolean dehydroacetateAlone = inci.contains("dehydroacet") && !inci.contains("benzyl alcohol");
            if (sorbateAlone || dehydroacetateAlone || inci.contains("anisate") || inci.contains("levulinate")) t.add(ANTIFUNGAL_ONLY);
            if (inci.contains("leuconostoc") || inci.equals("benzyl alcohol")) t.add(ANTIBACTERIAL_ONLY);
        }
        if (fn.contains("booster")) t.add(PRESERVATIVE_BOOSTER);
        if (fn.contains("chelat") || CHELATOR_P.matcher(inci).find()) t.add(CHELATOR);
        if (CLAY_P.matcher(inci).find()) t.add(CLAY);
        if (inci.contains("caprylhydroxamic")) t.add(CAPRYLHYDROXAMIC_ACID);
        if (BOTANICAL_P.matcher(inci).find() && !inci.equals("aqua")) t.add(BOTANICAL);

        // ---------- Stability & comfort ----------
        if (OIL_ANTIOXIDANT_P.matcher(inci).find()) t.add(OIL_ANTIOXIDANT);
        if (inci.startsWith("tocopheryl acetate")) t.add(TOCOPHERYL_ACETATE);
        if (inci.startsWith("tocopher")) t.add(VITAMIN_E);
        if (inci.startsWith("ferulic")) t.add(FERULIC_ACID);
        // An extract of the same plant (grape seed extract, pomegranate extract) is not a polyunsaturated oil
        if (FRAGILE_OIL_P.matcher(inci).find() && !inci.contains("extract")) t.add(FRAGILE_OIL);
        if (t.contains(RETINOID) || t.contains(BAKUCHIOL) || inci.startsWith("ubiquinone") || inci.startsWith("thioctic")) t.add(OXIDATION_PRONE);
        if ((Boolean.TRUE.equals(ing.isFragrance()) || fn.contains("fragrance")) && !water) t.add(FRAGRANCE);
        boolean furocoumarinFree = text.contains("fcf") || text.contains("bergapten-free") || text.contains("furocoumarin-free");
        if (PHOTOTOXIC_P.matcher(inci).find() && !furocoumarinFree) t.add(PHOTOTOXIC_OIL);
        if (t.contains(OIL_SOLUBLE) && ing.comedogenicRating() != null && ing.comedogenicRating() >= 4) t.add(HIGH_COMEDOGENIC);

        // ---------- Sun care ----------
        if (fn.contains("uv filter")) t.add(UV_FILTER);
        if (inci.contains("butyl methoxydibenzoylmethane")) t.add(AVOBENZONE);
        if (UVA_P.matcher(inci).find()) t.add(UVA_PROTECTION);
        if (UVB_P.matcher(inci).find()) t.add(UVB_PROTECTION);
        if (PHOTOSTABILIZER_P.matcher(inci).find()) t.add(PHOTOSTABILIZER);
        if (inci.startsWith("zinc oxide")) { t.add(ZINC_OXIDE); t.add(MINERAL_UV); }
        if (inci.startsWith("titanium dioxide")) t.add(MINERAL_UV);

        return t;
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).trim();
    }
}
