package com.demiurgio.formularium.library;

import com.demiurgio.formularium.auth.ApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The ingredients a person owns. Every query is limited to the signed-in person's own rows. */
@RestController
@RequestMapping("/api/v1/stash")
class StashController {
    private static final String COLUMNS = """
            s.id, s.user_id, s.ingredient_id, s.supplier_name, s.batch_lot_number, s.amount_left_g, s.price_per_g, s.expiration_date, s.notes, s.created_at,
            i.id as i_id, i.inci_name as i_inci_name, i.trade_name as i_trade_name, i.function as i_function""";

    private final JdbcClient jdbc;
    private final IngredientRepository ingredients;

    StashController(JdbcClient jdbc, IngredientRepository ingredients) {
        this.jdbc = jdbc;
        this.ingredients = ingredients;
    }

    /** Newest first, each with the few ingredient fields the screens show (under "ingredients", as the app expects). */
    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.sql("select " + COLUMNS + " from user_stash s left join ingredients i on i.id = s.ingredient_id where s.user_id = :uid order by s.created_at desc")
                .param("uid", IngredientController.user(jwt)).query(StashController::row).list();
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StashAndContainerRequests.Stash body) {
        UUID uid = IngredientController.user(jwt);
        requireUsable(uid, body.ingredientId());
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into user_stash (id, user_id, ingredient_id, supplier_name, batch_lot_number, amount_left_g, price_per_g, expiration_date, notes)
                values (:id, :uid, :ingredient, :supplier, :lot, :amount, :price, :expires, :notes)""")
                .param("id", id).param("uid", uid).param("ingredient", body.ingredientId()).param("supplier", body.supplierName()).param("lot", body.batchLotNumber())
                .param("amount", body.amountLeftG()).param("price", body.pricePerG() == null ? java.math.BigDecimal.ZERO : body.pricePerG())
                .param("expires", body.expirationDate() == null ? null : Date.valueOf(body.expirationDate())).param("notes", body.notes()).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(one(uid, id));
    }

    @PutMapping("/{id}")
    Map<String, Object> change(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody StashAndContainerRequests.Stash body) {
        UUID uid = IngredientController.user(jwt);
        requireUsable(uid, body.ingredientId());
        int updated = jdbc.sql("""
                update user_stash set ingredient_id = :ingredient, supplier_name = :supplier, batch_lot_number = :lot, amount_left_g = :amount,
                                     price_per_g = :price, expiration_date = :expires, notes = :notes
                where id = :id and user_id = :uid""")
                .param("id", id).param("uid", uid).param("ingredient", body.ingredientId()).param("supplier", body.supplierName()).param("lot", body.batchLotNumber())
                .param("amount", body.amountLeftG()).param("price", body.pricePerG() == null ? java.math.BigDecimal.ZERO : body.pricePerG())
                .param("expires", body.expirationDate() == null ? null : Date.valueOf(body.expirationDate())).param("notes", body.notes()).update();
        if (updated == 0) throw notFound();
        return one(uid, id);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        int deleted = jdbc.sql("delete from user_stash where id = :id and user_id = :uid").param("id", id).param("uid", IngredientController.user(jwt)).update();
        if (deleted == 0) throw notFound();
        return ResponseEntity.noContent().build();
    }

    private Map<String, Object> one(UUID uid, UUID id) {
        return jdbc.sql("select " + COLUMNS + " from user_stash s left join ingredients i on i.id = s.ingredient_id where s.id = :id and s.user_id = :uid")
                .param("id", id).param("uid", uid).query(StashController::row).single();
    }

    /** A stash lot can only be of an ingredient the person can see (the shared ones, or their own). */
    private void requireUsable(UUID uid, UUID ingredientId) {
        if (!ingredients.visibleTo(uid, ingredientId)) throw new ApiException(HttpStatus.BAD_REQUEST, "unknown_ingredient", "That ingredient is not in your library.");
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", "That item does not exist.");
    }

    private static Map<String, Object> row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Map<String, Object> all = Rows.map(rs, n);
        Map<String, Object> row = new LinkedHashMap<>();
        Map<String, Object> ingredient = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : all.entrySet()) {
            if (e.getKey().startsWith("i_")) ingredient.put(e.getKey().substring(2), e.getValue());
            else row.put(e.getKey(), e.getValue());
        }
        row.put("ingredients", ingredient.get("id") == null ? null : ingredient);
        return row;
    }
}
