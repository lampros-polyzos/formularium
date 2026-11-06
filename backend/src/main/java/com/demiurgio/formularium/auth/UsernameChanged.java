package com.demiurgio.formularium.auth;

import java.util.UUID;

/** Published when a member changes their display name, so everything that shows the name can follow (posts, comments, ratings). */
public record UsernameChanged(UUID userId, String username) { }
