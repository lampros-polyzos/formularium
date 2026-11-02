package com.demiurgio.formularium.dto;

import java.util.List;

// Stash check + substitution suggestions, computed in the frontend and rendered here
public record SourcingGuideRequest(
    String projectName,
    double targetWeight,
    Double targetPh,
    double overagePercent,
    List<Item> items
) {
    public record Item(
        String name,
        String inci,
        String function,
        String phase,
        double percentage,
        double neededG,
        Double haveG,   // null when not in stash or amount untracked
        String status,  // have | low | missing | assumed
        double buyG,
        List<Option> stashOptions,
        List<Option> marketOptions
    ) {
        public boolean needsAttention() {
            return "missing".equals(status) || "low".equals(status);
        }
    }

    public record Option(
        String name,
        String inci,
        String matchLabel,
        int score,
        double percentage,
        double neededG,
        double buyG,
        String costCategory,
        List<String> notes,
        List<String> warnings
    ) {}
}
