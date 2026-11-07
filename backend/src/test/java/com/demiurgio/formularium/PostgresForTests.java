package com.demiurgio.formularium;

import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Every Spring test talks to one real PostgreSQL, started once for the whole test run in a Docker container (Docker must be running).
 * It is registered in {@code META-INF/spring.factories}, so no test class needs to know about it. The schema comes from
 * {@code schema.sql} and is created once, when the container starts; each test clears the tables it uses.
 * Testcontainers removes the container when the run ends.
 */
public class PostgresForTests implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    // The major version Supabase runs, so queries meet the same planner, types and error messages as production
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withDatabaseName("formularium")
            .withInitScript("schema.sql");

    static {
        POSTGRES.start();
    }

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        TestPropertyValues.of(
                "spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "spring.datasource.username=" + POSTGRES.getUsername(),
                "spring.datasource.password=" + POSTGRES.getPassword()
        ).applyTo(context);
    }
}
