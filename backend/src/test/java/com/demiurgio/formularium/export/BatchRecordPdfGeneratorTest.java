package com.demiurgio.formularium.export;

import com.demiurgio.formularium.dto.BatchRecordRequest;
import com.demiurgio.formularium.dto.BatchRecordRequest.Check;
import com.demiurgio.formularium.dto.BatchRecordRequest.Container;
import com.demiurgio.formularium.dto.BatchRecordRequest.Cost;
import com.demiurgio.formularium.dto.BatchRecordRequest.Line;
import com.demiurgio.formularium.dto.BatchRecordRequest.StashLot;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BatchRecordPdfGeneratorTest {

    @Autowired private BatchRecordPdfGenerator generator;
    @Autowired private MockMvc mvc;

    private static String text(byte[] pdf) throws Exception {
        PdfReader reader = new PdfReader(pdf);
        PdfTextExtractor extractor = new PdfTextExtractor(reader);
        StringBuilder all = new StringBuilder();
        for (int page = 1; page <= reader.getNumberOfPages(); page++) all.append(extractor.getTextFromPage(page)).append('\n');
        return all.toString();
    }

    private static Line line(String name, String inci, String phase, double pct, double planned, double actual, Double cost, boolean estimated, StashLot... lots) {
        return new Line(name, inci, phase, pct, planned, actual, cost, estimated, List.of(lots));
    }

    private static final List<Line> LINES = List.of(
            line("Distilled Water", "Aqua", "A", 70, 140, 140, 0.14, false, new StashLot(140, "WATER-1")),
            line("Glycerin", "Glycerin", "A", 5, 10, 11, 0.30, true, new StashLot(6, "GLY-7"), new StashLot(5, "GLY-8")),
            line("Shea Butter", "Butyrospermum Parkii Butter", "B", 25, 50, 50, null, false));

    private static final List<Check> CHECKS = List.of(
            new Check("24 hours", "2026-11-09", "2026-11-09T09:30:00Z", "good", List.of(), 5.6, null),
            new Check("1 week", "2026-11-15", "2026-11-16T10:00:00Z", "minor", List.of("Texture changed (thinner or thicker)"), null, "Slightly runnier"),
            new Check("4 weeks", "2026-12-06", null, null, List.of(), null, null));

    private static BatchRecordRequest record(String status, List<Check> checks) {
        return new BatchRecordRequest("Day Cream", "261108-1", "2026-11-08", status, 200, 196.0, 98.0, 5.5, 5.6,
                "First test with the new shea.", true, "$",
                new Container("50 ml pump bottle", 50.0, 3.4),
                new Cost(0.74, 0.37, 0.4, 0.8, true, 1),
                LINES, checks);
    }

    @Test
    void recordsWhatWasMadeFromWhatAndWhatItCost() throws Exception {
        String text = text(generator.generate(record("active", CHECKS)));

        assertTrue(text.contains("Batch Quality Record"));
        assertTrue(text.contains("Day Cream"));
        assertTrue(text.contains("261108-1"));
        assertTrue(text.contains("8 Nov 2026"), "the date is written out");
        assertTrue(text.contains("200 g"), "batch size");
        assertTrue(text.contains("3.4 x 50 ml pump bottle (50 ml each)"), "the container and how many it fills");
        assertTrue(text.contains("measured 5.6, aimed for 5.5"), "pH");
        assertTrue(text.contains("196") && text.contains("98% of the planned"), "final weight and yield");
        assertTrue(text.contains("Used 151 g from 3 stash lots"), "stash usage: " + text);
    }

    @Test
    void listsEveryIngredientWithWhereItCameFromAndWhatItCost() throws Exception {
        String text = text(generator.generate(record("active", CHECKS)));

        for (String expected : List.of("Distilled Water", "Butyrospermum Parkii Butter", "WATER-1", "GLY-7", "GLY-8", "not tracked")) {
            assertTrue(text.contains(expected), "missing " + expected);
        }
        assertTrue(text.contains("$0.14"), "an exact cost");
        assertTrue(text.contains("~$0.30"), "an estimated cost is marked");
        assertTrue(text.contains("no price"), "an ingredient without a price says so");
        assertTrue(text.contains("$0.74"), "the total");
        assertTrue(text.contains("$0.37 per 100 g"));
        assertTrue(text.contains("$0.40") && text.contains("$0.80 container"), "cost per container includes the container");
        assertTrue(text.contains("1 ingredient has no price, so the real cost is higher"));
    }

    @Test
    void pointsOutAnAmountThatWasWeighedNoticeablyOffThePlan() throws Exception {
        String text = text(generator.generate(record("active", CHECKS)));
        assertTrue(text.contains("(+10%)"), "11 g weighed against 10 g planned");
        assertFalse(text.contains("(+0%)"));
    }

    @Test
    void listsEveryStabilityCheckWithWhatWasNoticed() throws Exception {
        String text = text(generator.generate(record("active", CHECKS)));
        assertTrue(text.contains("Looks good"));
        assertTrue(text.contains("Minor change"));
        assertTrue(text.contains("Texture changed"));
        assertTrue(text.contains("Slightly runnier"));
        assertTrue(text.contains("not yet"), "a check still to do");
        assertTrue(text.contains("9 Nov 2026") && text.contains("16 Nov 2026"), "a timestamp is shown as a day");
    }

    @Test
    void warnsPlainlyWhenTheBatchShouldNotBeUsed() throws Exception {
        List<Check> failed = List.of(new Check("1 week", "2026-11-15", "2026-11-16T10:00:00Z", "failed", List.of("Mold, spots or fuzz"), null, null));
        assertTrue(text(generator.generate(record("active", failed))).contains("A stability check failed"));
        assertTrue(text(generator.generate(record("discarded", CHECKS))).contains("This batch was discarded"));
        String undone = text(generator.generate(record("voided", CHECKS)));
        assertTrue(undone.contains("This batch was undone"));
        assertTrue(undone.contains("Undone (never made)"));
        assertFalse(text(generator.generate(record("active", CHECKS))).contains("should not be used"));
    }

    @Test
    void doesNotClaimStashWasUsedWhenItWasNot() throws Exception {
        BatchRecordRequest r = record("active", CHECKS);
        BatchRecordRequest noStash = new BatchRecordRequest(r.name(), r.lotNumber(), r.madeOn(), r.status(), r.batchSizeG(), r.finalWeightG(), r.yieldPct(),
                r.targetPh(), r.measuredPh(), r.notes(), false, r.currency(), r.container(), r.cost(), r.lines(), r.checks());
        assertTrue(text(generator.generate(noStash)).contains("Not changed by this batch"));
    }

    @Test
    void usesTheUsersCurrencyAndShowsSmallAmountsWithEnoughDigits() throws Exception {
        assertEquals("€0.046", BatchRecordPdfGenerator.money("€", 0.0456));
        assertEquals("£12.35", BatchRecordPdfGenerator.money("£", 12.345));
        assertEquals("$0.00", BatchRecordPdfGenerator.money("$", 0));
    }

    @Test
    void stillPrintsABatchWithNothingButTheBasics() throws Exception {
        BatchRecordRequest bare = new BatchRecordRequest(null, null, null, null, 100, null, null, null, null, null, false, null, null, null, null, null);
        String text = text(generator.generate(bare));
        assertTrue(text.contains("Untitled batch"));
        assertTrue(text.contains("No ingredients were recorded."));
        assertTrue(text.contains("No check-ins were planned for this batch."));
        assertTrue(text.contains("No notes were recorded."));
        assertTrue(text.contains("No ingredient prices were known when this batch was made."));
        assertTrue(text.contains("not measured yet"));
    }

    @Test
    void handlesAPageFullOfIngredientsAndChecks() throws Exception {
        List<Line> many = new java.util.ArrayList<>();
        for (int i = 0; i < 60; i++) many.add(line("Ingredient " + i, "INCI " + i, "ABC".substring(i % 3, i % 3 + 1), 1, 1, 1, 0.01, false, new StashLot(1, "LOT-" + i)));
        List<Check> checks = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) checks.add(new Check("Check " + i, "2026-12-01", null, null, List.of(), null, null));
        BatchRecordRequest r = record("active", checks);
        byte[] pdf = generator.generate(new BatchRecordRequest(r.name(), r.lotNumber(), r.madeOn(), r.status(), r.batchSizeG(), r.finalWeightG(), r.yieldPct(),
                r.targetPh(), r.measuredPh(), r.notes(), r.stashDeducted(), r.currency(), r.container(), r.cost(), many, checks));
        assertTrue(new PdfReader(pdf).getNumberOfPages() > 1, "a long record runs onto more pages");
        assertTrue(text(pdf).contains("Ingredient 59"));
    }

    @Test
    void theEndpointReturnsAPdf() throws Exception {
        String json = """
            {"name":"Day Cream","lotNumber":"261108-1","madeOn":"2026-11-08","status":"active","batchSizeG":100,
             "stashDeducted":false,"currency":"$",
             "cost":{"ingredientTotal":1.5,"per100g":1.5,"estimated":false,"unpricedCount":0},
             "lines":[{"name":"Glycerin","inciName":"Glycerin","phase":"A","percentage":100,"plannedG":100,"actualG":100,"cost":1.5,"costEstimated":false,"stashLots":[]}],
             "checks":[]}
            """;
        byte[] body = mvc.perform(post("/api/v1/export/batch-record").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();
        assertEquals("%PDF", new String(body, 0, 4, StandardCharsets.US_ASCII));
        assertTrue(text(body).contains("261108-1"));
    }

    @Test
    void theEndpointRejectsAMalformedRequest() throws Exception {
        mvc.perform(post("/api/v1/export/batch-record").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest());
    }
}
