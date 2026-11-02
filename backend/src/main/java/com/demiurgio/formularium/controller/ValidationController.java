package com.demiurgio.formularium.controller;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.service.ValidationEngineService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ValidationController {

    private final ValidationEngineService validationEngine;

    public ValidationController(ValidationEngineService validationEngine) {
        this.validationEngine = validationEngine;
    }

    @PostMapping("/validate")
    public ValidationResponse validateFormula(@RequestBody ValidationRequest request) {
        return validationEngine.validate(request);
    }
}