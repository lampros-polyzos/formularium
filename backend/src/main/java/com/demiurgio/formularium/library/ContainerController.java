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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The bottles and jars a person owns. Every query is limited to the signed-in person's own rows. */
@RestController
@RequestMapping("/api/v1/containers")
class ContainerController {
    private static final String COLUMNS = "id, user_id, name, container_type, material, volume_ml, quantity, price_per_unit, supplier_name, image_url, notes, created_at, low_stock_threshold";

    private final JdbcClient jdbc;

    ContainerController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return jdbc.sql("select " + COLUMNS + " from user_containers where user_id = :uid order by created_at desc").param("uid", IngredientController.user(jwt)).query(Rows::map).list();
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> add(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StashAndContainerRequests.Container body) {
        UUID uid = IngredientController.user(jwt);
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                insert into user_containers (id, user_id, name, container_type, material, volume_ml, quantity, price_per_unit, supplier_name, image_url, notes, low_stock_threshold)
                values (:id, :uid, :name, :type, :material, :volume, :quantity, :price, :supplier, :image, :notes, :low)""")
                .params(values(body)).param("id", id).param("uid", uid).update();
        return ResponseEntity.status(HttpStatus.CREATED).body(one(uid, id));
    }

    @PutMapping("/{id}")
    Map<String, Object> change(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody StashAndContainerRequests.Container body) {
        UUID uid = IngredientController.user(jwt);
        int updated = jdbc.sql("""
                update user_containers set name = :name, container_type = :type, material = :material, volume_ml = :volume, quantity = :quantity,
                                           price_per_unit = :price, supplier_name = :supplier, image_url = :image, notes = :notes, low_stock_threshold = :low
                where id = :id and user_id = :uid""")
                .params(values(body)).param("id", id).param("uid", uid).update();
        if (updated == 0) throw notFound();
        return one(uid, id);
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        int deleted = jdbc.sql("delete from user_containers where id = :id and user_id = :uid").param("id", id).param("uid", IngredientController.user(jwt)).update();
        if (deleted == 0) throw notFound();
        return ResponseEntity.noContent().build();
    }

    private Map<String, Object> one(UUID uid, UUID id) {
        return jdbc.sql("select " + COLUMNS + " from user_containers where id = :id and user_id = :uid").param("id", id).param("uid", uid).query(Rows::map).single();
    }

    private static Map<String, Object> values(StashAndContainerRequests.Container b) {
        java.util.HashMap<String, Object> m = new java.util.HashMap<>();
        m.put("name", b.name().trim());
        m.put("type", b.containerType().trim());
        m.put("material", b.material());
        m.put("volume", b.volumeMl());
        m.put("quantity", b.quantity() == null ? 0 : b.quantity());
        m.put("price", b.pricePerUnit() == null ? BigDecimal.ZERO : b.pricePerUnit());
        m.put("supplier", b.supplierName());
        m.put("image", b.imageUrl());
        m.put("notes", b.notes());
        m.put("low", b.lowStockThreshold() == null ? 0 : b.lowStockThreshold());
        return m;
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", "That item does not exist.");
    }
}
