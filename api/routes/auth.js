import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { authMiddleware, signToken } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "").trim();
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });

    const r = await query(
      "SELECT id, email, nombre, rol, password_hash, activo FROM usuarios WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!r.rows.length) return res.status(401).json({ error: "Credenciales inválidas" });
    const u = r.rows[0];
    if (!u.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const hash = String(u.password_hash || "");
    let ok = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      ok = await bcrypt.compare(password, hash);
    } else {
      ok = password === hash; // compatibilidad temporal texto plano
    }
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = signToken({ userId: u.id, rol: u.rol });
    return res.json({
      token,
      user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol },
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en login", detail: error.message });
  }
});

router.post("/verify-token", authMiddleware, async (req, res) => {
  return res.json({ ok: true, user: req.user });
});

export default router;

