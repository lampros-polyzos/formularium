# 0002. The Spring Boot backend owns validation and business rules

Status: Accepted

## Context
Formula validation existed in two places: a Supabase edge function and the Spring backend. Two implementations of the same rules drift apart, and "which one is right?" has no good answer.

## Decision
The Spring backend is the single source of truth. The edge function was retired. Validation runs server-side (`POST /api/v1/validate`) as a set of rule classes (total percentage, usage limits, pH compatibility, product-type constraints, interaction, preservation and stability checks). PDF documents are produced there too.

## Consequences
- **Good:** one implementation, unit-testable rule by rule, and safe to extend. A client cannot skip a check by not running it.
- **Cost:** the editor needs a network call for validation (it debounces and shows the last result while waiting). Small, pure calculations that need instant feedback (auto-balance, calculators, regional limits) stay in the frontend as tested TypeScript, so a few rules exist on both sides by design: the server is the authority, the client is for speed.
