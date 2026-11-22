import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const memConfig = new Map();
const mockQuery = vi.fn();
const mockStartBaileys = vi.fn(async () => {});
const mockResetBaileys = vi.fn(async () => ({
  status: "connecting",
  hasQr: false,
  lastError: null,
  sessionId: "default",
}));
let mockBaileysStatusObj = {
  status: "qr_ready",
  hasQr: true,
  lastError: null,
  sessionId: "default",
};
let mockBaileysQrUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

vi.mock("../db/neon.js", () => ({
  query: (...args) => mockQuery(...args),
}));

vi.mock("../services/baileysWhatsapp.js", () => ({
  getBaileysStatus: () => ({ ...mockBaileysStatusObj }),
  getBaileysQrDataUrl: () => mockBaileysQrUrl,
  startBaileys: (...args) => mockStartBaileys(...args),
  resetBaileysSessionAndReconnect: (...args) => mockResetBaileys(...args),
}));

vi.mock("../services/pipelineGeocodificacionPedido.js", () => ({
  resolverCoordenadasCandidatoWhatsapp: vi.fn(async () => ({
    success: true,
    lat: -31.73,
    lng: -60.52,
    fuente: "gps_usuario",
    fuente_final: "gps_usuario",
    log: [],
    pasos: [],
    errores: [],
    geocoding_audit: null,
  })),
}));

vi.mock("../services/nominatimClient.js", () => ({
  geocodeCalleNumeroLocalidadArgentina: vi.fn(async () => null),
  geocodeDomicilioSimpleQArgentina: vi.fn(async () => null),
  reverseGeocodeArgentina: vi.fn(async () => ({
    barrio: "Centro",
    state: "Entre Ríos",
    postcode: "3127",
  })),
}));

import {
  __resetWhatsappBotTargetCacheForTests,
  getWhatsappBotActiveTarget,
  syncWhatsappBotActiveTarget,
} from "../services/whatsappBotTargetStore.js";
import {
  resolveWhatsappBotTarget,
  resolveTenantIdByMetaPhoneNumberId,
} from "../services/metaTenantWhatsapp.js";
import { loadTenantBotContext } from "../services/whatsappBotMeta.js";
import {
  crearPedidoDesdeWhatsappBot,
  __resetPedidosColsCacheForTests,
} from "../services/pedidoWhatsappBot.js";
import { buscarIdentidadParaReclamoWhatsApp } from "../services/whatsappReclamanteLookup.js";
import webhooksWhatsappRoutes from "../routes/webhooksWhatsapp.js";

const SAVED_ENV = { ...process.env };

function createTestWebhookApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/webhooks/whatsapp", webhooksWhatsappRoutes);
  return app;
}

function setupTenantsMock({
  tenant1Tipo = "cooperativa_electrica",
  tenant1ActiveBt = "electricidad",
  tenant2Tipo = "cooperativa_agua",
  tenant2ActiveBt = "agua",
} = {}) {
  const tenantRows = [
    {
      id: 1,
      nombre: "Cooperativa Segui",
      tipo: tenant1Tipo,
      active_business_type: tenant1ActiveBt,
      activo: null, // Simula fila inicial con activo NULL en Postgres (COALESCE(activo, TRUE) = TRUE)
      configuracion: { lat_base: -31.95, lng_base: -60.12, provincia: "Entre Ríos" },
    },
    {
      id: 2,
      nombre: "La Montevideana",
      tipo: tenant2Tipo,
      active_business_type: tenant2ActiveBt,
      activo: true,
      configuracion: { meta_phone_id: "OLD_META_PHONE_ID" },
    },
    {
      id: 3,
      nombre: "Municipalidad Tenant 3",
      tipo: "municipio",
      active_business_type: "municipio",
      activo: true,
      configuracion: {},
    },
  ];

  mockQuery.mockImplementation(async (sql, params = []) => {
    const s = String(sql || "");

    // Tabla real `configuracion` usada por configuracionStore.js
    if (s.includes("CREATE TABLE IF NOT EXISTS configuracion")) {
      return { rows: [] };
    }
    if (s.includes("SELECT value FROM configuracion WHERE key = $1")) {
      const k = String(params[0] || "");
      return memConfig.has(k) ? { rows: [{ value: memConfig.get(k) }] } : { rows: [] };
    }
    if (s.includes("INSERT INTO configuracion")) {
      const k = String(params[0] || "");
      const rawJson = params[1];
      const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
      memConfig.set(k, parsed);
      return { rows: [] };
    }

    if (s.includes("information_schema.columns")) {
      if (s.includes("table_name = 'clientes'") && s.includes("active_business_type")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (s.includes("table_name = 'tenant_active_business'")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (s.includes("table_name = 'pedidos'") && !s.includes("column_name =")) {
        return {
          rows: [
            "id",
            "numero_pedido",
            "cliente",
            "cliente_nombre",
            "tipo_trabajo",
            "descripcion",
            "prioridad",
            "estado",
            "avance",
            "lat",
            "lng",
            "usuario_id",
            "usuario_creador_id",
            "telefono_contacto",
            "tenant_id",
            "business_type",
            "origen_reclamo",
          ].map((column_name) => ({ column_name })),
        };
      }
      if (s.includes("table_name = 'pedidos'") && s.includes("business_type")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (s.includes("table_name = 'usuarios'")) {
        return { rows: [{ column_name: "tenant_id" }] };
      }
      if (s.includes("table_name = 'socios_catalogo'") || params[0] === "socios_catalogo") {
        return {
          rows: [
            { column_name: "id", data_type: "integer", udt_name: "int4" },
            { column_name: "nis_medidor", data_type: "text", udt_name: "text" },
            { column_name: "nis", data_type: "text", udt_name: "text" },
            { column_name: "medidor", data_type: "text", udt_name: "text" },
            { column_name: "nombre", data_type: "text", udt_name: "text" },
            { column_name: "calle", data_type: "text", udt_name: "text" },
            { column_name: "numero", data_type: "text", udt_name: "text" },
            { column_name: "localidad", data_type: "text", udt_name: "text" },
            { column_name: "tipo_conexion", data_type: "text", udt_name: "text" },
            { column_name: "fases", data_type: "text", udt_name: "text" },
            { column_name: "latitud", data_type: "numeric", udt_name: "numeric" },
            { column_name: "longitud", data_type: "numeric", udt_name: "numeric" },
            { column_name: "tenant_id", data_type: "integer", udt_name: "int4" },
            { column_name: "cliente_id", data_type: "integer", udt_name: "cliente_id" },
            { column_name: "business_type", data_type: "text", udt_name: "text" },
            { column_name: "activo", data_type: "boolean", udt_name: "bool" },
          ],
        };
      }
      return { rows: [] };
    }

    if (s.includes("information_schema.tables")) {
      if (params[0] === "socios_catalogo") return { rows: [{ "?column?": 1 }] };
      return { rows: [] };
    }

    if (s.includes("FROM tenant_active_business")) {
      const tid = Number(params[0]);
      if (tid === 1) return { rows: [{ active_business_type: tenant1ActiveBt }] };
      if (tid === 2) return { rows: [{ active_business_type: tenant2ActiveBt }] };
      if (tid === 3) return { rows: [{ active_business_type: "municipio" }] };
      return { rows: [] };
    }

    if (s.includes("FROM clientes")) {
      // Si alguna consulta olvidara COALESCE(activo, TRUE) y usara `activo = TRUE` plano,
      // excluiría id=1 (activo: null) igual que Postgres real!
      const usesStrictActivoTrue =
        /\bactivo\s*=\s*TRUE\b/i.test(s) && !/COALESCE\s*\(\s*activo\s*,\s*TRUE\s*\)/i.test(s);

      if (s.includes("meta_phone_id")) {
        if (params[0] === "OLD_META_PHONE_ID") {
          return { rows: [{ id: 2 }] };
        }
        if (params[0] === "DEDICATED_META_3") {
          return { rows: [{ id: 3 }] };
        }
        return { rows: [] };
      }

      if (s.includes("ORDER BY (CASE WHEN id = 1")) {
        const visible = tenantRows.filter((r) =>
          usesStrictActivoTrue ? r.activo === true : r.activo !== false
        );
        return visible.length ? { rows: [{ id: visible[0].id }] } : { rows: [] };
      }

      if (s.includes("ORDER BY id ASC")) {
        const visible = tenantRows.filter((r) =>
          usesStrictActivoTrue ? r.activo === true : r.activo !== false
        );
        return { rows: visible };
      }

      const tid = Number(params[0]);
      const found = tenantRows.find((r) => r.id === tid);
      if (!found) return { rows: [] };
      if (usesStrictActivoTrue && found.activo !== true) {
        return { rows: [] };
      }
      return { rows: [found] };
    }

    if (s.includes("FROM usuarios")) {
      return { rows: [{ id: 10, nombre: "Admin T1", email: "admin" }] };
    }

    if (s.includes("pedido_contador") || s.includes("MAX(")) {
      return { rows: [{ ultimo_numero: 42 }] };
    }

    if (s.includes("INSERT INTO pedidos")) {
      return {
        rows: [
          {
            id: 501,
            numero_pedido: "2026-0042",
            tenant_id: params[params.length - 3],
          },
        ],
      };
    }

    if (s.includes("FROM socios_catalogo")) {
      return {
        rows: [
          {
            nis_medidor: "41686",
            nis_raw: "41686",
            medidor_raw: "99881",
            nombre: "Juan Pérez",
            calle_cat: "San Martín",
            numero_cat: "123",
            localidad_cat: "Seguí",
            tipo_conexion_cat: "Aérea",
            fases_cat: "Monofásica",
            lat_pad: -31.95,
            lng_pad: -60.12,
            provincia_cat: "Entre Ríos",
            codigo_postal_cat: "3117",
          },
        ],
      };
    }

    return { rows: [] };
  });
}

describe("WhatsApp bot — selector de tenant_id en Baileys QR y persistencia real en Neon", () => {
  beforeEach(() => {
    memConfig.clear();
    mockQuery.mockReset();
    mockStartBaileys.mockClear();
    mockResetBaileys.mockClear();
    mockBaileysStatusObj = {
      status: "qr_ready",
      hasQr: true,
      lastError: null,
      sessionId: "default",
    };
    __resetWhatsappBotTargetCacheForTests();
    __resetPedidosColsCacheForTests();
    process.env = { ...SAVED_ENV };
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("en Baileys resuelve tenant_id=1 (Cooperativa Segui, activo NULL en DB) y NO cae a La Montevideana", async () => {
    process.env.WHATSAPP_PROVIDER = "baileys";
    process.env.META_PHONE_NUMBER_ID = "OLD_META_PHONE_ID";
    process.env.WHATSAPP_BOT_TENANT_ID = "2"; // viejo env apuntando a La Montevideana
    delete process.env.BAILEYS_TENANT_ID;

    setupTenantsMock();

    const target = await resolveWhatsappBotTarget("baileys-bot");
    expect(target).toMatchObject({
      tenantId: 1,
      businessType: "electricidad",
      rubro: "cooperativa_electrica",
      tenantNombre: "Cooperativa Segui",
    });

    const tid = await resolveTenantIdByMetaPhoneNumberId("baileys-bot");
    expect(tid).toBe(1);

    const ctx = await loadTenantBotContext(1, target?.businessType);
    expect(ctx?.nombre).toBe("Cooperativa Segui");
    expect(ctx?.tipo).toBe("cooperativa_electrica");
    expect(ctx?.businessType).toBe("electricidad");
    expect(ctx?.tipos).not.toContain("Corte de suministro de agua");
  });

  it("pantalla GET /baileys/qr muestra selector numérico de tenant_id y POST /baileys/select-tenant bloquea Cooperativa Segui en Neon", async () => {
    process.env.WHATSAPP_PROVIDER = "baileys";
    process.env.WHATSAPP_WEBHOOK_TOKEN = "tok-baileys-123";
    process.env.WHATSAPP_LINK_TOKEN = "link-token-0123456789-abcdefghijklmnop";
    // Incluso si en Render quedaron envs viejos apuntando al tenant 2 (La Montevideana):
    process.env.BAILEYS_TENANT_ID = "2";
    process.env.WHATSAPP_BOT_TENANT_ID = "2";
    process.env.WHATSAPP_BOT_FORCE_ENV_TENANT = "true";

    setupTenantsMock();
    const app = createTestWebhookApp();

    // 1) Sin token -> 401
    const unauth = await request(app).get("/api/webhooks/whatsapp/baileys/qr");
    expect(unauth.status).toBe(401);

    // 2) Con token -> muestra formulario para elegir tenant_id (1 = Cooperativa Segui, 2 = La Montevideana)
    const qrPage = await request(app).get(
      "/api/webhooks/whatsapp/baileys/qr?token=link-token-0123456789-abcdefghijklmnop"
    );
    expect(qrPage.status).toBe(200);
    expect(qrPage.text).toContain('name="tenant_id"');
    expect(qrPage.text).toContain("Cooperativa Segui");
    expect(qrPage.text).toContain("La Montevideana");

    // 3) El operador elige tenant_id=1 en el formulario del QR
    const postRes = await request(app)
      .post("/api/webhooks/whatsapp/baileys/select-tenant")
      .type("form")
      .send({
        token: "link-token-0123456789-abcdefghijklmnop",
        tenant_id: "1",
        confirm_tenant_id: "1",
        business_type: "auto",
      });
    expect(postRes.status).toBe(303);
    expect(postRes.headers.location).toContain("/api/webhooks/whatsapp/baileys/qr?saved=1");

    // 4) Quedó persistido en la tabla real `configuracion` con locked=true
    const persisted = memConfig.get("whatsapp_bot_active_target");
    expect(persisted).toMatchObject({
      tenant_id: 1,
      tenant_nombre: "Cooperativa Segui",
      business_type: "electricidad",
      rubro: "cooperativa_electrica",
      locked: true,
      source: "baileys_qr_selector",
    });

    // 5) Aunque existan BAILEYS_TENANT_ID=2 o logins de fondo en tenant 2, el bot SIEMPRE apunta a Cooperativa Segui
    await syncWhatsappBotActiveTarget({
      tenantId: 2,
      businessType: "agua",
      source: "auth_login",
    });

    const resolved = await resolveWhatsappBotTarget("baileys-bot");
    expect(resolved).toMatchObject({
      tenantId: 1,
      tenantNombre: "Cooperativa Segui",
      businessType: "electricidad",
      rubro: "cooperativa_electrica",
      locked: true,
    });

    // 6) GET /baileys/status devuelve el botTarget fijado y el QR listo para escanear
    const statusRes = await request(app).get(
      "/api/webhooks/whatsapp/baileys/status?token=link-token-0123456789-abcdefghijklmnop"
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.ok).toBe(true);
    expect(statusRes.body.botTarget).toMatchObject({
      tenant_id: 1,
      tenant_nombre: "Cooperativa Segui",
      business_type: "electricidad",
      rubro: "cooperativa_electrica",
      locked: true,
    });

    // 7) POST /baileys/reset-session permite cerrar sesión WhatsApp y pedir nuevo QR manteniendo el tenant elegido
    const resetRes = await request(app)
      .post("/api/webhooks/whatsapp/baileys/reset-session")
      .set("Accept", "application/json")
      .send({
        token: "link-token-0123456789-abcdefghijklmnop",
        tenant_id: 2, // reset nunca cambia la asociación a otro tenant
      });
    expect(resetRes.status).toBe(200);
    expect(mockResetBaileys).toHaveBeenCalledTimes(1);
    expect(resetRes.body.botTarget?.tenant_id).toBe(1);
  });

  it("protege QR, cambios por GET, origen ajeno y confirmación del tenant", async () => {
    setupTenantsMock();
    const app = createTestWebhookApp();
    const key = "link-token-0123456789-abcdefghijklmnop";
    delete process.env.WHATSAPP_LINK_TOKEN;
    await request(app).get("/api/webhooks/whatsapp/baileys/qr").expect(401);
    process.env.WHATSAPP_LINK_TOKEN = "corto";
    await request(app).get("/api/webhooks/whatsapp/baileys/qr?token=corto").expect(401);
    process.env.WHATSAPP_LINK_TOKEN = key;
    process.env.WHATSAPP_WEBHOOK_TOKEN = key;
    await request(app).get(`/api/webhooks/whatsapp/baileys/qr?token=${key}`).expect(401);
    process.env.WHATSAPP_WEBHOOK_TOKEN = "webhook-otro";
    await request(app).get(`/api/webhooks/whatsapp/baileys/qr?token=${key}&apply=1&tenant_id=1`).expect(405);
    await request(app).post("/api/webhooks/whatsapp/baileys/select-tenant")
      .set("Origin", "https://sitio-ajeno.example").send({ token: key, tenant_id: 1, confirm_tenant_id: 1 }).expect(403);
    await request(app).post("/api/webhooks/whatsapp/baileys/select-tenant")
      .send({ token: key, tenant_id: 1, confirm_tenant_id: 2 }).expect(400);
    expect(memConfig.has("whatsapp_bot_active_target")).toBe(false);
    const qr = await request(app).get(`/api/webhooks/whatsapp/baileys/qr?token=${key}`).expect(200);
    expect(qr.headers["cache-control"]).toBe("no-store");
    expect(qr.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("sincroniza el destino del bot en Neon real al loguearse o cambiar business_type (electricidad -> agua -> municipio)", async () => {
    process.env.WHATSAPP_PROVIDER = "baileys";
    setupTenantsMock();

    const t1 = await syncWhatsappBotActiveTarget({
      tenantId: 1,
      source: "auth_login",
      userId: 10,
    });
    expect(t1).toMatchObject({
      tenantId: 1,
      tenantNombre: "Cooperativa Segui",
      businessType: "electricidad",
      rubro: "cooperativa_electrica",
    });

    // Verifica que configuracionStore escribió en SQL real
    expect(memConfig.get("whatsapp_bot_active_target")).toMatchObject({
      tenant_id: 1,
      business_type: "electricidad",
    });

    // Simula lectura fresca desde otra instancia / tras expirar caché
    __resetWhatsappBotTargetCacheForTests();
    const fromNeon = await getWhatsappBotActiveTarget();
    expect(fromNeon).toMatchObject({
      tenantId: 1,
      tenantNombre: "Cooperativa Segui",
      businessType: "electricidad",
    });

    // Cambio de línea de negocio en el mismo tenant 1 -> agua
    await syncWhatsappBotActiveTarget({
      tenantId: 1,
      businessType: "agua",
      source: "tenant_switch_business",
      userId: 10,
      force: true,
    });

    const ctxAgua = await loadTenantBotContext(1);
    expect(ctxAgua?.businessType).toBe("agua");
    expect(ctxAgua?.tipo).toBe("cooperativa_agua");
    expect(ctxAgua?.tipos).toContain("Corte de suministro de agua");

    // Login posterior en tenant 3 (municipio)
    await syncWhatsappBotActiveTarget({
      tenantId: 3,
      source: "auth_login",
      userId: 33,
      force: true,
    });

    const resolved3 = await resolveWhatsappBotTarget("baileys-bot");
    expect(resolved3).toMatchObject({
      tenantId: 3,
      businessType: "municipio",
      rubro: "municipio",
    });
  });

  it("en Meta dedicado (phone_number_id propio distinto del global) resuelve el tenant dueño del canal y su business_type", async () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.META_PHONE_NUMBER_ID = "SHARED_TEST_LINE";
    setupTenantsMock();

    await syncWhatsappBotActiveTarget({
      tenantId: 1,
      businessType: "electricidad",
      source: "auth_login",
    });

    const dedicated = await resolveWhatsappBotTarget("DEDICATED_META_3");
    expect(dedicated).toMatchObject({
      tenantId: 3,
      businessType: "municipio",
      rubro: "municipio",
    });

    const shared = await resolveWhatsappBotTarget("SHARED_TEST_LINE");
    expect(shared).toMatchObject({
      tenantId: 1,
      businessType: "electricidad",
    });
  });

  it("crearPedidoDesdeWhatsappBot persiste tenant_id y business_type y valida tipos según businessType activo", async () => {
    setupTenantsMock();

    await expect(
      crearPedidoDesdeWhatsappBot({
        tenantId: 1,
        tipoCliente: "cooperativa_agua",
        businessType: "electricidad",
        tipoTrabajo: "Corte de suministro de agua",
        descripcion: "Sin agua",
        telefonoContacto: "5493434123456",
        lat: -31.95,
        lng: -60.12,
      })
    ).rejects.toThrow("tipo_trabajo_invalido");

    await crearPedidoDesdeWhatsappBot({
      tenantId: 1,
      tipoCliente: "cooperativa_electrica",
      businessType: "electricidad",
      tipoTrabajo: "Corte de Energía",
      descripcion: "Luminaria apagada frente a la plaza",
      telefonoContacto: "5493434123456",
      lat: -31.95,
      lng: -60.12,
      contactName: "María Gómez",
      clienteCalle: "San Martín",
      clienteNumeroPuerta: "250",
      clienteLocalidad: "Seguí",
      provincia: "Entre Ríos",
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql || "").includes("INSERT INTO pedidos")
    );
    expect(insertCall).toBeTruthy();
    const [insertSql, insertVals] = insertCall;
    expect(insertSql).toContain("tenant_id");
    expect(insertSql).toContain("business_type");
    expect(insertVals).toContain(1);
    expect(insertVals).toContain("electricidad");
    expect(insertVals).toContain("whatsapp");
  });

  it("buscarIdentidadParaReclamoWhatsApp filtra socios_catalogo por COALESCE(tenant_id, cliente_id) y business_type sin fugas entre tenants", async () => {
    setupTenantsMock();

    const res = await buscarIdentidadParaReclamoWhatsApp(1, "41686", {
      businessType: "electricidad",
    });
    expect(res).toMatchObject({
      ok: true,
      clienteNombre: "Juan Pérez",
      nis: "41686",
    });

    const scCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql || "").includes("FROM socios_catalogo")
    );
    expect(scCalls.length).toBe(1);
    const [scSql, scParams] = scCalls[0];
    expect(scSql).toContain("COALESCE(tenant_id, cliente_id)");
    expect(scSql).toContain("business_type");
    expect(scSql).not.toContain("ELSE 2");
    expect(scParams).toContain(1);
    expect(scParams).toContain("electricidad");
  });
});
