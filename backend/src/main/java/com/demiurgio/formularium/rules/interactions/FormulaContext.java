package com.demiurgio.formularium.rules.interactions;

import com.demiurgio.formularium.dto.Fix;
import com.demiurgio.formularium.dto.FormulaIngredient;
import com.demiurgio.formularium.dto.ValidationRequest;
import com.demiurgio.formularium.dto.ValidationResponse.Recommendation;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

/** The formula as the interaction checks see it: tagged ingredients, facts, and collected findings. */
public final class FormulaContext {

    public record Item(FormulaIngredient ingredient, Set<Tag> tags) {}

    private static final List<String> TYPE_ORDER = List.of("conflict", "synergy", "tip");

    private final ValidationRequest request;
    private final List<Item> items;
    private final Map<String, Recommendation> findings = new LinkedHashMap<>();

    public FormulaContext(ValidationRequest request) {
        this.request = request;
        this.items = (request.ingredients() == null ? List.<FormulaIngredient>of() : request.ingredients()).stream()
                .filter(Objects::nonNull)
                .filter(i -> i.percentage() > 0)
                .map(i -> new Item(i, IngredientClassifier.classify(i)))
                .toList();
    }

    // ---------- Questions about the formula ----------

    public List<Item> items() {
        return items;
    }

    public boolean has(Tag tag) {
        return items.stream().anyMatch(i -> i.tags().contains(tag));
    }

    public boolean hasAny(Tag... tags) {
        return Stream.of(tags).anyMatch(this::has);
    }

    public List<FormulaIngredient> with(Tag... tags) {
        return items.stream()
                .filter(i -> Stream.of(tags).anyMatch(i.tags()::contains))
                .map(Item::ingredient)
                .toList();
    }

    public double percent(Tag... tags) {
        return with(tags).stream().mapToDouble(FormulaIngredient::percentage).sum();
    }

    /** "A", "A and B", "A, B and C" using readable names. */
    public String names(Tag... tags) {
        return list(with(tags));
    }

    public static String list(Collection<FormulaIngredient> ingredients) {
        List<String> names = ingredients.stream().map(FormulaIngredient::displayName).distinct().toList();
        if (names.size() <= 1) return names.isEmpty() ? "" : names.get(0);
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    public Double targetPh() {
        return request.targetPh();
    }

    public boolean phBelow(double value) {
        return targetPh() != null && targetPh() < value;
    }

    public boolean phAbove(double value) {
        return targetPh() != null && targetPh() > value;
    }

    public boolean hasWater() {
        return has(Tag.WATER);
    }

    /** Wash-off products (shampoos, body washes, cleansers) are on the skin briefly. */
    public boolean leaveOn() {
        if (request.profile() == null) return true;
        String id = lower(request.profile().id());
        String name = lower(request.profile().name());
        return !(id.equals("shampoo") || id.equals("body_wash")
                || name.contains("wash") || name.contains("shampoo") || name.contains("cleanser"));
    }

    public boolean profileRequiresPreservative() {
        return request.profile() != null && request.profile().requiresPreservative();
    }

    // ---------- Findings ----------

    public void conflict(String title, String message, String action) {
        add("conflict", title, message, action, null);
    }

    public void conflict(String title, String message, String action, Fix fix) {
        add("conflict", title, message, action, fix);
    }

    public void synergy(String title, String message, String action) {
        add("synergy", title, message, action, null);
    }

    public void tip(String title, String message, String action) {
        add("tip", title, message, action, null);
    }

    public void tip(String title, String message, String action, Fix fix) {
        add("tip", title, message, action, fix);
    }

    private void add(String type, String title, String message, String action, Fix fix) {
        findings.putIfAbsent(title, new Recommendation(type, title, message, action, fix));
    }

    /** Conflicts first, then synergies, then tips, each in the order they were found. */
    public List<Recommendation> results() {
        List<Recommendation> all = new ArrayList<>(findings.values());
        all.sort(Comparator.comparingInt(r -> TYPE_ORDER.indexOf(r.type())));
        return all;
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }
}
