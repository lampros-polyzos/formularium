package com.demiurgio.formularium.service;

import com.demiurgio.formularium.dto.ClaimViolation;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import com.demiurgio.formularium.rules.ValidationRule;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ValidationEngineService {

    private final List<ValidationRule> rules;
    private final ClaimValidationService claimValidationService;

    // Spring Boot automatically finds every class implementing ValidationRule 
    // and injects them into this list, along with our new claims service.
    public ValidationEngineService(List<ValidationRule> rules, ClaimValidationService claimValidationService) {
        this.rules = rules;
        this.claimValidationService = claimValidationService;
    }

    public ValidationResponse validate(ValidationRequest request) {
        ValidationResponse response = new ValidationResponse();
        
        // 1. Run all structural and chemical rules (Alerts & Recommendations)
        for (ValidationRule rule : rules) {
            rule.evaluate(request, response);
        }

        // 2. Run marketing claims validation
        List<ClaimViolation> violations = claimValidationService.validateClaims(
                request.ingredients(),
                request.targetClaims()
        );
        
        // 3. Attach violations to the response
        response.setClaimViolations(violations);

        return response;
    }
}