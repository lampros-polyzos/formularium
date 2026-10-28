package com.demiurgio.formularium.dto;

import java.util.ArrayList;
import java.util.List;

public class ValidationResponse {
    private List<Alert> alerts = new ArrayList<>();
    private List<Recommendation> recommendations = new ArrayList<>();
    private List<ClaimViolation> claimViolations = new ArrayList<>();

    public ValidationResponse() {}

    public void addAlert(String type, String message) {
        alerts.add(new Alert(type, message));
    }

    public void addRecommendation(String type, String title, String message, String action) {
        recommendations.add(new Recommendation(type, title, message, action));
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

    public record Alert(String type, String message) {}

    public record Recommendation(
        String type,
        String title,
        String message,
        String action
    ) {}
}