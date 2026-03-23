package com.leavera.pedidosmg.work;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

/**
 * Conexión JDBC mínima a Neon (URL igual que usa el SDK serverless en la WebView).
 */
public final class NeonJdbc {

    static {
        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("Driver PostgreSQL no encontrado", e);
        }
    }

    private NeonJdbc() {}

    public static Connection open(String connectionString) throws SQLException {
        String url = connectionString.trim();
        if (url.startsWith("postgresql://")) {
            url = "jdbc:postgresql://" + url.substring("postgresql://".length());
        } else if (!url.startsWith("jdbc:postgresql://")) {
            url = "jdbc:postgresql://" + url;
        }
        Properties p = new Properties();
        p.setProperty("sslmode", "require");
        p.setProperty("connectTimeout", "20");
        p.setProperty("socketTimeout", "25");
        return DriverManager.getConnection(url, p);
    }

    public static long queryMaxPedidoId(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COALESCE(MAX(id), 0) FROM pedidos")) {
            if (rs.next()) return rs.getLong(1);
        }
        return -1L;
    }

    public static int countPedidosNewerThan(Connection c, long lastId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT COUNT(*)::int FROM pedidos WHERE id > ?")) {
            ps.setLong(1, lastId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        }
        return 0;
    }

    /** Último número de pedido para el texto de la notificación (opcional). */
    public static String queryNumeroPedido(Connection c, long id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT numero_pedido FROM pedidos WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getString(1);
            }
        }
        return null;
    }
}
