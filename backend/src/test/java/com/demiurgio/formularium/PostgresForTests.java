package com.demiurgio.formularium;

import org.springframework.boot.test.util.TestPropertyValues;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

/**
 * Every Spring test talks to one real PostgreSQL, started once for the whole test run in a Docker container (Docker must be running).
 * It is registered in {@code META-INF/spring.factories}, so no test class needs to know about it.
 *
 * <p>The database is built from the project's own migrations in {@code supabase/migrations}, in file-name order: the same files that
 * create the production schema, the reference data (ingredients and product types) and every later change. There is no separate test
 * schema that could drift from production, and a new migration is picked up as soon as it is added. Each test clears the tables it uses.
 * Testcontainers removes the container when the run ends.
 */
public class PostgresForTests implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    // Run from the backend folder (what Maven does), so the migrations are one level up
    private static final Path MIGRATIONS = Path.of("..", "supabase", "migrations");

    // The major version Supabase runs, so queries meet the same planner, types and error messages as production
    private static final PostgreSQLContainer POSTGRES = start();

    @SuppressWarnings("resource")   // stopped by Testcontainers when the test run ends
    private static PostgreSQLContainer start() {
        PostgreSQLContainer container = new PostgreSQLContainer("postgres:17-alpine").withDatabaseName("formularium")
                .withCommand("postgres", "-c", "max_connections=300");   // headroom: each cached Spring test context holds a small pool of its own
        // The image runs the files in /docker-entrypoint-initdb.d in name order, once, when the database is first created
        List<Path> files = migrations();
        for (int i = 0; i < files.size(); i++) {
            container.withCopyFileToContainer(MountableFile.forHostPath(files.get(i)), String.format("/docker-entrypoint-initdb.d/%03d-%s", i, files.get(i).getFileName()));
        }
        container.start();
        return container;
    }

    private static List<Path> migrations() {
        try (Stream<Path> all = Files.list(MIGRATIONS)) {
            List<Path> files = all.filter(f -> f.getFileName().toString().endsWith(".sql")).sorted().toList();
            if (files.isEmpty()) throw new IllegalStateException("No migrations found in " + MIGRATIONS.toAbsolutePath() + ". Run the tests from the backend folder.");
            return files;
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the migrations in " + MIGRATIONS.toAbsolutePath(), e);
        }
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
