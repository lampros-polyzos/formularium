package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.pdf.PdfWriter;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Template for documents built from a formula: shared title block, footer and page setup. */
public abstract class AbstractPdfGenerator {

    public byte[] generate(ValidationRequest request) throws DocumentException {
        Document document = PdfKit.newDocument();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(document, out);
        PdfKit.addFooter(writer, documentName(), projectName(request));

        document.open();
        PdfKit.addTitleBlock(document, documentName(), documentPurpose(request), titleFacts(request));
        addBody(document, request);
        document.close();

        return out.toByteArray();
    }

    /** Shown in the title band and the footer. */
    protected abstract String documentName();

    /** One line under the title saying what the document is for. */
    protected abstract String documentPurpose(ValidationRequest request);

    /** Label/value pairs for the grid under the title. */
    protected List<String[]> titleFacts(ValidationRequest request) {
        List<String[]> facts = new ArrayList<>();
        facts.add(new String[]{"Product", projectName(request)});
        facts.add(new String[]{"Product type", profileName(request)});
        facts.add(new String[]{"Batch size", PdfKit.g(batchWeight(request))});
        facts.add(new String[]{"Date", PdfKit.today()});
        return facts;
    }

    protected abstract void addBody(Document document, ValidationRequest request) throws DocumentException;

    // ---------- helpers for subclasses ----------

    protected static String projectName(ValidationRequest request) {
        return request.projectName() == null || request.projectName().isBlank() ? "Untitled project" : request.projectName();
    }

    protected static String profileName(ValidationRequest request) {
        return request.profile() != null && request.profile().name() != null ? request.profile().name() : "Not set";
    }

    protected static double batchWeight(ValidationRequest request) {
        return request.targetWeight() != null && request.targetWeight() > 0 ? request.targetWeight() : 100;
    }

    protected static List<FormulaIngredient> ingredients(ValidationRequest request) {
        return request.ingredients() == null ? List.of() : request.ingredients().stream().filter(Objects::nonNull).toList();
    }

    protected static List<FormulaIngredient> phase(ValidationRequest request, String phase) {
        return ingredients(request).stream().filter(i -> phase.equals(i.phase())).toList();
    }

    protected static double totalPercentage(List<FormulaIngredient> items) {
        return items.stream().mapToDouble(FormulaIngredient::percentage).sum();
    }

    protected static String phRange(ValidationRequest request) {
        if (request.profile() == null || request.profile().defaultPhMin() == null || request.profile().defaultPhMax() == null) return null;
        return PdfKit.num(request.profile().defaultPhMin()) + "-" + PdfKit.num(request.profile().defaultPhMax());
    }
}
