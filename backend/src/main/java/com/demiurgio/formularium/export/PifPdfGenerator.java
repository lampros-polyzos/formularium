package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.service.InciSortingService;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

@Component
public class PifPdfGenerator extends AbstractPdfGenerator {

    private final InciSortingService inciSorter;

    public PifPdfGenerator(InciSortingService inciSorter) {
        this.inciSorter = inciSorter;
    }

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        // 1. Add Compliant INCI List
        document.add(new Paragraph("Regulatory INCI Breakdown", headerFont));
        String inciString = inciSorter.generateInciString(request.ingredients());
        document.add(new Paragraph(inciString, bodyFont));
        document.add(new Paragraph(" "));

        // 2. Add Quantitative Formula Table
        document.add(new Paragraph("Quantitative Formula", headerFont));
        PdfPTable table = new PdfPTable(4); // 4 columns
        table.setWidthPercentage(100);
        table.setSpacingBefore(10f);

        table.addCell(new PdfPCell(new Paragraph("Phase", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("INCI Name", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Function", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("% W/W", headerFont)));

        for (FormulaIngredient item : request.ingredients()) {
            table.addCell(new Paragraph(item.phase(), bodyFont));
            table.addCell(new Paragraph(item.name(), bodyFont));
            table.addCell(new Paragraph(item.function(), bodyFont));
            table.addCell(new Paragraph(String.format("%.2f", item.percentage()), bodyFont));
        }

        document.add(table);
    }
}