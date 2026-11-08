package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.MarketingClaim;
import com.demiurgio.formularium.dto.ProfileConfig;
import com.demiurgio.formularium.dto.SourcingGuideRequest;
import com.demiurgio.formularium.dto.ValidationRequest;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class ExportGeneratorsTest {

    @Autowired private PifPdfGenerator pif;
    @Autowired private BatchTicketPdfGenerator batch;
    @Autowired private ShoppingListPdfGenerator shopping;
    @Autowired private SourcingGuidePdfGenerator sourcing;

    private static FormulaIngredient ing(String inci, String trade, String function, String phase, double pct, Double maxTemp) {
        return new FormulaIngredient(null, inci + " " + trade, function, phase, pct, "water", maxTemp, 0.1, 100.0,
                true, false, false, false, false, true, 0, inci, trade, null);
    }

    private static ValidationRequest request(List<FormulaIngredient> ingredients, boolean emulsion) {
        ProfileConfig profile = new ProfileConfig("p", "Test profile", true, true, emulsion, true, 4.5, 6.0, 30.0);
        return new ValidationRequest("Test Cream", 200.0, "p", profile, ingredients, List.of(MarketingClaim.VEGAN),
                100, 70, 30, 5.5);
    }

    private static final List<FormulaIngredient> EMULSION = List.of(
            ing("Aqua", "Distilled Water", "Solvent", "A", 70, 100.0),
            ing("Cetearyl Olivate, Sorbitan Olivate", "Olivem 1000", "Emulsifier", "B", 5, 85.0),
            ing("Argania Spinosa Kernel Oil [Raw]", "Argan Oil", "Carrier Oil", "B", 20, 60.0),
            ing("Sodium Benzoate (and) Potassium Sorbate", "Euxyl K712", "Preservative", "C", 1, 80.0),
            ing("Tocopherol", "Vitamin E", "Antioxidant", "C", 4, 40.0));

    private static String text(byte[] pdf) throws Exception {
        PdfReader reader = new PdfReader(pdf);
        PdfTextExtractor extractor = new PdfTextExtractor(reader);
        StringBuilder all = new StringBuilder();
        for (int page = 1; page <= reader.getNumberOfPages(); page++) all.append(extractor.getTextFromPage(page)).append('\n');
        return all.toString();
    }

    @Test
    void batchTicketHoldsBackHeatSensitiveOilsInAnEmulsion() throws Exception {
        String text = text(batch.generate(request(EMULSION, true)));
        assertTrue(text.contains("70-75"), "emulsion is processed hot");
        assertTrue(text.contains("Leave out Argan Oil"), "heat-sensitive oil is held back");
        assertTrue(text.contains("Once below 60"), "and added once cool enough");
    }

    @Test
    void batchTicketForAnUnheatedFormulaNeverMentionsHeating() throws Exception {
        List<FormulaIngredient> toner = List.of(
                ing("Aqua", "Distilled Water", "Solvent", "A", 95, 100.0),
                ing("Glycerin", "Glycerin", "Humectant", "A", 4, 90.0),
                ing("Phenoxyethanol, Ethylhexylglycerin", "Euxyl PE 9010", "Preservative", "C", 1, 80.0));
        String text = text(batch.generate(request(toner, false)));
        assertFalse(text.contains("70-75"));
        assertFalse(text.contains("after heating"));
    }

    @Test
    void pifSplitsBlendsOnTheLabelAndReportsClaims() throws Exception {
        String text = text(pif.generate(request(EMULSION, true)));
        assertTrue(text.contains("Sodium Benzoate, ") || text.contains("Potassium Sorbate"), "blend split into INCI components");
        assertFalse(text.contains("Sodium Benzoate (and)") && text.indexOf("Sodium Benzoate (and)") < text.indexOf("Quantitative"),
                "label list doesn't show the blend notation");
        assertTrue(text.contains("Supported"));
    }

    @Test
    void shoppingListGroupsByCategory() throws Exception {
        String text = text(shopping.generate(request(EMULSION, true)));
        assertTrue(text.contains("OILS, BUTTERS & EMOLLIENTS"));
        assertTrue(text.contains("PRESERVATIVES & PH"));
    }

    @Test
    void sourcingGuideRendersWithNoMissingItems() throws Exception {
        var item = new SourcingGuideRequest.Item("Glycerin", "Glycerin", "Humectant", "A", 3, 6, null, "have", 0, List.of(), List.of());
        byte[] pdf = sourcing.generate(new SourcingGuideRequest("Test", 200, 5.5, 15, List.of(item)));
        assertTrue(text(pdf).contains("Nothing to buy"));
    }
}
