/**
 * Alias de URL para el mismo handler que POST /api/webhooks/whatsapp/whapi
 * (útil si en Whapi configurás /api/webhooks/whapi/message).
 * made by leavera77
 */
import express from "express";
import { handleWhapiCloudWebhookPost } from "../webhooksWhatsapp.js";

const router = express.Router();
router.post("/message", handleWhapiCloudWebhookPost);

export default router;
