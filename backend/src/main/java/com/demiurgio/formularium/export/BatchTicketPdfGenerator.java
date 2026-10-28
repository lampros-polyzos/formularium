package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

@Component
public class BatchTicketPdfGenerator extends AbstractPdfGenerator {

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        document.add(new Paragraph("Lab Batch Ticket", titleFont));
        document.add(new Paragraph("Project: " + request.projectName(), headerFont));
        document.add(new Paragraph("Target Scale: " + request.targetWeight() + "g | Formula Total: " + request.totalPercentage() + "%", bodyFont));
        document.add(new Paragraph(" "));

        PdfPTable table = new PdfPTable(new float[]{1, 4, 2, 2, 2});
        table.setWidthPercentage(100);
        
        table.addCell(new PdfPCell(new Paragraph("Phase", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("INCI Name", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Target %", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Target (g)", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Actual (g)", headerFont)));

        for (FormulaIngredient item : request.ingredients()) {
            double grams = (item.percentage() / 100.0) * request.targetWeight();
            
            table.addCell(new Paragraph(item.phase(), bodyFont));
            table.addCell(new Paragraph(item.name(), bodyFont));
            table.addCell(new Paragraph(String.format("%.2f%%", item.percentage()), bodyFont));
            table.addCell(new Paragraph(String.format("%.2f", grams), bodyFont));
            table.addCell(new Paragraph(" ", bodyFont)); // Blank for handwriting
        }

        document.add(table);
        
        document.add(new Paragraph(" "));
        document.add(new Paragraph("Formulator Sign-off: ___________________________   Date: _____________", bodyFont));
    }
}