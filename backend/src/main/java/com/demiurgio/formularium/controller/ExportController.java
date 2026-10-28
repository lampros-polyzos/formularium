package com.demiurgio.formularium.controller;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.export.BatchTicketPdfGenerator;
import com.demiurgio.formularium.export.PifPdfGenerator;
import com.demiurgio.formularium.export.ShoppingListPdfGenerator;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/export")
@CrossOrigin(origins = "http://localhost:5173")
public class ExportController {

    private final PifPdfGenerator pifGenerator;
    private final BatchTicketPdfGenerator batchGenerator;
    private final ShoppingListPdfGenerator shoppingGenerator;

    public ExportController(PifPdfGenerator pifGenerator, BatchTicketPdfGenerator batchGenerator, ShoppingListPdfGenerator shoppingGenerator) {
        this.pifGenerator = pifGenerator;
        this.batchGenerator = batchGenerator;
        this.shoppingGenerator = shoppingGenerator;
    }

    @PostMapping("/pif")
    public ResponseEntity<byte[]> exportPif(@RequestBody ValidationRequest request) {
        return buildPdfResponse(pifGenerator.generate(request), "PIF_Export.pdf");
    }

    @PostMapping("/batch")
    public ResponseEntity<byte[]> exportBatchTicket(@RequestBody ValidationRequest request) {
        return buildPdfResponse(batchGenerator.generate(request), "Batch_Ticket.pdf");
    }

    @PostMapping("/shopping")
    public ResponseEntity<byte[]> exportShoppingList(@RequestBody ValidationRequest request) {
        return buildPdfResponse(shoppingGenerator.generate(request), "Shopping_List.pdf");
    }

    // Helper method to reduce boilerplate
    private ResponseEntity<byte[]> buildPdfResponse(byte[] pdfBytes, String filename) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("filename", filename);
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}