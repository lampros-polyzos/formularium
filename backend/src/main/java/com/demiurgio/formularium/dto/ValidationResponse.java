package com.demiurgio.formularium.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

public class ValidationResponse {
    private List<Alert> alerts = new ArrayList<>();
    private List<Recommendation> recommendations = new ArrayList<>();
    private List<ClaimViolation> claimViolations = new ArrayList<>();

    public ValidationResponse() {}

    public void addAlert(String type, String message) {
        alerts.add(new Alert(type, message, null));
    }

    /** {@code fix} may be null when there is no one-click remedy. */
    public void addAlert(String type, String message, Fix fix) {
        alerts.add(new Alert(type, message, fix));
    }

    public void addRecommendation(String type, String title, String message, String action) {
        recommendations.add(new Recommendation(type, title, message, action, null));
    }

    public void addRecommendation(String type, String title, String message, String action, Fix fix) {
        recommendations.add(new Recommendation(type, title, message, action, fix));
    }

    // Helper method to add a single violation
    public void addClaimViolation(ClaimViolation violation) {
        this.claimViolations.add(violation);
    }

    public List<Alert> getAlerts() {
        return alerts;
    }

    public void setAlerts(List<Alert> alerts) {
        this.alerts = alerts;
    }

    public List<Recommendation> getRecommendations() {
        return recommendations;
    }

    public void setRecommendations(List<Recommendation> recommendations) {
        this.recommendations = recommendations;
    }

    public List<ClaimViolation> getClaimViolations() {
        return claimViolations;
    }

    public void setClaimViolations(List<ClaimViolation> claimViolations) {
        this.claimViolations = claimViolations;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Alert(String type, String message, Fix fix) {
        public Alert(String type, String message) {
            this(type, message, null);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Recommendation(
        String type,
        String title,
        String message,
        String action,
        Fix fix
    ) {
        public Recommendation(String type, String title, String message, String action) {
            this(type, title, message, action, null);
        }
    }
}