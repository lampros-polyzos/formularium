package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.rules.ValidationRule;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ValidationEngineService {

    private final List<ValidationRule> rules;

    // Spring Boot automatically finds every class implementing ValidationRule 
    // and injects them into this list.
    public ValidationEngineService(List<ValidationRule> rules) {
        this.rules = rules;
    }

    public ValidationResponse validate(ValidationRequest request) {
        ValidationResponse response = new ValidationResponse();
        
        for (ValidationRule rule : rules) {
            rule.evaluate(request, response);
        }

        return response;
    }
}