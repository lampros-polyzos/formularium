package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import org.openpdf.text.Chunk;
import org.openpdf.text.Document;
import org.openpdf.text.DocumentException;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.BaseFont;
import org.openpdf.text.pdf.ColumnText;
import org.openpdf.text.pdf.PdfContentByte;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPCellEvent;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfPageEventHelper;
import org.openpdf.text.pdf.PdfTemplate;
import org.openpdf.text.pdf.PdfWriter;

import java.awt.Color;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/**
 * Shared look & helpers for every exported document, so they read as one family.
 * Colours mirror the Studio UI. Text sticks to the Latin-1 range Helvetica can render.
 */
public final class PdfKit {

    private PdfKit() {}

    // ---------- Palette ----------
    public static final Color BRAND = new Color(0x1F, 0x38, 0x2A);
    public static final Color BRAND_MID = new Color(0x2C, 0x4C, 0x3B);
    public static final Color BRAND_LIGHT = new Color(0xE9, 0xEE, 0xE7);
    public static final Color PAPER = new Color(0xF7, 0xF8, 0xF6);
    public static final Color BORDER = new Color(0xC1, 0xD1, 0xB9);
    public static final Color RULE = new Color(0xE2, 0xE6, 0xE0);
    public static final Color MUTED = new Color(0x6B, 0x72, 0x6E);
    public static final Color WARNING = new Color(0xB4, 0x53, 0x09);
    public static final Color WARNING_BG = new Color(0xFF, 0xF7, 0xE6);
    public static final Color ERROR = new Color(0xB9, 0x1C, 0x1C);
    public static final Color ERROR_BG = new Color(0xFE, 0xF2, 0xF2);
    public static final Color SUCCESS = new Color(0x15, 0x80, 0x3D);
    public static final Color SUCCESS_BG = new Color(0xF0, 0xFD, 0xF4);

    // Phase colours match the editor table headers
    public static final Color PHASE_A = new Color(0xCB, 0xD8, 0xD0);
    public static final Color PHASE_B = new Color(0xE6, 0xE1, 0xCD);
    public static final Color PHASE_C = new Color(0xBD, 0xCD, 0xBD);

    // ---------- Type ----------
    public static final Font TITLE = new Font(Font.HELVETICA, 20, Font.BOLD, Color.WHITE);
    public static final Font KICKER = new Font(Font.HELVETICA, 8, Font.BOLD, new Color(0xCB, 0xD8, 0xD0));
    public static final Font SUBTITLE = new Font(Font.HELVETICA, 9, Font.NORMAL, new Color(0xE9, 0xEE, 0xE7));
    public static final Font SECTION = new Font(Font.HELVETICA, 12, Font.BOLD, BRAND);
    public static final Font SECTION_NUMBER = new Font(Font.HELVETICA, 12, Font.BOLD, new Color(0x8F, 0xA8, 0x98));
    public static final Font LABEL = new Font(Font.HELVETICA, 7, Font.BOLD, MUTED);
    public static final Font VALUE = new Font(Font.HELVETICA, 10, Font.BOLD, BRAND);
    public static final Font TH = new Font(Font.HELVETICA, 8, Font.BOLD, BRAND);
    public static final Font BODY = new Font(Font.HELVETICA, 9, Font.NORMAL, Color.BLACK);
    public static final Font BODY_BOLD = new Font(Font.HELVETICA, 9, Font.BOLD, Color.BLACK);
    public static final Font SMALL = new Font(Font.HELVETICA, 7.5f, Font.NORMAL, MUTED);
    public static final Font SMALL_BOLD = new Font(Font.HELVETICA, 7.5f, Font.BOLD, MUTED);
    public static final Font ITALIC = new Font(Font.HELVETICA, 8, Font.ITALIC, MUTED);
    public static final Font WARNING_TEXT = new Font(Font.HELVETICA, 8, Font.NORMAL, WARNING);
    public static final Font PHASE_TITLE = new Font(Font.HELVETICA, 9, Font.BOLD, BRAND);

    // ---------- Document scaffolding ----------

    public static Document newDocument() {
        return new Document(org.openpdf.text.PageSize.A4, 40, 40, 36, 54);
    }

    // The writer of the document being built on this thread, so sections can check the space left on the page.
    // Set by addFooter, cleared when the document closes.
    private static final ThreadLocal<PdfWriter> CURRENT_WRITER = new ThreadLocal<>();
    private static final float MIN_SPACE_AFTER_HEADING = 110f;

    /** Registers the "brand | document | Page X of Y" footer. Call before document.open(). */
    public static void addFooter(PdfWriter writer, String documentName, String projectName) {
        writer.setPageEvent(new PageFooter(documentName, projectName));
        CURRENT_WRITER.set(writer);
    }

    /** Starts a new page when less than {@code points} of vertical space is left. */
    public static void ensureSpace(Document document, float points) {
        PdfWriter writer = CURRENT_WRITER.get();
        if (writer != null && writer.getVerticalPosition(true) - document.bottom() < points) {
            document.newPage();
        }
    }

    /** Dark title band with the document name, followed by a grid of key facts. */
    public static void addTitleBlock(Document document, String title, String subtitle, List<String[]> facts) throws DocumentException {
        PdfPTable band = new PdfPTable(1);
        band.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(BRAND);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setPadding(14f);
        cell.setPaddingBottom(16f);
        Paragraph kicker = new Paragraph("FORMULARIUM", KICKER);
        Paragraph heading = new Paragraph(title, TITLE);
        heading.setSpacingBefore(2f);
        cell.addElement(kicker);
        cell.addElement(heading);
        if (subtitle != null && !subtitle.isBlank()) {
            Paragraph sub = new Paragraph(subtitle, SUBTITLE);
            sub.setSpacingBefore(3f);
            cell.addElement(sub);
        }
        band.addCell(cell);
        document.add(band);

        if (facts != null && !facts.isEmpty()) {
            int columns = Math.min(facts.size(), 4);
            PdfPTable grid = new PdfPTable(columns);
            grid.setWidthPercentage(100);
            for (String[] fact : facts) {
                PdfPCell factCell = new PdfPCell();
                factCell.setBackgroundColor(BRAND_LIGHT);
                factCell.setBorderColor(Color.WHITE);
                factCell.setBorderWidth(1.5f);
                factCell.setPadding(7f);
                factCell.addElement(new Paragraph(fact[0].toUpperCase(Locale.ROOT), LABEL));
                factCell.addElement(new Paragraph(fact[1] == null || fact[1].isBlank() ? "-" : fact[1], VALUE));
                grid.addCell(factCell);
            }
            grid.completeRow();
            document.add(grid);
        }
    }

    public static void addSection(Document document, String number, String title) throws DocumentException {
        addSection(document, number, title, MIN_SPACE_AFTER_HEADING);
    }

    /** Section heading that never sits alone at the bottom of a page. */
    public static void addSection(Document document, String number, String title, float minSpaceBelow) throws DocumentException {
        ensureSpace(document, minSpaceBelow);
        Paragraph section = new Paragraph();
        section.setSpacingBefore(16f);
        section.setSpacingAfter(6f);
        if (number != null) section.add(new Chunk(number + "  ", SECTION_NUMBER));
        section.add(new Chunk(title, SECTION));
        section.setKeepTogether(true);
        document.add(section);
    }

    public static void addNote(Document document, String text) throws DocumentException {
        Paragraph note = new Paragraph(text, ITALIC);
        note.setSpacingAfter(4f);
        document.add(note);
    }

    public enum Tone { INFO, WARNING, ERROR, SUCCESS }

    /** A tinted box with a coloured left edge for tips, warnings and disclaimers. */
    public static void addCallout(Document document, Tone tone, String title, List<String> lines) throws DocumentException {
        Color edge = switch (tone) {
            case WARNING -> WARNING;
            case ERROR -> ERROR;
            case SUCCESS -> SUCCESS;
            default -> BRAND_MID;
        };
        Color fill = switch (tone) {
            case WARNING -> WARNING_BG;
            case ERROR -> ERROR_BG;
            case SUCCESS -> SUCCESS_BG;
            default -> PAPER;
        };

        PdfPTable box = new PdfPTable(new float[]{0.08f, 10});
        box.setWidthPercentage(100);
        box.setSpacingBefore(6f);
        box.setSpacingAfter(4f);
        box.setKeepTogether(true);
        PdfPCell bar = new PdfPCell();
        bar.setBackgroundColor(edge);
        bar.setBorder(Rectangle.NO_BORDER);
        box.addCell(bar);

        PdfPCell content = new PdfPCell();
        content.setBackgroundColor(fill);
        content.setBorder(Rectangle.NO_BORDER);
        content.setPadding(8f);
        if (title != null) content.addElement(new Paragraph(title, new Font(Font.HELVETICA, 9, Font.BOLD, edge)));
        for (String line : lines) {
            Paragraph p = new Paragraph(line, BODY);
            p.setSpacingBefore(2f);
            content.addElement(p);
        }
        box.addCell(content);
        document.add(box);
    }

    // ---------- Tables ----------

    public static PdfPTable table(float... widths) {
        PdfPTable table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setSpacingBefore(4f);
        table.setHeaderRows(1);
        return table;
    }

    public static PdfPCell th(String text) {
        return th(text, Element.ALIGN_LEFT);
    }

    public static PdfPCell th(String text, int align) {
        PdfPCell cell = new PdfPCell(new Phrase(text, TH));
        cell.setBackgroundColor(BRAND_LIGHT);
        cell.setBorderColor(BORDER);
        cell.setBorderWidth(0.5f);
        cell.setPadding(5f);
        cell.setHorizontalAlignment(align);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return cell;
    }

    public static PdfPCell td(String text) {
        return td(new Phrase(text == null ? "" : text, BODY), Element.ALIGN_LEFT);
    }

    public static PdfPCell td(String text, Font font) {
        return td(new Phrase(text == null ? "" : text, font), Element.ALIGN_LEFT);
    }

    public static PdfPCell tdRight(String text, Font font) {
        return td(new Phrase(text == null ? "" : text, font), Element.ALIGN_RIGHT);
    }

    public static PdfPCell td(Phrase phrase, int align) {
        PdfPCell cell = new PdfPCell(phrase);
        cell.setBorderColor(RULE);
        cell.setBorderWidth(0.5f);
        cell.setPadding(5f);
        cell.setHorizontalAlignment(align);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return cell;
    }

    /** Primary name on top, smaller secondary line underneath (e.g. trade name + INCI). */
    public static PdfPCell twoLine(String primary, String secondary) {
        Phrase phrase = new Phrase();
        phrase.add(new Chunk(primary, BODY_BOLD));
        if (secondary != null && !secondary.isBlank() && !secondary.equalsIgnoreCase(primary)) {
            phrase.add(Chunk.NEWLINE);
            phrase.add(new Chunk(secondary, SMALL));
        }
        PdfPCell cell = td(phrase, Element.ALIGN_LEFT);
        cell.setLeading(0f, 1.15f);
        return cell;
    }

    /** An empty cell with a drawn tick box, for checklists. */
    public static PdfPCell checkbox() {
        PdfPCell cell = td("");
        cell.setCellEvent(new CheckboxEvent());
        cell.setMinimumHeight(18f);
        return cell;
    }

    /** An empty cell with a light baseline, for handwriting. */
    public static PdfPCell writeIn() {
        PdfPCell cell = td("");
        cell.setMinimumHeight(18f);
        cell.setCellEvent(new WriteInEvent());
        return cell;
    }

    /** Full-width coloured phase heading row inside a table. */
    public static PdfPCell phaseHeader(String phase, String title, String detail, int colspan) {
        Phrase phrase = new Phrase();
        phrase.add(new Chunk(title, PHASE_TITLE));
        if (detail != null) phrase.add(new Chunk("   " + detail, SMALL_BOLD));
        PdfPCell cell = new PdfPCell(phrase);
        cell.setColspan(colspan);
        cell.setBackgroundColor(phaseColor(phase));
        cell.setBorderColor(BORDER);
        cell.setBorderWidth(0.5f);
        cell.setPadding(6f);
        return cell;
    }

    public static void zebra(PdfPCell cell, int rowIndex) {
        if (rowIndex % 2 == 1) cell.setBackgroundColor(PAPER);
    }

    // ---------- Formula helpers ----------

    public static Color phaseColor(String phase) {
        return switch (phase == null ? "" : phase) {
            case "A" -> PHASE_A;
            case "B" -> PHASE_B;
            case "C" -> PHASE_C;
            default -> BRAND_LIGHT;
        };
    }

    public static String phaseTitle(String phase) {
        return switch (phase == null ? "" : phase) {
            case "A" -> "PHASE A - Water phase";
            case "B" -> "PHASE B - Oil phase";
            case "C" -> "PHASE C - Cool-down phase";
            default -> "PHASE " + phase;
        };
    }

    /** The name people recognise on a jar: trade name, falling back to INCI. */
    public static String tradeName(FormulaIngredient ing) {
        if (ing.tradeName() != null && !ing.tradeName().isBlank()) return ing.tradeName();
        return inciName(ing);
    }

    /** The regulatory name. Older payloads only send a combined name, so fall back to that. */
    public static String inciName(FormulaIngredient ing) {
        if (ing.inciName() != null && !ing.inciName().isBlank()) return ing.inciName();
        return ing.name() == null ? "Unknown" : ing.name();
    }

    public static double grams(FormulaIngredient ing, double batchWeight) {
        return ing.percentage() / 100.0 * batchWeight;
    }

    // ---------- Number formatting (always dot decimals) ----------

    public static String g(double grams) {
        if (grams >= 100) return String.format(Locale.ROOT, "%.0f g", grams);
        if (grams >= 10) return String.format(Locale.ROOT, "%.1f g", grams);
        return String.format(Locale.ROOT, "%.2f g", grams);
    }

    public static String pct(double percentage) {
        return String.format(Locale.ROOT, "%.2f%%", percentage);
    }

    public static String num(double value) {
        return value == Math.rint(value) ? String.format(Locale.ROOT, "%.0f", value) : String.format(Locale.ROOT, "%.1f", value);
    }

    public static String today() {
        return LocalDate.now().format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH));
    }

    // ---------- Cell & page events ----------

    private static final class CheckboxEvent implements PdfPCellEvent {
        @Override
        public void cellLayout(PdfPCell cell, Rectangle position, PdfContentByte[] canvases) {
            PdfContentByte canvas = canvases[PdfPTable.LINECANVAS];
            float size = 9f;
            float x = position.getLeft() + (position.getWidth() - size) / 2f;
            float y = position.getBottom() + (position.getHeight() - size) / 2f;
            canvas.saveState();
            canvas.setColorStroke(BRAND_MID);
            canvas.setLineWidth(0.8f);
            canvas.rectangle(x, y, size, size);
            canvas.stroke();
            canvas.restoreState();
        }
    }

    private static final class WriteInEvent implements PdfPCellEvent {
        @Override
        public void cellLayout(PdfPCell cell, Rectangle position, PdfContentByte[] canvases) {
            PdfContentByte canvas = canvases[PdfPTable.LINECANVAS];
            canvas.saveState();
            canvas.setColorStroke(BORDER);
            canvas.setLineWidth(0.5f);
            canvas.setLineDash(1.5f, 1.5f);
            float y = position.getBottom() + 4f;
            canvas.moveTo(position.getLeft() + 5f, y);
            canvas.lineTo(position.getRight() - 5f, y);
            canvas.stroke();
            canvas.restoreState();
        }
    }

    private static final class PageFooter extends PdfPageEventHelper {
        private final String documentName;
        private final String projectName;
        private PdfTemplate totalPages;
        private BaseFont baseFont;

        PageFooter(String documentName, String projectName) {
            this.documentName = documentName;
            this.projectName = projectName;
        }

        @Override
        public void onOpenDocument(PdfWriter writer, Document document) {
            totalPages = writer.getDirectContent().createTemplate(30, 10);
            try {
                baseFont = BaseFont.createFont(BaseFont.HELVETICA, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED);
            } catch (Exception e) {
                throw new IllegalStateException("Helvetica unavailable", e);
            }
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte canvas = writer.getDirectContent();
            float y = document.bottom() - 22f;

            canvas.saveState();
            canvas.setColorStroke(RULE);
            canvas.setLineWidth(0.5f);
            canvas.moveTo(document.left(), y + 12f);
            canvas.lineTo(document.right(), y + 12f);
            canvas.stroke();
            canvas.restoreState();

            Font footerFont = new Font(Font.HELVETICA, 7.5f, Font.NORMAL, MUTED);
            String left = "Formularium  |  " + documentName + (projectName != null ? "  |  " + projectName : "");
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT, new Phrase(left, footerFont), document.left(), y, 0);

            String pageText = "Page " + writer.getPageNumber() + " of ";
            float textWidth = baseFont.getWidthPoint(pageText, 7.5f);
            float x = document.right() - textWidth - 12f;
            canvas.beginText();
            canvas.setFontAndSize(baseFont, 7.5f);
            canvas.setColorFill(MUTED);
            canvas.setTextMatrix(x, y);
            canvas.showText(pageText);
            canvas.endText();
            canvas.addTemplate(totalPages, x + textWidth, y);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            totalPages.beginText();
            totalPages.setFontAndSize(baseFont, 7.5f);
            totalPages.setColorFill(MUTED);
            totalPages.setTextMatrix(0, 0);
            totalPages.showText(String.valueOf(writer.getPageNumber() - 1)); // already advanced past the last page
            totalPages.endText();
            CURRENT_WRITER.remove();
        }
    }
}
