package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.ClaimViolation;
import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.MarketingClaim;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.service.InciSortingService;
import com.demiurgio.formularium.service.InciSortingService.InciEntry;
import com.demiurgio.formularium.service.ValidationEngineService;
import org.openpdf.text.Chunk;
import org.openpdf.text.Document;
import org.openpdf.text.DocumentException;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import static com.demiurgio.formularium.export.PdfKit.*;

/**
 * Product Information File summary: label INCI list, full quantitative composition,
 * formula characteristics, automated checks, claim support and sign-off.
 * A starting point for the PIF, not a safety assessment.
 */
@Component
public class PifPdfGenerator extends AbstractPdfGenerator {

    private final InciSortingService inciSorter;
    private final ValidationEngineService validationEngine;

    public PifPdfGenerator(InciSortingService inciSorter, ValidationEngineService validationEngine) {
        this.inciSorter = inciSorter;
        this.validationEngine = validationEngine;
    }

    @Override
    protected String documentName() {
        return "Product Information File";
    }

    @Override
    protected String documentPurpose(ValidationRequest request) {
        return "Formula dossier for your records and for the safety assessor (EU Reg. 1223/2009, Art. 11).";
    }

    @Override
    protected List<String[]> titleFacts(ValidationRequest request) {
        List<String[]> facts = super.titleFacts(request);
        facts.add(new String[]{"Target pH", request.targetPh() != null ? num(request.targetPh()) : "Not set"});
        facts.add(new String[]{"Ingredients", String.valueOf(ingredients(request).size())});
        facts.add(new String[]{"Document status", "Draft"});
        facts.add(new String[]{"Version", "1.0"});
        return facts;
    }

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        ValidationResponse checks = validationEngine.validate(request);

        addCallout(document, Tone.INFO, null, List.of(
                "This summary documents the formula and the automated checks run in Formularium. Before a product is sold in the EU or UK, "
                        + "a qualified safety assessor must review it and issue a Cosmetic Product Safety Report (CPSR)."));

        addLabelList(document, request);
        addComposition(document, request);
        addCharacteristics(document, request);
        addChecks(document, checks);
        addClaims(document, request, checks);
        addUsageReview(document, request);
        addSignOff(document);
    }

    // ---------- 1. Label ----------

    private void addLabelList(Document document, ValidationRequest request) throws DocumentException {
        addSection(document, "1", "Ingredient list for the label (INCI)");
        addNote(document, "Above 1%: in descending order of concentration. At or below 1%: any order (alphabetical here).");

        List<InciEntry> entries = inciSorter.labelOrder(ingredients(request));
        Paragraph inci = new Paragraph();
        inci.setLeading(0f, 1.4f);
        for (int i = 0; i < entries.size(); i++) {
            InciEntry entry = entries.get(i);
            boolean firstBelowOne = entry.percentage() <= 1.0 && (i == 0 || entries.get(i - 1).percentage() > 1.0);
            if (firstBelowOne && i > 0) inci.add(new Chunk("  |  ", SMALL));
            else if (i > 0) inci.add(new Chunk(", ", BODY));
            inci.add(new Chunk(entry.inci(), entry.percentage() > 1.0 ? BODY_BOLD : BODY));
        }

        PdfPTable box = new PdfPTable(1);
        box.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(PAPER);
        cell.setBorderColor(BORDER);
        cell.setPadding(10f);
        cell.addElement(inci);
        box.addCell(cell);
        document.add(box);

        List<String> blends = ingredients(request).stream().filter(inciSorter::isBlend).map(PdfKit::tradeName).toList();
        if (!blends.isEmpty()) {
            addNote(document, "Supplier blends (" + String.join(", ", blends) + ") are listed as their separate INCI components, ranked by the blend's total %. "
                    + "Check the order against the supplier's composition.");
        }

        if (ingredients(request).stream().anyMatch(i -> Boolean.TRUE.equals(i.isFragrance()))) {
            addCallout(document, Tone.WARNING, "Fragrance allergens", List.of(
                    "This formula contains fragrance or essential oils. Fragrance allergens (e.g. Linalool, Limonene, Geraniol) must be listed individually "
                            + "when above 0.001% in leave-on or 0.01% in rinse-off products. Use the supplier's allergen declaration to calculate them."));
        }
    }

    // ---------- 2. Composition ----------

    private void addComposition(Document document, ValidationRequest request) throws DocumentException {
        addSection(document, "2", "Quantitative composition");

        PdfPTable table = table(1f, 5.2f, 2f, 3f, 1.4f);
        table.addCell(th("Phase", Element.ALIGN_CENTER));
        table.addCell(th("INCI name  /  trade name"));
        table.addCell(th("CAS no."));
        table.addCell(th("Function"));
        table.addCell(th("% w/w", Element.ALIGN_RIGHT));

        int row = 0;
        for (String phase : List.of("A", "B", "C")) {
            for (FormulaIngredient ing : phase(request, phase)) {
                PdfPCell phaseCell = td(new Phrase(phase, PHASE_TITLE), Element.ALIGN_CENTER);
                phaseCell.setBackgroundColor(phaseColor(phase));
                table.addCell(phaseCell);
                List<PdfPCell> cells = List.of(
                        twoLine(inciName(ing), tradeName(ing)),
                        td(ing.casNumber() == null || ing.casNumber().isBlank() ? "-" : ing.casNumber(), SMALL),
                        td(ing.function(), SMALL),
                        tdRight(pct(ing.percentage()), BODY));
                for (PdfPCell c : cells) {
                    zebra(c, row);
                    table.addCell(c);
                }
                row++;
            }
        }

        double total = totalPercentage(ingredients(request));
        PdfPCell label = td("Total", BODY_BOLD);
        label.setColspan(4);
        label.setBackgroundColor(BRAND_LIGHT);
        table.addCell(label);
        PdfPCell totalCell = tdRight(pct(total), BODY_BOLD);
        totalCell.setBackgroundColor(Math.abs(total - 100) > 0.01 ? ERROR_BG : BRAND_LIGHT);
        table.addCell(totalCell);
        document.add(table);
    }

    // ---------- 3. Characteristics ----------

    private void addCharacteristics(Document document, ValidationRequest request) throws DocumentException {
        addSection(document, "3", "Formula characteristics");

        double batch = batchWeight(request);
        List<String[]> rows = new ArrayList<>();
        rows.add(new String[]{"Product type", profileName(request), ""});
        String range = phRange(request);
        rows.add(new String[]{"Target pH", request.targetPh() != null ? num(request.targetPh()) : "Not set",
                range != null ? "Recommended " + range : ""});
        for (String phase : List.of("A", "B", "C")) {
            List<FormulaIngredient> items = phase(request, phase);
            if (items.isEmpty()) continue;
            double p = totalPercentage(items);
            rows.add(new String[]{phaseTitle(phase).replace("PHASE", "Phase"), pct(p) + "  (" + g(p / 100 * batch) + ")",
                    items.size() + " ingredient" + (items.size() != 1 ? "s" : "")});
        }
        Double maxOil = request.profile() != null ? request.profile().maxOilPhasePercent() : null;
        rows.add(new String[]{"Oil-soluble content", pct(request.oilPhasePercentage()),
                maxOil != null ? "Profile maximum " + pct(maxOil) : ""});
        long heatSensitive = ingredients(request).stream().filter(i -> i.maxHeatingTempC() != null && i.maxHeatingTempC() <= 50).count();
        rows.add(new String[]{"Heat-sensitive ingredients", String.valueOf(heatSensitive), heatSensitive > 0 ? "Max 50°C or lower" : ""});

        PdfPTable table = table(3, 3, 4);
        table.addCell(th("Property"));
        table.addCell(th("Value"));
        table.addCell(th("Reference"));
        int row = 0;
        for (String[] r : rows) {
            PdfPCell a = td(r[0], BODY_BOLD), b = td(r[1]), c = td(r[2], SMALL);
            zebra(a, row); zebra(b, row); zebra(c, row);
            table.addCell(a); table.addCell(b); table.addCell(c);
            row++;
        }
        document.add(table);
    }

    // ---------- 4. Automated checks ----------

    private void addChecks(Document document, ValidationResponse checks) throws DocumentException {
        addSection(document, "4", "Formulation checks");

        List<ValidationResponse.Alert> alerts = checks.getAlerts().stream()
                .filter(a -> !"success".equals(a.type()))
                .toList();
        if (alerts.isEmpty()) {
            addCallout(document, Tone.SUCCESS, "No issues found", List.of("All automated structure, pH, usage-rate and compatibility checks passed."));
            return;
        }

        PdfPTable table = table(1.3f, 10);
        table.addCell(th("Level"));
        table.addCell(th("Finding"));
        for (ValidationResponse.Alert alert : alerts) {
            boolean error = "error".equals(alert.type());
            PdfPCell level = td(error ? "Error" : "Warning", new Font(Font.HELVETICA, 8, Font.BOLD, error ? ERROR : WARNING));
            level.setBackgroundColor(error ? ERROR_BG : WARNING_BG);
            table.addCell(level);
            table.addCell(td(clean(alert.message())));
        }
        document.add(table);
    }

    // ---------- 5. Claims ----------

    private void addClaims(Document document, ValidationRequest request, ValidationResponse checks) throws DocumentException {
        addSection(document, "5", "Marketing claims");
        List<MarketingClaim> claims = request.targetClaims();
        if (claims == null || claims.isEmpty()) {
            addNote(document, "No marketing claims were selected for this product.");
            return;
        }

        PdfPTable table = table(2.5f, 1.6f, 7);
        table.addCell(th("Claim"));
        table.addCell(th("Status"));
        table.addCell(th("Details"));
        for (MarketingClaim claim : claims) {
            List<ClaimViolation> violations = checks.getClaimViolations().stream().filter(v -> v.claim() == claim).toList();
            boolean ok = violations.isEmpty();
            table.addCell(td(claimLabel(claim), BODY_BOLD));
            PdfPCell status = td(ok ? "Supported" : "Not supported", new Font(Font.HELVETICA, 8, Font.BOLD, ok ? SUCCESS : ERROR));
            status.setBackgroundColor(ok ? SUCCESS_BG : ERROR_BG);
            table.addCell(status);
            table.addCell(td(ok ? "No conflicting ingredients found." :
                    violations.stream().map(v -> v.ingredientName() + ": " + clean(v.reason())).collect(Collectors.joining("\n")), SMALL));
        }
        document.add(table);
        addNote(document, "Claims are checked against ingredient data only. Keep supplier certificates as evidence for every claim.");
    }

    // ---------- 6. Usage review ----------

    private void addUsageReview(Document document, ValidationRequest request) throws DocumentException {
        addSection(document, "6", "Usage rate review");

        PdfPTable table = table(5, 1.5f, 2.2f, 1.6f, 1.8f);
        table.addCell(th("Ingredient"));
        table.addCell(th("Used", Element.ALIGN_RIGHT));
        table.addCell(th("Recommended", Element.ALIGN_RIGHT));
        table.addCell(th("Max temp", Element.ALIGN_RIGHT));
        table.addCell(th("Status", Element.ALIGN_CENTER));

        for (FormulaIngredient ing : ingredients(request)) {
            Double min = ing.minPercentage(), max = ing.maxPercentage();
            String status;
            Color colour;
            if (max != null && ing.percentage() > max) { status = "Above max"; colour = ERROR; }
            else if (min != null && ing.percentage() > 0 && ing.percentage() < min) { status = "Below min"; colour = WARNING; }
            else { status = "OK"; colour = SUCCESS; }

            table.addCell(twoLine(tradeName(ing), inciName(ing)));
            table.addCell(tdRight(pct(ing.percentage()), BODY_BOLD));
            table.addCell(tdRight(min == null && max == null ? "-" : num(min == null ? 0 : min) + "-" + num(max == null ? 100 : max) + "%", SMALL));
            table.addCell(tdRight(ing.maxHeatingTempC() == null ? "-" : num(ing.maxHeatingTempC()) + "°C", SMALL));
            table.addCell(td(new Phrase(status, new Font(Font.HELVETICA, 8, Font.BOLD, colour)), Element.ALIGN_CENTER));
        }
        document.add(table);
    }

    // ---------- 7. Sign-off ----------

    private void addSignOff(Document document) throws DocumentException {
        addSection(document, "7", "Review & sign-off");

        PdfPTable table = table(3, 4, 3, 2);
        table.addCell(th("Role"));
        table.addCell(th("Name"));
        table.addCell(th("Signature"));
        table.addCell(th("Date"));
        for (String role : List.of("Formulator", "Safety assessor", "Responsible person")) {
            PdfPCell roleCell = td(role, BODY_BOLD);
            roleCell.setMinimumHeight(26f);
            table.addCell(roleCell);
            table.addCell(writeIn());
            table.addCell(writeIn());
            table.addCell(writeIn());
        }
        document.add(table);

        addCallout(document, Tone.INFO, "Still needed for a complete PIF", List.of(
                "Cosmetic Product Safety Report (CPSR) by a qualified assessor",
                "Supplier SDS, CoA and allergen / IFRA documents for every ingredient",
                "Stability and challenge (preservative efficacy) test results",
                "Manufacturing method (GMP, ISO 22716) and packaging details",
                "Proof of claimed effects and any undesirable-effects data"));
    }

    // ---------- Helpers ----------

    private static String claimLabel(MarketingClaim claim) {
        String words = claim.name().replace('_', ' ').toLowerCase(Locale.ROOT);
        return claim == MarketingClaim.COSMOS ? "COSMOS compliant" : Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    /** Validation messages may contain symbols Helvetica can't draw. */
    private static String clean(String text) {
        return text == null ? "" : text.replace("≤", "<=").replace("≥", ">=");
    }
}
