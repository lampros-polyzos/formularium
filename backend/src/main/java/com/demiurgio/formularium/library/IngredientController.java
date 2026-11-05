package com.demiurgio.formularium.library;

import com.demiurgio.formularium.auth.ApiException;
import jakarta.validation.Valid;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ingredients")
class IngredientController {
    private static final int DEFAULT_LIMIT = 100;

    private final IngredientRepository ingredients;

    IngredientController(IngredientRepository ingredients) { this.ingredients = ingredients; }

    static UUID user(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    /** The whole library as this person sees it: shared ingredients and their own. */
    @GetMapping
    List<Map<String, Object>> all(@AuthenticationPrincipal Jwt jwt) {
        return ingredients.all(user(jwt));
    }

    @PostMapping("/search")
    List<Map<String, Object>> search(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody IngredientRequests.Search body) {
        int limit = body.limit() == null ? DEFAULT_LIMIT : body.limit();
        return ingredients.search(user(jwt), body.anyOf(), body.ids(), limit, "trade_name".equals(body.orderBy()));
    }

    @PostMapping("/by-ids")
    List<Map<String, Object>> byIds(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody IngredientRequests.ByIds body) {
        return ingredients.byIds(user(jwt), body.ids());
    }

    @PostMapping
    ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody IngredientRequests.Create body) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(ingredients.insertCustom(user(jwt), body));
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "ingredient_exists", "An ingredient with this INCI name is already in the library.");
        }
    }

    // ---- starred (library page)

    @GetMapping("/starred")
    List<UUID> starred(@AuthenticationPrincipal Jwt jwt) {
        return ingredients.starredIds(user(jwt));
    }

    @PutMapping("/{id}/star")
    ResponseEntity<Void> star(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        requireVisible(jwt, id);
        ingredients.star(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/star")
    ResponseEntity<Void> unstar(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        ingredients.unstar(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    // ---- favourites (formula editor, metrics)

    @GetMapping("/favorites")
    List<Map<String, Object>> favorites(@AuthenticationPrincipal Jwt jwt) {
        return ingredients.favorites(user(jwt));
    }

    @PutMapping("/{id}/favorite")
    ResponseEntity<Void> addFavorite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        requireVisible(jwt, id);
        ingredients.addFavorite(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/favorite")
    ResponseEntity<Void> removeFavorite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        ingredients.removeFavorite(user(jwt), id);
        return ResponseEntity.noContent().build();
    }

    private void requireVisible(Jwt jwt, UUID ingredientId) {
        if (!ingredients.visibleTo(user(jwt), ingredientId)) throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "That ingredient does not exist.");
    }
}
