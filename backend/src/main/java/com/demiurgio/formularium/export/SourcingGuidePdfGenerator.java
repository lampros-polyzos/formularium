package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.SourcingGuideRequest;
import com.demiurgio.formularium.dto.SourcingGuideRequest.Item;
import com.demiurgio.formularium.dto.SourcingGuideRequest.Option;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Font;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Print-friendly guide for replicating a recipe with what the user owns:
 * a stash check, substitution options per missing ingredient, and two shopping plans
 * (exact recipe vs. making it with the stash), each with alternatives because shops differ.
 */
@Component
public class SourcingGuidePdfGenerator {

    private static final String DOCUMENT_NAME = "Substitutions & Sourcing Guide";
    private static final Color ATTENTION_BG = PdfKit.WARNING_BG;
    private static final int MIN_PLAN_B_SCORE = 50; // weaker stash matches stay on the shopping list

    private final Font headerFont = PdfKit.TH;
    private final Font bodyFont = PdfKit.BODY;
    private final Font boldFont = PdfKit.BODY_BOLD;
    private final Font smallFont = PdfKit.SMALL;
    private final Font warningFont = PdfKit.WARNING_TEXT;
    private final Font italicFont = PdfKit.ITALIC;

    public byte[] generate(SourcingGuideRequest request) throws DocumentException {
        Document document = PdfKit.newDocument();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(document, out);
        PdfKit.addFooter(writer, DOCUMENT_NAME, request.projectName());

        document.open();
        List<Item> attention = request.items().stream().filter(Item::needsAttention).toList();

        addHeader(document, request, attention);
        addStashCheck(document, request);
        if (!attention.isEmpty()) {
            addSubstitutions(document, attention);
            addPlanExact(document, request, attention);
            addPlanStash(document, request, attention);
        }
        addBeforeYouMakeIt(document);
        document.close();

        return out.toByteArray();
    }

    private void addHeader(Document document, SourcingGuideRequest request, List<Item> attention) throws DocumentException {
        long missingCount = attention.stream().filter(i -> "missing".equals(i.status())).count();
        PdfKit.addTitleBlock(document, DOCUMENT_NAME, "What you have, what to swap and what to buy to make this recipe.", List.of(
                new String[]{"Product", request.projectName()},
                new String[]{"Batch size", grams(request.targetWeight())},
                new String[]{"Missing", String.valueOf(missingCount)},
                new String[]{"Date", PdfKit.today()}));

        long missing = attention.stream().filter(i -> "missing".equals(i.status())).count();
        long low = attention.size() - missing;
        long total = request.items().size();
        String summary = attention.isEmpty()
                ? "You have every ingredient in your stash. Nothing to buy."
                : String.format(Locale.ROOT, "You have %d of %d ingredients. %d missing%s.", total - attention.size(), total, missing,
                        low > 0 ? ", " + low + " not enough in stash" : "");
        PdfKit.addCallout(document, attention.isEmpty() ? PdfKit.Tone.SUCCESS : PdfKit.Tone.WARNING, null, List.of(summary));
    }

    private void addStashCheck(Document document, SourcingGuideRequest request) throws DocumentException {
        addSection(document, "1. Stash check");

        PdfPTable table = new PdfPTable(new float[]{5, 1, 2, 2, 2.5f});
        table.setWidthPercentage(100);
        table.setHeaderRows(1);
        for (String header : List.of("Ingredient", "Phase", "Need", "In stash", "Status")) {
            table.addCell(headerCell(header));
        }

        for (Item item : request.items()) {
            Color bg = item.needsAttention() ? ATTENTION_BG : null;
            table.addCell(cell(item.name(), bodyFont, bg));
            table.addCell(cell(item.phase(), bodyFont, bg));
            table.addCell(cell(grams(item.neededG()), bodyFont, bg));
            table.addCell(cell(item.haveG() != null ? grams(item.haveG()) : "assumed".equals(item.status()) ? "-" : item.needsAttention() ? "none" : "untracked", bodyFont, bg));
            table.addCell(cell(statusLabel(item.status()), item.needsAttention() ? boldFont : bodyFont, bg));
        }
        document.add(table);
    }

    private void addSubstitutions(Document document, List<Item> attention) throws DocumentException {
        addSection(document, "2. Substitution options");
        document.add(new Paragraph("Ranked by how closely each option matches the original's function, solubility, charge, usage rate and pH. "
                + "After swapping, re-check the formula in the Studio before making a batch.", italicFont));

        for (Item item : attention) {
            Paragraph heading = new Paragraph();
            heading.setSpacingBefore(8f);
            heading.add(new Chunk(item.name(), boldFont));
            heading.add(new Chunk("  (" + item.function() + ", phase " + item.phase() + ", " + pct(item.percentage())
                    + ") - " + statusLabel(item.status()).toLowerCase() + ", need " + grams(item.neededG()), smallFont));
            document.add(heading);

            if (item.stashOptions().isEmpty() && item.marketOptions().isEmpty()) {
                document.add(indented("No close substitutes found. Buy the original.", italicFont, 12));
                continue;
            }
            addOptions(document, "From your stash", item.stashOptions());
            addOptions(document, "To buy instead", item.marketOptions());
        }
    }

    private void addOptions(Document document, String title, List<Option> options) throws DocumentException {
        if (options.isEmpty()) return;
        document.add(indented(title + ":", headerFont, 12));
        for (Option option : options) {
            Paragraph line = indented("", bodyFont, 22);
            line.add(new Chunk("- " + option.name(), boldFont));
            String cost = option.costCategory() != null ? " | " + option.costCategory() + " cost" : "";
            line.add(new Chunk("  " + option.matchLabel() + " (" + option.score() + "%) | use " + pct(option.percentage())
                    + " = " + grams(option.neededG()) + cost, smallFont));
            document.add(line);
            for (String note : option.notes()) document.add(indented(note, smallFont, 32));
            for (String warning : option.warnings()) document.add(indented("! " + warning, warningFont, 32));
        }
    }

    private void addPlanExact(Document document, SourcingGuideRequest request, List<Item> attention) throws DocumentException {
        addSection(document, "3. Shopping plan A - exact recipe");
        document.add(new Paragraph("Buy the missing originals to make the recipe exactly as written. Quantities include "
                + Math.round(request.overagePercent()) + "% extra for transfer losses.", italicFont));

        PdfPTable table = checklistTable(new float[]{0.6f, 5, 1.6f, 4}, "Ingredient", "Buy", "If your shop doesn't carry it");
        for (Item item : attention) {
            table.addCell(PdfKit.checkbox());
            table.addCell(cell(item.name() + "\n" + item.inci(), bodyFont, null));
            table.addCell(cell(grams(item.buyG()), boldFont, null));
            table.addCell(cell(alternatives(item.marketOptions()), smallFont, null));
        }
        document.add(table);
    }

    private void addPlanStash(Document document, SourcingGuideRequest request, List<Item> attention) throws DocumentException {
        addSection(document, "4. Shopping plan B - make it with your stash");

        // Each stash item stands in for at most one missing ingredient
        Map<Item, Option> swaps = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();
        for (Item item : attention) {
            item.stashOptions().stream()
                    .filter(o -> o.score() >= MIN_PLAN_B_SCORE && !used.contains(o.name()))
                    .findFirst()
                    .ifPresent(o -> {
                        swaps.put(item, o);
                        used.add(o.name());
                    });
        }
        List<Item> toBuy = attention.stream().filter(i -> !swaps.containsKey(i)).toList();

        if (swaps.isEmpty()) {
            document.add(new Paragraph("Nothing in your stash is a good enough stand-in for the missing ingredients, so plan B is the same as plan A.", italicFont));
            return;
        }

        document.add(new Paragraph("Use the closest match from your stash where there is a good one, and buy only the rest.", italicFont));
        PdfPTable swapTable = new PdfPTable(new float[]{4, 4, 2});
        swapTable.setWidthPercentage(100);
        swapTable.setSpacingBefore(6f);
        for (String header : List.of("Instead of", "Use from your stash", "Amount")) swapTable.addCell(headerCell(header));
        for (Map.Entry<Item, Option> swap : swaps.entrySet()) {
            Item item = swap.getKey();
            Option option = swap.getValue();
            swapTable.addCell(cell(item.name() + " (" + pct(item.percentage()) + ")", bodyFont, null));
            String warnings = option.warnings().isEmpty() ? "" : "\n! " + String.join("\n! ", option.warnings());
            swapTable.addCell(cell(option.name() + " - " + option.matchLabel().toLowerCase() + warnings, bodyFont, null));
            swapTable.addCell(cell(pct(option.percentage()) + " = " + grams(option.neededG()), boldFont, null));
        }
        document.add(swapTable);

        if (toBuy.isEmpty()) {
            Paragraph done = new Paragraph("Nothing left to buy with plan B.", boldFont);
            done.setSpacingBefore(6f);
            document.add(done);
            return;
        }

        Paragraph label = new Paragraph("Still to buy:", headerFont);
        label.setSpacingBefore(8f);
        document.add(label);
        PdfPTable table = checklistTable(new float[]{0.6f, 5, 1.6f, 4}, "Ingredient", "Buy", "If your shop doesn't carry it");
        for (Item item : toBuy) {
            table.addCell(PdfKit.checkbox());
            table.addCell(cell(item.name() + "\n" + item.inci(), bodyFont, null));
            table.addCell(cell(grams(item.buyG()), boldFont, null));
            table.addCell(cell(alternatives(item.marketOptions()), smallFont, null));
        }
        document.add(table);
    }

    private void addBeforeYouMakeIt(Document document) throws DocumentException {
        PdfKit.addCallout(document, PdfKit.Tone.INFO, "Before you make it", List.of(
                "Substitutes change the formula: rebalance to 100% and re-run the health check in the Studio.",
                "Never swap preservatives or UV filters without checking their spectrum, pH range and, for SPF, lab testing.",
                "Heat-sensitive substitutes belong in the cool-down phase (phase C).",
                "Make a small test batch first and watch it for separation, grain or colour change for a few weeks."));
    }

    // ---------- helpers ----------

    private String alternatives(List<Option> options) {
        if (options.isEmpty()) return "-";
        return options.stream().limit(3)
                .map(o -> o.name() + " (" + grams(o.buyG()) + ")")
                .collect(Collectors.joining("\nor "));
    }

    // "2. Substitution options" -> numbered section in the shared style
    private void addSection(Document document, String title) throws DocumentException {
        int dot = title.indexOf(". ");
        if (dot > 0) PdfKit.addSection(document, title.substring(0, dot), title.substring(dot + 2));
        else PdfKit.addSection(document, null, title);
    }

    private PdfPTable checklistTable(float[] widths, String... headers) {
        PdfPTable table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setSpacingBefore(6f);
        table.setHeaderRows(1);
        table.addCell(headerCell(""));
        for (String header : headers) table.addCell(headerCell(header));
        return table;
    }

    private PdfPCell headerCell(String text) {
        return PdfKit.th(text);
    }

    private PdfPCell cell(String text, Font font, Color background) {
        PdfPCell cell = PdfKit.td(text, font);
        if (background != null) cell.setBackgroundColor(background);
        return cell;
    }

    private Paragraph indented(String text, Font font, float indent) {
        Paragraph paragraph = new Paragraph(text, font);
        paragraph.setIndentationLeft(indent);
        return paragraph;
    }

    private String statusLabel(String status) {
        return switch (status) {
            case "missing" -> "Missing";
            case "low" -> "Not enough";
            case "assumed" -> "Assumed available";
            default -> "In stash";
        };
    }

    private static String grams(double g) {
        return PdfKit.g(g);
    }

    private static String pct(double p) {
        return PdfKit.pct(p);
    }
}
