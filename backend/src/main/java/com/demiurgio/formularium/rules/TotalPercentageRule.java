package com.demiurgio.formularium.rules;

import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse;
import org.springframework.stereotype.Component;

@Component
public class TotalPercentageRule implements ValidationRule {
    @Override
    public void evaluate(ValidationRequest request, ValidationResponse response) {
        if (Math.abs(request.totalPercentage() - 100.0) > 0.01) {
            response.addAlert("warning", String.format("Formula total is %.2f%%. It must equal exactly 100.00%%.", request.totalPercentage()));
        }
    }
}