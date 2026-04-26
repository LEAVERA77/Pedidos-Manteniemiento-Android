package com.gestornova.gestion.work;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
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
        String url = sanitizeNeonJdbcUrl(normalizeJdbcUrl(connectionString));
        Properties p = buildConnectProps(url);
        org.postgresql.Driver driver = new org.postgresql.Driver();

        Connection c = driver.connect(url, p);
        if (c != null) return c;

        // Sin duplicar sslmode en Properties si la URL ya lo trae (evita que connect() devuelva null en algunos runtimes).
        Properties minimal = new Properties();
        minimal.setProperty("connectTimeout", "20");
        minimal.setProperty("socketTimeout", "25");
        c = driver.connect(url, minimal);
        if (c != null) return c;

        try {
            DriverManager.registerDriver(driver);
        } catch (SQLException ignored) {
            // ya registrado
        }
        SQLException last = null;
        try {
            c = DriverManager.getConnection(url, p);
            if (c != null) return c;
        } catch (SQLException e) {
            last = e;
        }
        try {
            c = DriverManager.getConnection(url, minimal);
            if (c != null) return c;
        } catch (SQLException e) {
            last = e;
        }

        throw new SQLException(
                "PostgreSQL: no se pudo conectar (WorkManager / JDBC). "
                        + "Revisá config.json: sslmode=require; sin channel_binding para la app Android.",
                last);
    }

    /** Neon suele añadir channel_binding=require; pgjdbc 42.2 en Android suele hacer que {@code Driver#connect} devuelva null. */
    private static String sanitizeNeonJdbcUrl(String url) {
        if (url == null) return null;
        if (!url.isEmpty() && url.charAt(0) == '\uFEFF') {
            url = url.substring(1);
        }
        String u = url.trim();
        u = u.replace("&channel_binding=require", "");
        u = u.replace("?channel_binding=require&", "?");
        u = u.replace("?channel_binding=require", "");
        u = u.replace("&channel_binding=prefer", "");
        u = u.replace("?channel_binding=prefer&", "?");
        u = u.replace("?channel_binding=prefer", "");
        u = u.replace("?&", "?");
        while (u.contains("&&")) {
            u = u.replace("&&", "&");
        }
        while (u.endsWith("?") || u.endsWith("&")) {
            u = u.substring(0, u.length() - 1);
        }
        return u;
    }

    private static Properties buildConnectProps(String jdbcUrl) {
        Properties p = new Properties();
        if (!jdbcUrl.contains("sslmode=")) {
            p.setProperty("sslmode", "require");
        }
        p.setProperty("connectTimeout", "20");
        p.setProperty("socketTimeout", "25");
        return p;
    }

    private static String normalizeJdbcUrl(String connectionString) {
        String url = connectionString.trim();
        if (url.startsWith("postgresql://")) {
            url = "jdbc:postgresql://" + url.substring("postgresql://".length());
        } else if (!url.startsWith("jdbc:postgresql://")) {
            url = "jdbc:postgresql://" + url;
        }
        return url;
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

    /** Registro de posición para el mapa de gerencia (misma tabla que usa la web). */
    /** Fila no leída de {@code notificaciones_movil} (cola admin → app). */
    public static final class NotificacionMovilRow {
        public final long id;
        public final String titulo;
        public final String cuerpo;
        /** {@code null} si {@code pedido_id} es NULL en la base. */
        public final String pedidoId;

        public NotificacionMovilRow(long id, String titulo, String cuerpo, String pedidoId) {
            this.id = id;
            this.titulo = titulo != null ? titulo : "";
            this.cuerpo = cuerpo != null ? cuerpo : "";
            this.pedidoId = pedidoId;
        }
    }

    public static boolean hasNotificacionesMovilTable(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' "
                             + "AND table_name = 'notificaciones_movil' LIMIT 1")) {
            return rs.next();
        }
    }

    public static List<NotificacionMovilRow> fetchUnreadNotificacionesMovil(Connection c, int userId, int limit)
            throws SQLException {
        int lim = limit;
        if (lim < 1) lim = 15;
        if (lim > 50) lim = 50;
        List<NotificacionMovilRow> out = new ArrayList<>();
        String sql = "SELECT id, titulo, cuerpo, pedido_id FROM notificaciones_movil "
                + "WHERE usuario_id = ? AND leida = FALSE ORDER BY id ASC LIMIT ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, userId);
            ps.setInt(2, lim);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    long id = rs.getLong(1);
                    String titulo = rs.getString(2);
                    String cuerpo = rs.getString(3);
                    int pid = rs.getInt(4);
                    boolean pidNull = rs.wasNull();
                    String pedidoId = pidNull ? null : String.valueOf(pid);
                    out.add(new NotificacionMovilRow(id, titulo, cuerpo, pedidoId));
                }
            }
        }
        return out;
    }

    public static void markNotificacionMovilLeida(Connection c, long rowId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "UPDATE notificaciones_movil SET leida = TRUE WHERE id = ?")) {
            ps.setLong(1, rowId);
            ps.executeUpdate();
        }
    }

    public static void insertUbicacionUsuario(Connection c, int userId, double lat, double lng, int precisionM)
            throws SQLException {
        String ins = "INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp) VALUES (?,?,?,?, NOW())";
        try (PreparedStatement ps = c.prepareStatement(ins)) {
            ps.setInt(1, userId);
            ps.setDouble(2, lat);
            ps.setDouble(3, lng);
            if (precisionM > 0 && precisionM < 500000) {
                ps.setInt(4, precisionM);
            } else {
                ps.setNull(4, java.sql.Types.INTEGER);
            }
            ps.executeUpdate();
        }
        try (PreparedStatement ps = c.prepareStatement(
                "DELETE FROM ubicaciones_usuarios WHERE usuario_id = ? AND timestamp < NOW() - INTERVAL '2 hours'")) {
            ps.setInt(1, userId);
            ps.executeUpdate();
        }
    }
}
