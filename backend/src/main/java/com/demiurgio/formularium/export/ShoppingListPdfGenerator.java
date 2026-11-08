package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import org.openpdf.text.Document;
import org.openpdf.text.DocumentException;
import org.openpdf.text.Element;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.demiurgio.formularium.export.PdfKit.*;

/**
 * Supplier shopping list, grouped the way shops organise their catalogues,
 * with a sensible amount to buy and room to note supplier and price.
 */
@Component
public class ShoppingListPdfGenerator extends AbstractPdfGenerator {

    private static final double OVERAGE = 0.15;
    private static final int[] PACK_SIZES_G = {5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000};

    // Ordered: the first match wins, checked against the ingredient's main function
    private static final String[][] CATEGORIES = {
            {"Water & hydrosols", "hydrosol", "distillate"},
            {"Preservatives & pH", "preservative", "ph adjuster", "chelat", "buffer"},
            {"Emulsifiers & thickeners", "emulsifier", "thickener", "rheology", "solubilizer", "suspending", "wax"},
            {"Surfactants & conditioners", "surfactant", "conditioning"},
            {"Oils, butters & emollients", "carrier oil", "butter", "emollient", "lipid"},
            {"Humectants & solvents", "humectant", "osmolyte", "solvent"},
            {"Actives & extracts", "active", "antioxidant", "extract", "astringent"},
            {"Fragrance & colour", "fragrance", "colorant"},
            {"Powders & texture", "absorbent", "texture", "powder"},
    };
    private static final String OTHER = "Other";

    @Override
    protected String documentName() {
        return "Shopping List";
    }

    @Override
    protected String documentPurpose(ValidationRequest request) {
        return "Everything to buy for one " + g(batchWeight(request)) + " batch, grouped by shop category.";
    }

    @Override
    protected List<String[]> titleFacts(ValidationRequest request) {
        List<FormulaIngredient> items = ingredients(request);
        double totalNeeded = items.stream().mapToDouble(i -> grams(i, batchWeight(request))).sum();
        return List.of(
                new String[]{"Product", projectName(request)},
                new String[]{"Batch size", g(batchWeight(request))},
                new String[]{"Items", String.valueOf(items.size())},
                new String[]{"Total to buy", g(totalNeeded * (1 + OVERAGE))});
    }

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        double batch = batchWeight(request);

        addCallout(document, Tone.INFO, "How to use this list", List.of(
                "Search suppliers by the INCI name (small print). Trade names vary between brands, INCI names don't.",
                "\"Buy\" includes " + Math.round(OVERAGE * 100) + "% extra for what sticks to beakers and spatulas. \"Pack\" is the smallest common retail size that covers it.",
                "Tick off what you already own before you order."));

        Map<String, List<FormulaIngredient>> groups = groupByCategory(ingredients(request));

        PdfPTable table = table(0.55f, 5.4f, 1.4f, 1.4f, 1.3f, 3.2f);
        table.addCell(th("", Element.ALIGN_CENTER));
        table.addCell(th("Ingredient  /  INCI to search for"));
        table.addCell(th("Need", Element.ALIGN_RIGHT));
        table.addCell(th("Buy", Element.ALIGN_RIGHT));
        table.addCell(th("Pack", Element.ALIGN_RIGHT));
        table.addCell(th("Supplier & price"));

        for (Map.Entry<String, List<FormulaIngredient>> group : groups.entrySet()) {
            PdfPCell heading = td(group.getKey().toUpperCase(Locale.ROOT) + "   (" + group.getValue().size() + ")", SMALL_BOLD);
            heading.setColspan(6);
            heading.setBackgroundColor(PAPER);
            heading.setPaddingTop(6f);
            table.addCell(heading);

            for (FormulaIngredient ing : group.getValue()) {
                double need = grams(ing, batch);
                double buy = Math.ceil(need * (1 + OVERAGE) * 10) / 10;
                table.addCell(checkbox());
                table.addCell(twoLine(tradeName(ing), inciName(ing) + (ing.casNumber() != null && !ing.casNumber().isBlank() ? "  |  CAS " + ing.casNumber() : "")));
                table.addCell(tdRight(g(need), BODY));
                table.addCell(tdRight(g(buy), BODY_BOLD));
                table.addCell(tdRight(isWater(ing) ? "-" : packSize(buy), SMALL));
                table.addCell(writeIn());
            }
        }
        document.add(table);

        addStorageTips(document, ingredients(request));
    }

    private void addStorageTips(Document document, List<FormulaIngredient> items) throws DocumentException {
        List<String> tips = new ArrayList<>();
        if (items.stream().anyMatch(i -> i.maxHeatingTempC() != null && i.maxHeatingTempC() <= 50)) {
            tips.add("Heat-sensitive ingredients (actives, extracts, essential oils): store cool and dark, ideally in the fridge once opened.");
        }
        if (items.stream().anyMatch(i -> contains(i, "carrier oil") || contains(i, "butter"))) {
            tips.add("Oils and butters go rancid: buy small packs unless you use them often, and note the opening date.");
        }
        if (items.stream().anyMatch(i -> contains(i, "preservative"))) {
            tips.add("Check the preservative's pH range on the supplier sheet matches your product.");
        }
        tips.add("Ask suppliers for the safety data sheet (SDS) and certificate of analysis (CoA). You will need them for your product file.");
        addCallout(document, Tone.INFO, "Storage & supplier tips", tips);
    }

    // ---------- Helpers ----------

    private Map<String, List<FormulaIngredient>> groupByCategory(List<FormulaIngredient> items) {
        Map<String, List<FormulaIngredient>> groups = new LinkedHashMap<>();
        for (String[] category : CATEGORIES) groups.put(category[0], new ArrayList<>());
        groups.put(OTHER, new ArrayList<>());

        for (FormulaIngredient ing : items) groups.get(categoryOf(ing)).add(ing);
        groups.values().forEach(list -> list.sort(Comparator.comparing(PdfKit::tradeName, String.CASE_INSENSITIVE_ORDER)));
        groups.values().removeIf(List::isEmpty);
        return groups;
    }

    private String categoryOf(FormulaIngredient ing) {
        String inci = inciName(ing).toLowerCase(Locale.ROOT);
        if (isWater(ing) || inci.endsWith(" water")) return CATEGORIES[0][0]; // plain water, hydrosols
        String fn = ing.function() == null ? "" : ing.function().toLowerCase(Locale.ROOT);
        String main = fn.split("/")[0];
        for (String text : List.of(main, fn)) {
            for (String[] category : CATEGORIES) {
                for (int k = 1; k < category.length; k++) {
                    if (text.contains(category[k])) return category[0];
                }
            }
        }
        return OTHER;
    }

    private static boolean isWater(FormulaIngredient ing) {
        return inciName(ing).trim().equalsIgnoreCase("aqua") || inciName(ing).toLowerCase(Locale.ROOT).startsWith("aqua ");
    }

    private static boolean contains(FormulaIngredient ing, String text) {
        return ing.function() != null && ing.function().toLowerCase(Locale.ROOT).contains(text);
    }

    private static String packSize(double grams) {
        for (int size : PACK_SIZES_G) {
            if (grams <= size) return size >= 1000 ? (size / 1000) + " kg" : size + " g";
        }
        return g(grams);
    }
}
