package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;

public interface ValidationRule {
    /**
     * Evaluates a specific formulation rule and adds alerts to the response if violated.
     */
    void evaluate(ValidationRequest request, ValidationResponse response);
}