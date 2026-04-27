package com.gestornova.gestion.work;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
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
        ParsedConn parsed = parseAndCanonicalizeConnectionString(connectionString);
        String url = parsed.jdbcUrl;
        Properties p = buildConnectProps(parsed);
        org.postgresql.Driver driver = new org.postgresql.Driver();

        Connection c = driver.connect(url, p);
        if (c != null) return c;

        // Sin duplicar sslmode en Properties si la URL ya lo trae (evita que connect() devuelva null en algunos runtimes).
        Properties minimal = minimalFallbackProps(p);
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

    /** Resultado de {@link #parseAndCanonicalizeConnectionString(String)}: URL sin user:pass en la autoridad (exigido por pgjdbc 42.2 en Android). */
    private static final class ParsedConn {
        /** {@code jdbc:postgresql://host[:port]/db} (consulta opcional sin credenciales en la URL). */
        final String jdbcUrl;
        /** user, password, parámetros de consulta originales (sslmode, etc.). */
        final Properties queryAndAuthProps;

        ParsedConn(String jdbcUrl, Properties queryAndAuthProps) {
            this.jdbcUrl = jdbcUrl;
            this.queryAndAuthProps = queryAndAuthProps;
        }
    }

    /**
     * Convierte cadenas estilo Neon {@code postgresql://user:pass@host/db?...} en URL JDBC que pgjdbc 42.x
     * acepta siempre: credenciales y parámetros en {@link Properties}, no en userinfo del host.
     */
    private static ParsedConn parseAndCanonicalizeConnectionString(String connectionString) throws SQLException {
        String raw = connectionString == null ? "" : connectionString.trim();
        if (!raw.isEmpty() && raw.charAt(0) == '\uFEFF') {
            raw = raw.substring(1).trim();
        }
        raw = sanitizeNeonJdbcUrl(raw);

        String forUri = raw;
        if (forUri.startsWith("jdbc:")) {
            forUri = forUri.substring("jdbc:".length());
        }
        if (!forUri.startsWith("postgresql://")) {
            forUri = "postgresql://" + forUri;
        }

        final URI uri;
        try {
            uri = new URI(forUri);
        } catch (URISyntaxException e) {
            throw new SQLException("connectionString Neon con formato inválido", e);
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            throw new SQLException("connectionString Neon sin host (revisá user:pass@host en la URL)");
        }

        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            throw new SQLException("connectionString Neon sin nombre de base /ruta");
        }
        String database = path.startsWith("/") ? path.substring(1) : path;
        int port = uri.getPort();

        Properties qprops = new Properties();
        String query = uri.getRawQuery();
        if (query != null && !query.isEmpty()) {
            for (String pair : query.split("&")) {
                if (pair.isEmpty()) continue;
                int eq = pair.indexOf('=');
                if (eq <= 0) continue;
                String k = urlDecode(pair.substring(0, eq));
                String v = urlDecode(pair.substring(eq + 1));
                if (!k.isEmpty()) {
                    qprops.setProperty(k, v);
                }
            }
        }

        String rawUserInfo = uri.getRawUserInfo();
        if (rawUserInfo != null && !rawUserInfo.isEmpty()) {
            int colon = rawUserInfo.indexOf(':');
            if (colon >= 0) {
                qprops.setProperty("user", urlDecode(rawUserInfo.substring(0, colon)));
                qprops.setProperty("password", urlDecode(rawUserInfo.substring(colon + 1)));
            } else {
                qprops.setProperty("user", urlDecode(rawUserInfo));
            }
        }

        StringBuilder jdbc = new StringBuilder();
        jdbc.append("jdbc:postgresql://").append(host);
        if (port > 0) {
            jdbc.append(":").append(port);
        }
        jdbc.append("/").append(database);

        return new ParsedConn(jdbc.toString(), qprops);
    }

    /** Segundo intento de conexión: timeouts + credenciales, sin el resto de props (sslmode va en URL implícita vía props anteriores — aquí copiamos sslmode si existía). */
    private static Properties minimalFallbackProps(Properties full) {
        Properties minimal = new Properties();
        minimal.setProperty("connectTimeout", "20");
        minimal.setProperty("socketTimeout", "25");
        copyPropIfPresent(full, minimal, "user");
        copyPropIfPresent(full, minimal, "password");
        copyPropIfPresent(full, minimal, "sslmode");
        copyPropIfPresent(full, minimal, "maxResultBuffer");
        if (!minimal.containsKey("maxResultBuffer")) {
            minimal.setProperty("maxResultBuffer", "0");
        }
        return minimal;
    }

    private static void copyPropIfPresent(Properties src, Properties dst, String key) {
        String v = src.getProperty(key);
        if (v != null) {
            dst.setProperty(key, v);
        }
    }

    private static String urlDecode(String s) {
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return s;
        }
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

    private static Properties buildConnectProps(ParsedConn parsed) {
        Properties p = new Properties();
        for (String name : parsed.queryAndAuthProps.stringPropertyNames()) {
            p.setProperty(name, parsed.queryAndAuthProps.getProperty(name));
        }
        if (!p.containsKey("sslmode") && !parsed.jdbcUrl.contains("sslmode=")) {
            p.setProperty("sslmode", "require");
        }
        p.setProperty("connectTimeout", "20");
        p.setProperty("socketTimeout", "25");
        /*
         * Android no incluye java.lang.management.ManagementFactory en el classpath del app process.
         * pgjdbc 42.x usa ManagementFactory al ajustar el buffer de resultados si maxResultBuffer queda
         * implícito. Forzar un valor fijo evita PGPropertyMaxResultBufferParser.adjustResultSize → NoClassDefFoundError.
         */
        if (!p.containsKey("maxResultBuffer") && !parsed.jdbcUrl.contains("maxResultBuffer")) {
            p.setProperty("maxResultBuffer", "0");
        }
        return p;
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
