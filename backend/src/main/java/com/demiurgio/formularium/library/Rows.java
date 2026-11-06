package com.demiurgio.formularium.library;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Turns a database row into a map that becomes a JSON object with the column names as keys (snake_case, as the app already uses them).
 * Dates and timestamps become ISO text, so the JSON does not depend on how the database driver represents them.
 */
public final class Rows {
    private Rows() { }

    public static Map<String, Object> map(ResultSet rs, int rowNum) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            row.put(meta.getColumnLabel(i).toLowerCase(), convert(rs.getObject(i)));
        }
        return row;
    }

    private static Object convert(Object value) {
        if (value instanceof Timestamp t) return t.toInstant().toString();
        if (value instanceof Date d) return d.toLocalDate().toString();
        if (value instanceof java.time.OffsetDateTime o) return o.toInstant().toString();
        if (value instanceof java.sql.Array a) {
            // A text[] column becomes a plain list
            try {
                return java.util.Arrays.asList((Object[]) a.getArray());
            } catch (SQLException e) {
                return java.util.List.of();
            }
        }
        return value;
    }
}
