package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.BatchRecordRequest;
import com.demiurgio.formularium.dto.BatchRecordRequest.Check;
import com.demiurgio.formularium.dto.BatchRecordRequest.Line;
import com.demiurgio.formularium.dto.BatchRecordRequest.StashLot;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * The quality record of one batch, laid out from the data stored when it was made and followed up: lot and date, the
 * weights actually used and which stash lots they came from, what it cost, the pH and notes, and every stability
 * check. Everything on it is a fact the app recorded, so it can be printed again at any time.
 */
@Component
public class BatchRecordPdfGenerator {

    private static final String DOCUMENT_NAME = "Batch Quality Record";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    /** A weighed amount this far from the plan is worth pointing out. */
    private static final double NOTABLE_DEVIATION_PCT = 5.0;

    public byte[] generate(BatchRecordRequest request) throws DocumentException {
        Document document = PdfKit.newDocument();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(document, out);
        PdfKit.addFooter(writer, DOCUMENT_NAME, productName(request) + " - lot " + text(request.lotNumber(), "?"));

        document.open();
        PdfKit.addTitleBlock(document, DOCUMENT_NAME, "What was made, from what, what it cost and how it held up.", List.of(
                new String[]{"Product", productName(request)},
                new String[]{"Lot number", text(request.lotNumber(), "-")},
                new String[]{"Made", date(request.madeOn())},
                new String[]{"Batch size", PdfKit.g(request.batchSizeG())}));

        addStatus(document, request);
        addSummary(document, request);
        addIngredients(document, request);
        addMeasurements(document, request);
        addChecks(document, request);
        addSignOff(document);
        document.close();

        return out.toByteArray();
    }

    // ---------- Sections ----------

    private void addStatus(Document document, BatchRecordRequest request) throws DocumentException {
        String status = request.status() == null ? "" : request.status();
        boolean failed = checks(request).stream().anyMatch(c -> "failed".equals(c.result()));
        if ("voided".equals(status)) {
            PdfKit.addCallout(document, PdfKit.Tone.WARNING, "This batch was undone",
                    List.of("It was recorded as never made, and any stash amounts it took were put back. Keep this page only as a record of the attempt."));
        } else if ("discarded".equals(status)) {
            PdfKit.addCallout(document, PdfKit.Tone.ERROR, "This batch was discarded", List.of("It should not be used."));
        } else if (failed) {
            PdfKit.addCallout(document, PdfKit.Tone.ERROR, "A stability check failed", List.of("Do not use this batch. Review the preservative, pH and hygiene before making it again."));
        }
    }

    private void addSummary(Document document, BatchRecordRequest request) throws DocumentException {
        PdfKit.addSection(document, "1", "Summary");
        PdfPTable table = PdfKit.table(2f, 5f);
        table.setHeaderRows(0);
        row(table, "Status", statusLabel(request.status()));
        if (request.container() != null) row(table, "Filled into", containerText(request));
        row(table, "pH", phText(request));
        if (request.finalWeightG() != null) {
            String yield = request.yieldPct() != null ? " (" + PdfKit.num(request.yieldPct()) + "% of the planned " + PdfKit.g(request.batchSizeG()) + ")" : "";
            row(table, "Final weight", PdfKit.g(request.finalWeightG()) + yield);
        }
        row(table, "Stash", request.stashDeducted()
                ? "Used " + PdfKit.g(totalFromStash(request)) + " from " + lotCount(request) + " stash lot" + (lotCount(request) == 1 ? "" : "s") + " when the batch started"
                : "Not changed by this batch");
        for (String[] costRow : costRows(request)) row(table, costRow[0], costRow[1]);
        document.add(table);
    }

    private void addIngredients(Document document, BatchRecordRequest request) throws DocumentException {
        PdfKit.addSection(document, "2", "What went in");
        List<Line> lines = lines(request);
        if (lines.isEmpty()) {
            document.add(new Paragraph("No ingredients were recorded.", PdfKit.ITALIC));
            return;
        }

        String currency = currency(request);
        PdfPTable table = PdfKit.table(3.4f, 0.8f, 1.1f, 1.4f, 1.4f, 3.2f, 1.5f);
        table.addCell(PdfKit.th("Ingredient"));
        table.addCell(PdfKit.th("Phase", Element.ALIGN_CENTER));
        table.addCell(PdfKit.th("%", Element.ALIGN_RIGHT));
        table.addCell(PdfKit.th("Planned", Element.ALIGN_RIGHT));
        table.addCell(PdfKit.th("Weighed", Element.ALIGN_RIGHT));
        table.addCell(PdfKit.th("From your stash"));
        table.addCell(PdfKit.th("Cost", Element.ALIGN_RIGHT));

        int index = 0;
        for (Line line : lines) {
            PdfPCell name = PdfKit.twoLine(text(line.name(), "Unknown"), line.inciName());
            PdfKit.zebra(name, index);
            table.addCell(name);

            PdfPCell phase = PdfKit.td(text(line.phase(), "-"), PdfKit.BODY_BOLD);
            phase.setHorizontalAlignment(Element.ALIGN_CENTER);
            phase.setBackgroundColor(PdfKit.phaseColor(line.phase()));
            table.addCell(phase);

            table.addCell(shaded(PdfKit.tdRight(PdfKit.pct(line.percentage()), PdfKit.BODY), index));
            table.addCell(shaded(PdfKit.tdRight(PdfKit.g(line.plannedG()), PdfKit.BODY), index));
            table.addCell(shaded(PdfKit.tdRight(PdfKit.g(line.actualG()) + deviation(line), deviates(line) ? PdfKit.WARNING_TEXT : PdfKit.BODY_BOLD), index));
            table.addCell(shaded(PdfKit.td(lots(line), PdfKit.SMALL), index));
            table.addCell(shaded(PdfKit.tdRight(lineCost(line, currency), line.cost() == null ? PdfKit.SMALL : PdfKit.BODY), index));
            index++;
        }

        table.addCell(footerCell("Total", Element.ALIGN_LEFT));
        table.addCell(footerCell("", Element.ALIGN_LEFT));
        table.addCell(footerCell(PdfKit.pct(lines.stream().mapToDouble(Line::percentage).sum()), Element.ALIGN_RIGHT));
        table.addCell(footerCell(PdfKit.g(lines.stream().mapToDouble(Line::plannedG).sum()), Element.ALIGN_RIGHT));
        table.addCell(footerCell(PdfKit.g(lines.stream().mapToDouble(Line::actualG).sum()), Element.ALIGN_RIGHT));
        table.addCell(footerCell("", Element.ALIGN_LEFT));
        table.addCell(footerCell(request.cost() != null && request.cost().ingredientTotal() != null ? money(currency, request.cost().ingredientTotal()) : "", Element.ALIGN_RIGHT));
        document.add(table);

        String costNote = costNote(request);
        if (costNote != null) document.add(new Paragraph(costNote, PdfKit.ITALIC));
    }

    private void addMeasurements(Document document, BatchRecordRequest request) throws DocumentException {
        PdfKit.addSection(document, "3", "Measurements and notes");
        PdfPTable table = PdfKit.table(2f, 5f);
        table.setHeaderRows(0);
        row(table, "Target pH", request.targetPh() != null ? PdfKit.num(request.targetPh()) : "not set");
        row(table, "Measured pH", request.measuredPh() != null ? PdfKit.num(request.measuredPh()) : "not measured");
        row(table, "Final weight", request.finalWeightG() != null ? PdfKit.g(request.finalWeightG()) : "not weighed");
        document.add(table);

        Paragraph label = new Paragraph("Notes", PdfKit.TH);
        label.setSpacingBefore(8f);
        document.add(label);
        boolean hasNotes = request.notes() != null && !request.notes().isBlank();
        document.add(new Paragraph(hasNotes ? request.notes().trim() : "No notes were recorded.", hasNotes ? PdfKit.BODY : PdfKit.ITALIC));
    }

    private void addChecks(Document document, BatchRecordRequest request) throws DocumentException {
        PdfKit.addSection(document, "4", "Stability check-ins");
        List<Check> checks = checks(request);
        if (checks.isEmpty()) {
            document.add(new Paragraph("No check-ins were planned for this batch.", PdfKit.ITALIC));
            return;
        }

        PdfPTable table = PdfKit.table(1.5f, 1.6f, 1.6f, 1.9f, 0.8f, 3.8f);
        for (String header : List.of("Check", "Due", "Done", "Result", "pH", "What was noticed")) table.addCell(PdfKit.th(header));
        int index = 0;
        for (Check check : checks) {
            boolean done = check.checkedAt() != null;
            table.addCell(shaded(PdfKit.td(text(check.label(), "-"), PdfKit.BODY_BOLD), index));
            table.addCell(shaded(PdfKit.td(date(check.dueOn()), PdfKit.BODY), index));
            table.addCell(shaded(PdfKit.td(done ? date(check.checkedAt()) : "not yet", done ? PdfKit.BODY : PdfKit.ITALIC), index));
            table.addCell(shaded(PdfKit.td(done ? resultLabel(check.result()) : "-", "failed".equals(check.result()) ? PdfKit.WARNING_TEXT : PdfKit.BODY), index));
            table.addCell(shaded(PdfKit.td(check.measuredPh() != null ? PdfKit.num(check.measuredPh()) : "-", PdfKit.BODY), index));
            table.addCell(shaded(PdfKit.td(observations(check), PdfKit.SMALL), index));
            index++;
        }
        document.add(table);
    }

    private void addSignOff(Document document) throws DocumentException {
        PdfKit.ensureSpace(document, 110f);
        PdfKit.addSection(document, "5", "Sign-off");
        PdfPTable table = PdfKit.table(1f, 1f);
        table.setHeaderRows(0);
        table.addCell(PdfKit.td("Made by:", PdfKit.LABEL));
        table.addCell(PdfKit.td("Checked by:", PdfKit.LABEL));
        for (int i = 0; i < 2; i++) {
            PdfPCell blank = PdfKit.writeIn();
            table.addCell(blank);
        }
        document.add(table);
        PdfKit.addNote(document, "Kept in the Formularium app: the batch, its weights, stash lots, cost and check-ins can be printed again at any time.");
    }

    // ---------- Pieces of text ----------

    private List<String[]> costRows(BatchRecordRequest request) {
        BatchRecordRequest.Cost cost = request.cost();
        String currency = currency(request);
        if (cost == null || cost.ingredientTotal() == null) {
            return List.<String[]>of(new String[]{"Cost", "No ingredient prices were known when this batch was made."});
        }
        String prefix = cost.estimated() ? "About " : "";
        List<String[]> rows = new java.util.ArrayList<>();
        rows.add(new String[]{"Ingredient cost", prefix + money(currency, cost.ingredientTotal())
                + (cost.per100g() != null ? " (" + money(currency, cost.per100g()) + " per 100 g)" : "")});
        if (cost.perContainer() != null && request.container() != null) {
            rows.add(new String[]{"Per container", prefix + money(currency, cost.perContainer()) + " including the "
                    + (cost.containerPrice() != null ? money(currency, cost.containerPrice()) + " " : "") + "container"});
        }
        return rows;
    }

    private String costNote(BatchRecordRequest request) {
        BatchRecordRequest.Cost cost = request.cost();
        if (cost == null || cost.ingredientTotal() == null) return null;
        StringBuilder note = new StringBuilder("Costs come from the prices on the stash lots used, frozen when the batch was made.");
        if (cost.estimated()) note.append(" Where ~ appears, part of the amount was priced at your average price for the ingredient.");
        if (cost.unpricedCount() > 0) {
            note.append(' ').append(cost.unpricedCount()).append(cost.unpricedCount() == 1 ? " ingredient has" : " ingredients have")
                    .append(" no price, so the real cost is higher.");
        }
        return note.toString();
    }

    private String containerText(BatchRecordRequest request) {
        BatchRecordRequest.Container container = request.container();
        StringBuilder text = new StringBuilder();
        if (container.count() != null) text.append(PdfKit.num(Math.round(container.count() * 100) / 100.0)).append(" x ");
        text.append(text(container.name(), "container"));
        if (container.volumeMl() != null) text.append(" (").append(PdfKit.num(container.volumeMl())).append(" ml each)");
        return text.toString();
    }

    private String phText(BatchRecordRequest request) {
        String target = request.targetPh() != null ? "aimed for " + PdfKit.num(request.targetPh()) : null;
        String measured = request.measuredPh() != null ? "measured " + PdfKit.num(request.measuredPh()) : "not measured yet";
        return target != null ? measured + ", " + target : measured;
    }

    private String lots(Line line) {
        List<StashLot> lots = line.stashLots() == null ? List.of() : line.stashLots();
        if (lots.isEmpty()) return "not tracked";
        return lots.stream().map(l -> PdfKit.g(l.grams()) + " from " + text(l.label(), "stash")).collect(Collectors.joining("\n"));
    }

    private String lineCost(Line line, String currency) {
        if (line.cost() == null) return "no price";
        return (line.costEstimated() ? "~" : "") + money(currency, line.cost());
    }

    private boolean deviates(Line line) {
        return line.plannedG() > 0 && Math.abs(line.actualG() - line.plannedG()) / line.plannedG() * 100 >= NOTABLE_DEVIATION_PCT;
    }

    private String deviation(Line line) {
        if (!deviates(line)) return "";
        double pct = (line.actualG() - line.plannedG()) / line.plannedG() * 100;
        return String.format(Locale.ROOT, " (%+.0f%%)", pct);
    }

    private String observations(Check check) {
        List<String> parts = new java.util.ArrayList<>();
        if (check.observations() != null && !check.observations().isEmpty()) parts.add(String.join(", ", check.observations()));
        if (check.notes() != null && !check.notes().isBlank()) parts.add(check.notes().trim());
        return parts.isEmpty() ? "-" : String.join("\n", parts);
    }

    private double totalFromStash(BatchRecordRequest request) {
        return lines(request).stream().flatMap(l -> (l.stashLots() == null ? List.<StashLot>of() : l.stashLots()).stream()).mapToDouble(StashLot::grams).sum();
    }

    private long lotCount(BatchRecordRequest request) {
        return lines(request).stream().flatMap(l -> (l.stashLots() == null ? List.<StashLot>of() : l.stashLots()).stream())
                .map(l -> text(l.label(), "stash")).distinct().count();
    }

    // ---------- Helpers ----------

    private void row(PdfPTable table, String label, String value) {
        table.addCell(PdfKit.td(label, PdfKit.LABEL));
        table.addCell(PdfKit.td(value, PdfKit.BODY));
    }

    private PdfPCell shaded(PdfPCell cell, int index) {
        PdfKit.zebra(cell, index);
        return cell;
    }

    private PdfPCell footerCell(String text, int align) {
        PdfPCell cell = PdfKit.td(text, PdfKit.BODY_BOLD);
        cell.setHorizontalAlignment(align);
        cell.setBackgroundColor(PdfKit.BRAND_LIGHT);
        return cell;
    }

    private static List<Line> lines(BatchRecordRequest request) {
        return request.lines() == null ? List.of() : request.lines().stream().filter(Objects::nonNull).toList();
    }

    private static List<Check> checks(BatchRecordRequest request) {
        return request.checks() == null ? List.of() : request.checks().stream().filter(Objects::nonNull).toList();
    }

    private static String productName(BatchRecordRequest request) {
        return text(request.name(), "Untitled batch");
    }

    private static String text(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String currency(BatchRecordRequest request) {
        return text(request.currency(), "$");
    }

    /** "$1.23", or three decimals for tiny amounts so a cheap ingredient doesn't print as nothing. */
    static String money(String currency, double value) {
        return String.format(Locale.ROOT, Math.abs(value) < 0.1 && value != 0 ? "%s%.3f" : "%s%.2f", currency, value);
    }

    private static String date(String iso) {
        if (iso == null || iso.isBlank()) return "-";
        try {
            // Timestamps (check completion) keep only the day
            return LocalDate.parse(iso.length() > 10 ? iso.substring(0, 10) : iso).format(DATE);
        } catch (DateTimeParseException e) {
            return iso;
        }
    }

    private static String statusLabel(String status) {
        return switch (status == null ? "" : status) {
            case "active" -> "In progress";
            case "archived" -> "Archived";
            case "discarded" -> "Discarded";
            case "voided" -> "Undone (never made)";
            default -> "-";
        };
    }

    private static String resultLabel(String result) {
        return switch (result == null ? "" : result) {
            case "good" -> "Looks good";
            case "minor" -> "Minor change";
            case "failed" -> "Failed";
            default -> "-";
        };
    }
}
