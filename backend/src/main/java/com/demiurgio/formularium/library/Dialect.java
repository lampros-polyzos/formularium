package com.demiurgio.formularium.library;

import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * The few places where PostgreSQL needs an explicit type: a JSON column is written from text with a cast. The tests run on H2, which keeps such a
 * column as plain text, so there the value goes in as it is.
 */
@Component
public class Dialect {
    private final boolean postgres;

    Dialect(DataSource dataSource) {
        boolean pg;
        try (Connection c = dataSource.getConnection()) {
            pg = c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        } catch (SQLException e) {
            pg = true;   // the real database is PostgreSQL: if it cannot even be asked, the first query will say what is wrong
        }
        this.postgres = pg;
    }

    /** The SQL for writing a named text parameter into a jsonb column. */
    public String jsonb(String parameter) {
        return postgres ? "cast(:" + parameter + " as jsonb)" : ":" + parameter;
    }
}
