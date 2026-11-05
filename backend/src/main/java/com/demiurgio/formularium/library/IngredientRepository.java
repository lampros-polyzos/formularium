package com.demiurgio.formularium.library;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The ingredient library. Everyone sees the shared ingredients (no owner) and their own custom ones, and nobody else's:
 * every query below carries that rule.
 */
@Repository
class IngredientRepository {
    // The three enum columns are read as text so they come out as plain strings in the JSON
    private static final String COLUMNS = """
            i.id, i.inci_name, i.trade_name, i.function, i.min_usage_pct, i.max_usage_pct, i.cas_number,
            cast(i.solubility as varchar) as solubility, cast(i.ionic_charge as varchar) as ionic_charge, cast(i.physical_state as varchar) as physical_state,
            i.optimal_ph_min, i.optimal_ph_max, i.max_heating_temp_c, i.is_vegan, i.is_cosmos, cast(i.cost_category as varchar) as cost_category,
            i.description, i.common_uses, i.is_sulfate, i.is_silicone, i.is_paraben, i.is_fragrance, i.cosmos_compliant, i.comedogenic_rating,
            i.user_id, i.default_min_usage, i.default_max_usage, i.notes""";
    private static final String VISIBLE = "(i.user_id is null or i.user_id = :uid)";

    private final JdbcClient jdbc;

    IngredientRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    List<Map<String, Object>> all(UUID uid) {
        return jdbc.sql("select " + COLUMNS + " from ingredients i where " + VISIBLE + " order by i.trade_name").param("uid", uid).query(Rows::map).list();
    }

    List<Map<String, Object>> byIds(UUID uid, List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("select " + COLUMNS + " from ingredients i where " + VISIBLE + " and i.id in (:ids) order by i.trade_name").param("uid", uid).param("ids", ids).query(Rows::map).list();
    }

    /** Rows matching any filter (and, when `ids` is given, only those ids). The column names come from a fixed list, never from the request text. */
    List<Map<String, Object>> search(UUID uid, List<IngredientRequests.Filter> anyOf, List<UUID> ids, int limit, boolean orderByTradeName) {
        boolean hasFilters = anyOf != null && !anyOf.isEmpty();
        boolean hasIds = ids != null && !ids.isEmpty();
        if (!hasFilters && !hasIds) return List.of();

        StringBuilder sql = new StringBuilder("select " + COLUMNS + " from ingredients i where " + VISIBLE);
        List<String> names = new ArrayList<>();
        List<Object> values = new ArrayList<>();
        if (hasFilters) {
            List<String> conditions = new ArrayList<>();
            for (IngredientRequests.Filter f : anyOf) {
                String name = "p" + names.size();
                String column = switch (f.column()) {
                    case "function" -> "i.function";
                    case "inci_name" -> "i.inci_name";
                    default -> "i.trade_name";
                };
                conditions.add("ilike".equals(f.op()) ? "lower(" + column + ") like lower(:" + name + ")" : column + " = :" + name);
                names.add(name);
                values.add(f.value());
            }
            sql.append(" and (").append(String.join(" or ", conditions)).append(")");
        }
        if (hasIds) sql.append(" and i.id in (:ids)");
        if (orderByTradeName) sql.append(" order by i.trade_name");
        sql.append(" limit ").append(limit);

        JdbcClient.StatementSpec spec = jdbc.sql(sql.toString()).param("uid", uid);
        for (int i = 0; i < names.size(); i++) spec = spec.param(names.get(i), values.get(i));
        if (hasIds) spec = spec.param("ids", ids);
        return spec.query(Rows::map).list();
    }

    boolean visibleTo(UUID uid, UUID ingredientId) {
        return jdbc.sql("select count(*) from ingredients i where i.id = :id and " + VISIBLE).param("id", ingredientId).param("uid", uid).query(Long.class).single() > 0;
    }

    /** @throws org.springframework.dao.DuplicateKeyException when the INCI name is already in the library */
    Map<String, Object> insertCustom(UUID uid, IngredientRequests.Create c) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into ingredients (id, user_id, trade_name, inci_name, function, solubility, default_min_usage, default_max_usage, notes,
                                         is_vegan, is_cosmos, is_sulfate, is_silicone, is_paraben, is_fragrance)
                values (:id, :uid, :trade, :inci, :function, cast(:solubility as solubility_type), :min, :max, :notes, :vegan, :cosmos, :sulfate, :silicone, :paraben, :fragrance)""")
                .param("id", id).param("uid", uid).param("trade", c.tradeName().trim()).param("inci", c.inciName().trim())
                .param("function", c.function()).param("solubility", c.solubility() == null ? "water" : c.solubility().toLowerCase(Locale.ROOT))
                .param("min", c.defaultMinUsage()).param("max", c.defaultMaxUsage()).param("notes", c.notes())
                .param("vegan", Boolean.TRUE.equals(c.isVegan())).param("cosmos", Boolean.TRUE.equals(c.isCosmos())).param("sulfate", Boolean.TRUE.equals(c.isSulfate()))
                .param("silicone", Boolean.TRUE.equals(c.isSilicone())).param("paraben", Boolean.TRUE.equals(c.isParaben())).param("fragrance", Boolean.TRUE.equals(c.isFragrance()))
                .update();
        return jdbc.sql("select " + COLUMNS + " from ingredients i where i.id = :id").param("id", id).query(Rows::map).single();
    }

    // ---- starred ingredients (the library page) and favourite ingredients (the formula editor and metrics)

    List<UUID> starredIds(UUID uid) {
        return jdbc.sql("select ingredient_id from user_starred_ingredients where user_id = :uid").param("uid", uid).query((rs, n) -> rs.getObject(1, UUID.class)).list();
    }

    boolean star(UUID uid, UUID ingredientId) {
        return insertLink("user_starred_ingredients", uid, ingredientId);
    }

    void unstar(UUID uid, UUID ingredientId) {
        jdbc.sql("delete from user_starred_ingredients where user_id = :uid and ingredient_id = :id").param("uid", uid).param("id", ingredientId).update();
    }

    List<Map<String, Object>> favorites(UUID uid) {
        return jdbc.sql("select " + COLUMNS + " from favorite_ingredients f join ingredients i on i.id = f.ingredient_id where f.user_id = :uid and " + VISIBLE + " order by i.trade_name")
                .param("uid", uid).query(Rows::map).list();
    }

    boolean addFavorite(UUID uid, UUID ingredientId) {
        return insertLink("favorite_ingredients", uid, ingredientId);
    }

    void removeFavorite(UUID uid, UUID ingredientId) {
        jdbc.sql("delete from favorite_ingredients where user_id = :uid and ingredient_id = :id").param("uid", uid).param("id", ingredientId).update();
    }

    /** Adds the link unless it is already there. The table name is one of two fixed names, never request text. */
    private boolean insertLink(String table, UUID uid, UUID ingredientId) {
        long existing = jdbc.sql("select count(*) from " + table + " where user_id = :uid and ingredient_id = :id").param("uid", uid).param("id", ingredientId).query(Long.class).single();
        if (existing > 0) return false;
        try {
            jdbc.sql("insert into " + table + " (id, user_id, ingredient_id) values (:link, :uid, :id)").param("link", UUID.randomUUID()).param("uid", uid).param("id", ingredientId).update();
            return true;
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return false;   // added a moment ago by another request
        }
    }
}
