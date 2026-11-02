package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import static com.demiurgio.formularium.export.PdfKit.*;

/**
 * Bench document for making one batch: what to prepare, what to weigh per phase,
 * step-by-step process derived from the formula type, and a QC record to fill in.
 */
@Component
public class BatchTicketPdfGenerator extends AbstractPdfGenerator {

    private static final double HOT_PROCESS_TEMP = 75;
    private static final double HEAT_SAFE_TEMP = 70; // below this, an ingredient can't go through the hot process
    private static final double DEFAULT_COOL_DOWN_TEMP = 40;

    @Override
    protected String documentName() {
        return "Lab Batch Ticket";
    }

    @Override
    protected String documentPurpose(ValidationRequest request) {
        return "Print, keep it at the bench, tick each step and record actual weights.";
    }

    @Override
    protected List<String[]> titleFacts(ValidationRequest request) {
        List<String[]> facts = super.titleFacts(request);
        String ph = request.targetPh() != null ? PdfKit.num(request.targetPh()) : "-";
        String range = phRange(request);
        facts.add(new String[]{"Target pH", range != null ? ph + "  (range " + range + ")" : ph});
        facts.add(new String[]{"Lot number", "____________"});
        facts.add(new String[]{"Made by", "____________"});
        facts.add(new String[]{"Ingredients", String.valueOf(ingredients(request).size())});
        return facts;
    }

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        double batch = batchWeight(request);
        FormulaType type = FormulaType.of(request);

        addWarnings(document, request, type);
        addPreparation(document, type, request);
        addWeighingSheet(document, request, batch, type);
        addProcess(document, request, type);
        addQualityRecord(document, request, batch);
        addSignOff(document);
    }

    // ---------- Sections ----------

    private void addWarnings(Document document, ValidationRequest request, FormulaType type) throws DocumentException {
        List<String> issues = new ArrayList<>();
        double total = totalPercentage(ingredients(request));
        if (Math.abs(total - 100) > 0.01) {
            issues.add("The formula adds up to " + pct(total) + ", not 100%. Fix it in the Studio before weighing.");
        }
        for (FormulaIngredient ing : ingredients(request)) {
            if (ing.maxPercentage() != null && ing.percentage() > ing.maxPercentage()) {
                issues.add(tradeName(ing) + " is above its maximum usage rate (" + pct(ing.percentage()) + " vs max " + pct(ing.maxPercentage()) + ").");
            }
            if (type.heated() && isHeldBack(ing)) {
                issues.add(tradeName(ing) + " (phase " + ing.phase() + ") tolerates only " + num(ing.maxHeatingTempC())
                        + "°C. The method adds it after heating; you can also move it to phase C in the Studio.");
            }
        }
        if (!issues.isEmpty()) {
            addCallout(document, Tone.WARNING, "Check before you start", issues);
        }
    }

    private void addPreparation(Document document, FormulaType type, ValidationRequest request) throws DocumentException {
        addSection(document, "1", "Before you start");

        List<String> items = new ArrayList<>(List.of(
                "Clean work surface, gloves, hair tie and lab coat or apron",
                "Digital scale reading to 0.01 g",
                "Heat-resistant beakers, one per phase, labelled A / B / C",
                "Spatulas, glass rods or silicone spatulas",
                "70% isopropyl alcohol spray to sanitise all tools and packaging",
                "Clean, sanitised containers and labels"));
        if (type.heated()) {
            items.add("Water bath or double boiler, and a thermometer");
        }
        if (type == FormulaType.EMULSION) {
            items.add("Stick blender or overhead mixer");
        }
        if (request.targetPh() != null) {
            items.add("pH meter or narrow-range pH strips, plus pH adjuster solutions (e.g. 50% citric acid, 10% sodium hydroxide)");
        }

        PdfPTable table = new PdfPTable(new float[]{0.5f, 10, 0.5f, 10});
        table.setWidthPercentage(100);
        for (String item : items) {
            table.addCell(borderless(checkbox()));
            table.addCell(borderless(td(item)));
        }
        if (items.size() % 2 == 1) {
            table.addCell(borderless(td("")));
            table.addCell(borderless(td("")));
        }
        document.add(table);
    }

    private void addWeighingSheet(Document document, ValidationRequest request, double batch, FormulaType type) throws DocumentException {
        addSection(document, "2", "Weighing sheet");
        addNote(document, "Tare the beaker, weigh each ingredient, write the actual weight and tick it off. Small amounts: weigh into a separate dish first.");

        PdfPTable table = table(0.6f, 5.2f, 1.4f, 1.6f, 1.6f, 3.6f);
        table.addCell(th("", Element.ALIGN_CENTER));
        table.addCell(th("Ingredient"));
        table.addCell(th("%", Element.ALIGN_RIGHT));
        table.addCell(th("Target", Element.ALIGN_RIGHT));
        table.addCell(th("Actual", Element.ALIGN_CENTER));
        table.addCell(th("Notes"));

        for (String phase : List.of("A", "B", "C")) {
            List<FormulaIngredient> items = phase(request, phase);
            if (items.isEmpty()) continue;

            double phasePct = totalPercentage(items);
            table.addCell(phaseHeader(phase, phaseTitle(phase), pct(phasePct) + "  |  " + g(phasePct / 100 * batch), 6));

            for (FormulaIngredient ing : items) {
                table.addCell(checkbox());
                table.addCell(twoLine(tradeName(ing), inciName(ing)));
                table.addCell(tdRight(pct(ing.percentage()), BODY));
                table.addCell(tdRight(g(grams(ing, batch)), BODY_BOLD));
                table.addCell(writeIn());
                table.addCell(td(ingredientNote(ing, type), SMALL));
            }
        }

        double total = totalPercentage(ingredients(request));
        PdfPCell label = td("Total", BODY_BOLD);
        label.setColspan(2);
        label.setBackgroundColor(BRAND_LIGHT);
        table.addCell(label);
        PdfPCell totalPct = tdRight(pct(total), BODY_BOLD);
        totalPct.setBackgroundColor(BRAND_LIGHT);
        table.addCell(totalPct);
        PdfPCell totalG = tdRight(g(total / 100 * batch), BODY_BOLD);
        totalG.setBackgroundColor(BRAND_LIGHT);
        table.addCell(totalG);
        PdfPCell actual = writeIn();
        actual.setBackgroundColor(BRAND_LIGHT);
        table.addCell(actual);
        PdfPCell empty = td("");
        empty.setBackgroundColor(BRAND_LIGHT);
        table.addCell(empty);

        document.add(table);
    }

    private void addProcess(Document document, ValidationRequest request, FormulaType type) throws DocumentException {
        addSection(document, "3", "Method");
        boolean hasA = !phase(request, "A").isEmpty();
        boolean hasB = !phase(request, "B").isEmpty();
        boolean hasC = !phase(request, "C").isEmpty();

        // Heat-sensitive items in heated phases are held back and stirred in once the batch has cooled enough
        List<FormulaIngredient> heldBack = type.heated() ? heldBack(request) : List.of();
        List<FormulaIngredient> warmAddition = heldBack.stream().filter(i -> i.maxHeatingTempC() > DEFAULT_COOL_DOWN_TEMP).toList();
        List<FormulaIngredient> withCoolDown = heldBack.stream().filter(i -> i.maxHeatingTempC() <= DEFAULT_COOL_DOWN_TEMP).toList();
        String heldBackNote = heldBack.isEmpty() ? "" : " Leave out " + names(heldBack) + " for now (heat-sensitive).";

        List<String> steps = new ArrayList<>();
        steps.add("Sanitise tools, beakers and packaging with 70% alcohol and let them air-dry.");
        steps.add("Weigh every ingredient into its phase beaker using the weighing sheet.");

        switch (type) {
            case EMULSION -> {
                steps.add("Heat phase A and phase B separately in the water bath to 70-75°C. Hold for 20 minutes so everything is fully melted and dissolved." + heldBackNote);
                steps.add("Check both phases are at about the same temperature, then pour phase B into phase A.");
                steps.add("Blend with the stick blender in short bursts for 1-3 minutes until smooth and uniform.");
                steps.add("Keep stirring gently by hand while the emulsion cools. It will thicken as it cools.");
            }
            case ANHYDROUS -> {
                steps.add("Melt phase B in the water bath at 70-75°C until completely liquid, waxes and hard butters first." + heldBackNote);
                steps.add("Take it off the heat and stir while it cools. For butters, cool quickly (fridge or ice bath) to avoid graininess.");
            }
            case AQUEOUS -> {
                steps.add("Add the phase A ingredients to the water one at a time, stirring until each one dissolves. Sprinkle gums and powders in slowly to avoid lumps.");
                if (hasB) steps.add("Pre-mix phase B with its solubiliser, then add it to phase A while stirring.");
            }
        }

        if (!warmAddition.isEmpty()) {
            double below = warmAddition.stream().mapToDouble(FormulaIngredient::maxHeatingTempC).min().orElse(DEFAULT_COOL_DOWN_TEMP);
            steps.add("Once below " + num(below) + "°C, stir in the held-back ingredients: " + names(warmAddition) + ".");
        }
        if (hasC || !withCoolDown.isEmpty()) {
            List<FormulaIngredient> coolDownItems = new ArrayList<>(withCoolDown);
            coolDownItems.addAll(phase(request, "C"));
            double coolDown = Math.min(DEFAULT_COOL_DOWN_TEMP, lowestHeatLimit(coolDownItems));
            String what = withCoolDown.isEmpty() ? "the phase C ingredients" : "these";
            steps.add((type.heated() ? "Once below " + num(coolDown) + "°C, add " : "Add ") + what + " one at a time, mixing well after each: " + names(coolDownItems) + ".");
        }
        if (request.targetPh() != null && hasA) {
            String range = phRange(request);
            steps.add("Check the pH (dilute 1 part product in 9 parts distilled water for thick products). Aim for pH " + num(request.targetPh())
                    + (range != null ? " (acceptable " + range + ")" : "") + ". Adjust drop by drop and re-check after each addition.");
        }
        steps.add("Weigh the finished batch, fill into containers and label with the product name, date and lot number.");
        if (!hasA && !hasB && !hasC) steps.clear();

        PdfPTable table = new PdfPTable(new float[]{0.5f, 0.6f, 12});
        table.setWidthPercentage(100);
        int number = 1;
        for (String step : steps) {
            table.addCell(borderless(checkbox()));
            PdfPCell n = borderless(td(number++ + ".", BODY_BOLD));
            n.setVerticalAlignment(Element.ALIGN_TOP);
            table.addCell(n);
            table.addCell(borderless(td(step)));
        }
        document.add(table);
    }

    private void addQualityRecord(Document document, ValidationRequest request, double batch) throws DocumentException {
        addSection(document, "4", "Quality record", 300f); // heading + whole QC table stay together

        String phTarget = request.targetPh() != null ? num(request.targetPh()) + (phRange(request) != null ? " (" + phRange(request) + ")" : "") : "-";
        String[][] rows = {
                {"pH", phTarget},
                {"Appearance", "Smooth, uniform, no separation"},
                {"Colour", ""},
                {"Odour", ""},
                {"Texture / viscosity", ""},
                {"Final weight", g(batch)},
                {"Yield (final / target)", "> 95%"},
                {"After 24 h", "No separation, no grain"},
                {"After 1 week", "Stable colour, odour and texture"},
        };

        PdfPTable table = table(3, 3.5f, 4);
        table.setKeepTogether(true);
        table.addCell(th("Check"));
        table.addCell(th("Target"));
        table.addCell(th("Result"));
        int row = 0;
        for (String[] r : rows) {
            PdfPCell check = td(r[0], BODY_BOLD);
            PdfPCell target = td(r[1], SMALL);
            PdfPCell result = writeIn();
            zebra(check, row);
            zebra(target, row);
            zebra(result, row);
            table.addCell(check);
            table.addCell(target);
            table.addCell(result);
            row++;
        }
        document.add(table);
    }

    private void addSignOff(Document document) throws DocumentException {
        Paragraph spacer = new Paragraph(" ");
        spacer.setSpacingBefore(6f);
        document.add(spacer);

        PdfPTable table = new PdfPTable(new float[]{1, 2.2f, 0.6f, 1, 2.2f});
        table.setWidthPercentage(100);
        table.addCell(borderless(td("Made by", SMALL_BOLD)));
        table.addCell(borderless(writeIn()));
        table.addCell(borderless(td("")));
        table.addCell(borderless(td("Date", SMALL_BOLD)));
        table.addCell(borderless(writeIn()));
        table.addCell(borderless(td("Checked by", SMALL_BOLD)));
        table.addCell(borderless(writeIn()));
        table.addCell(borderless(td("")));
        table.addCell(borderless(td("Release", SMALL_BOLD)));
        table.addCell(borderless(td("[  ] Approved     [  ] Rejected", BODY)));
        document.add(table);
    }

    // ---------- Helpers ----------

    private String ingredientNote(FormulaIngredient ing, FormulaType type) {
        List<String> notes = new ArrayList<>();
        if (type.heated() && isHeldBack(ing)) notes.add("Add after heating (max " + num(ing.maxHeatingTempC()) + "°C)");
        else if (ing.maxHeatingTempC() != null && ing.maxHeatingTempC() <= 60) notes.add("Max " + num(ing.maxHeatingTempC()) + "°C");
        if (ing.percentage() > 0 && ing.percentage() < 0.5) notes.add("Small amount: weigh carefully");
        if (ing.function() != null && !ing.function().isBlank() && !"None".equals(ing.function())) notes.add(ing.function());
        return String.join(" | ", notes);
    }

    private static double lowestHeatLimit(List<FormulaIngredient> items) {
        return items.stream()
                .map(FormulaIngredient::maxHeatingTempC)
                .filter(Objects::nonNull)
                .mapToDouble(Double::doubleValue)
                .min()
                .orElse(HOT_PROCESS_TEMP + 5);
    }

    /** In a heated phase but can't take the 70-75°C process temperature. */
    private static boolean isHeldBack(FormulaIngredient ing) {
        return !"C".equals(ing.phase()) && ing.maxHeatingTempC() != null && ing.maxHeatingTempC() < HEAT_SAFE_TEMP;
    }

    private static List<FormulaIngredient> heldBack(ValidationRequest request) {
        return ingredients(request).stream().filter(BatchTicketPdfGenerator::isHeldBack).toList();
    }

    private static String names(List<FormulaIngredient> items) {
        return String.join(", ", items.stream().map(PdfKit::tradeName).toList());
    }

    private static PdfPCell borderless(PdfPCell cell) {
        cell.setBorder(com.lowagie.text.Rectangle.NO_BORDER);
        cell.setPaddingTop(3f);
        cell.setPaddingBottom(3f);
        return cell;
    }

    /** How the batch is processed, inferred from which phases have content. */
    private enum FormulaType {
        EMULSION, ANHYDROUS, AQUEOUS;

        static FormulaType of(ValidationRequest request) {
            boolean hasWaterPhase = !phase(request, "A").isEmpty();
            boolean hasOilPhase = !phase(request, "B").isEmpty();
            if (hasWaterPhase && hasOilPhase) {
                // A few drops of oil solubilised into a toner is not an emulsion
                boolean hasEmulsifier = ingredients(request).stream()
                        .anyMatch(i -> i.function() != null && i.function().toLowerCase().contains("emulsifier")
                                && !i.function().toLowerCase().contains("solubilizer"));
                return hasEmulsifier || (request.profile() != null && request.profile().requiresEmulsifier()) ? EMULSION : AQUEOUS;
            }
            return hasOilPhase ? ANHYDROUS : AQUEOUS;
        }

        boolean heated() {
            return this != AQUEOUS;
        }
    }
}
