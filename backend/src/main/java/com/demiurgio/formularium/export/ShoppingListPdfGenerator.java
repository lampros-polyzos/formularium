package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class ShoppingListPdfGenerator extends AbstractPdfGenerator {

    @Override
    protected void addBody(Document document, ValidationRequest request) throws DocumentException {
        document.add(new Paragraph("Material Sourcing List", titleFont));
        document.add(new Paragraph("Project: " + request.projectName() + " | Target Scale: " + request.targetWeight() + "g", headerFont));
        document.add(new Paragraph(" "));

        PdfPTable table = new PdfPTable(new float[]{1, 6, 3});
        table.setWidthPercentage(100);
        table.setSpacingBefore(10f);

        table.addCell(new PdfPCell(new Paragraph("[ ]", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Ingredient", headerFont)));
        table.addCell(new PdfPCell(new Paragraph("Target (g)", headerFont)));

        // Sort alphabetically for easy sourcing
        List<FormulaIngredient> sorted = new ArrayList<>(request.ingredients());
        sorted.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));

        for (FormulaIngredient item : sorted) {
            double grams = (item.percentage() / 100.0) * request.targetWeight();
            
            table.addCell(new Paragraph(" ", bodyFont)); // Empty checkbox cell
            table.addCell(new Paragraph(item.name() + " (" + item.function() + ")", bodyFont));
            table.addCell(new Paragraph(String.format("%.2fg", grams), bodyFont));
        }

        document.add(table);
        
        document.add(new Paragraph(" "));
        document.add(new Paragraph("Tip: Always procure 10-15% overage to account for beaker transfer loss.", new com.lowagie.text.Font(com.lowagie.text.Font.HELVETICA, 9, com.lowagie.text.Font.ITALIC)));
    }
}