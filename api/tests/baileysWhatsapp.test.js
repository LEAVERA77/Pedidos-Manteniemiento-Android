import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendTextBaileysMock, logEnviadoMock } = vi.hoisted(() => ({
  sendTextBaileysMock: vi.fn(),
  logEnviadoMock: vi.fn(),
}));

vi.mock("../db/neon.js", () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));

import {
  digitsForBaileysSend,
  extractMessageText,
  extractMessageLocation,
  resolveInboundSender,
  startBaileys,
  sendText,
  getBaileysQrDataUrl,
  resetBaileysSessionAndReconnect,
} from "../services/baileysWhatsapp.js";
import { normalizePgConnectionString } from "../db/pgSslUrl.js";
import {
  storeBaileysMediaBuffer,
  consumeBaileysMediaBuffer,
} from "../services/baileysMediaStore.js";

describe("baileysWhatsapp helpers", () => {
  it("digitsForBaileysSend preserva 549 móvil AR y restaura 9 cuando falta", () => {
    expect(digitsForBaileysSend("5493436986848")).toBe("5493436986848");
    expect(digitsForBaileysSend("543436986848")).toBe("5493436986848");
    expect(digitsForBaileysSend("+54 343 698-6848")).toBe("5493436986848");
    expect(digitsForBaileysSend("59899123456")).toBe("59899123456");
  });

  it("extractMessageText desenvuelve mensajes efímeros (disappearing messages) y extendidos", () => {
    expect(
      extractMessageText({
        message: {
          ephemeralMessage: {
            message: {
              extendedTextMessage: { text: "Hola" },
            },
          },
        },
      })
    ).toBe("Hola");

    expect(
      extractMessageText({
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: { caption: "poste caido" },
            },
          },
        },
      })
    ).toBe("poste caido");
  });

  it("extractMessageLocation extrae coordenadas GPS incluso en mensaje efímero", () => {
    const loc = extractMessageLocation({
      message: {
        ephemeralMessage: {
          message: {
            locationMessage: {
              degreesLatitude: -31.6679,
              degreesLongitude: -60.0153,
            },
          },
        },
      },
    });
    expect(loc).toEqual({ latitude: -31.6679, longitude: -60.0153 });
  });

  it("resolveInboundSender resuelve @lid vía remoteJidAlt y vía lidMapping sin contaminar dígitos con :0", async () => {
    const fromAlt = await resolveInboundSender(
      {
        key: {
          remoteJid: "98765432101234@lid",
          remoteJidAlt: "5493436986848:0@s.whatsapp.net",
        },
      },
      null
    );
    expect(fromAlt?.waId).toBe("5493436986848");
    expect(fromAlt?.remoteJid).toBe("5493436986848@s.whatsapp.net");

    const fakeSock = {
      signalRepository: {
        lidMapping: {
          getPNForLID: vi.fn(async () => "5493434540250:14@s.whatsapp.net"),
        },
      },
    };
    const fromLidStore = await resolveInboundSender(
      {
        key: {
          remoteJid: "11223344556677@lid",
        },
      },
      fakeSock
    );
    expect(fromLidStore?.waId).toBe("5493434540250");
    expect(fromLidStore?.remoteJid).toBe("5493434540250@s.whatsapp.net");
  });

  it("storeBaileysMediaBuffer guarda y consume una sola vez el buffer de imagen", () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    storeBaileysMediaBuffer("baileys-media:test1", buf, "image/png");
    const first = consumeBaileysMediaBuffer("baileys-media:test1");
    expect(first?.buffer.equals(buf)).toBe(true);
    expect(first?.mimeType).toBe("image/png");
    expect(consumeBaileysMediaBuffer("baileys-media:test1")).toBeNull();
  });
});

describe("corte experimental multitenant: sesión global desactivada", () => {
  it("bloquea inicio, envío, QR y reset sin tocar la sesión global", async () => {
    const before = process.env.BAILEYS_MULTITENANT_ENABLED;
    process.env.BAILEYS_MULTITENANT_ENABLED = "true";
    try {
      await expect(startBaileys()).rejects.toThrow("baileys_legacy_disabled_in_multitenant_mode");
      await expect(resetBaileysSessionAndReconnect()).rejects.toThrow("baileys_legacy_disabled_in_multitenant_mode");
      expect(await sendText("5493436980000", "hola")).toMatchObject({ok:false,error:"baileys_legacy_disabled_in_multitenant_mode"});
      expect(getBaileysQrDataUrl()).toBeNull();
    } finally {
      if (before === undefined) delete process.env.BAILEYS_MULTITENANT_ENABLED;
      else process.env.BAILEYS_MULTITENANT_ENABLED = before;
    }
  });
});

describe("pgSslUrl — normalizePgConnectionString", () => {
  it("agrega uselibpqcompat=true cuando sslmode=require|prefer|verify-ca sin cert", () => {
    const url =
      "postgresql://u:p@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require";
    const out = normalizePgConnectionString(url);
    expect(out).toContain("sslmode=require");
    expect(out).toContain("uselibpqcompat=true");
  });

  it("no altera sslmode=verify-full ni cuando ya trae uselibpqcompat", () => {
    const full =
      "postgresql://u:p@ep-test.neon.tech/neondb?sslmode=verify-full";
    expect(normalizePgConnectionString(full)).toBe(full);
  });
});

describe("whatsappService con WHATSAPP_PROVIDER=baileys", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendTextBaileysMock.mockReset();
    logEnviadoMock.mockReset();
    process.env.WHATSAPP_PROVIDER = "baileys";
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("sendBotWhatsAppText y sendTenantWhatsAppText pasan bodyText y registran log sin ReferenceError", async () => {
    vi.doMock("../services/baileysBroadcastSafety.js", () => ({ assertBaileysBroadcastTenant: vi.fn(async()=>{}) }));
    vi.doMock("../services/baileysWhatsapp.js", () => ({
      sendText: sendTextBaileysMock,
    }));
    vi.doMock("../services/whatsappNotificacionesLog.js", () => ({
      logWhatsappMensajeEnviado: logEnviadoMock,
      logWhatsappMensajeRecibido: vi.fn(),
    }));

    sendTextBaileysMock.mockResolvedValue({ ok: true, data: { key: { id: "m1" } } });
    logEnviadoMock.mockResolvedValue(undefined);

    const { sendBotWhatsAppText, sendTenantWhatsAppText } = await import(
      "../services/whatsappService.js"
    );

    const rBot = await sendBotWhatsAppText({
      tenantId: 1,
      webhookPhoneNumberId: "baileys-bot",
      toDigits: "543436986848",
      bodyText: "Bienvenido al menú",
    });
    expect(rBot.ok).toBe(true);
    expect(rBot.provider).toBe("baileys");
    expect(sendTextBaileysMock).toHaveBeenCalledWith("543436986848", "Bienvenido al menú");
    expect(logEnviadoMock).toHaveBeenCalledWith("543436986848", "Bienvenido al menú", true, null);

    const rTenant = await sendTenantWhatsAppText({
      tenantId: 1,
      toDigits: "543436986848",
      bodyText: "Tu reclamo #42 fue finalizado",
      pedidoId: 42,
    });
    expect(rTenant.ok).toBe(true);
    expect(rTenant.provider).toBe("baileys");
    expect(sendTextBaileysMock).toHaveBeenCalledWith(
      "543436986848",
      "Tu reclamo #42 fue finalizado"
    );
    expect(logEnviadoMock).toHaveBeenCalledWith(
      "543436986848",
      "Tu reclamo #42 fue finalizado",
      true,
      42
    );
  });
});
