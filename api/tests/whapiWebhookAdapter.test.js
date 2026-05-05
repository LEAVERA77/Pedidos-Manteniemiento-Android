import { describe, it, expect } from "vitest";
import { whapiWebhookToMetaShapedPayload } from "../services/whapiWebhookAdapter.js";

describe("whapiWebhookToMetaShapedPayload", () => {
  it("maps Whapi location to Meta-shaped location message", () => {
    const body = {
      channel_id: "CH1",
      messages: [
        {
          id: "loc1",
          from_me: false,
          type: "location",
          chat_id: "5491112223333@s.whatsapp.net",
          timestamp: 1713202936,
          from: "5491112223333",
          from_name: "Vecino",
          location: { latitude: -34.6, longitude: -58.4 },
        },
      ],
    };
    const shaped = whapiWebhookToMetaShapedPayload(body);
    expect(shaped).toBeTruthy();
    const msgs = shaped.entry[0].changes[0].value.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe("location");
    expect(msgs[0].location.latitude).toBe(-34.6);
    expect(msgs[0].location.longitude).toBe(-58.4);
    expect(msgs[0].from).toBe("5491112223333");
  });

  it("maps Whapi live_location to Meta-shaped location", () => {
    const body = {
      messages: [
        {
          id: "ll1",
          from_me: false,
          type: "live_location",
          chat_id: "5491112223333@s.whatsapp.net",
          timestamp: 1713202936,
          from: "5491112223333",
          live_location: { latitude: -31.4, longitude: -64.2, caption: "x" },
        },
      ],
    };
    const shaped = whapiWebhookToMetaShapedPayload(body);
    const msg = shaped.entry[0].changes[0].value.messages[0];
    expect(msg.type).toBe("location");
    expect(msg.location.latitude).toBe(-31.4);
    expect(msg.location.longitude).toBe(-64.2);
  });

  it("maps Whapi image to Meta-shaped image message (id + optional link)", () => {
    const body = {
      channel_id: "CH1",
      messages: [
        {
          id: "img1",
          from_me: false,
          type: "image",
          chat_id: "5491112223333@s.whatsapp.net",
          timestamp: 1713202936,
          from: "5491112223333",
          from_name: "Vecino",
          image: {
            id: "jpeg-abc123def456-804713c25d2b57",
            mime_type: "image/jpeg",
            link: "https://example.com/f.jpg",
          },
        },
      ],
    };
    const shaped = whapiWebhookToMetaShapedPayload(body);
    expect(shaped).toBeTruthy();
    const msg = shaped.entry[0].changes[0].value.messages[0];
    expect(msg.type).toBe("image");
    expect(msg.image.id).toBe("jpeg-abc123def456-804713c25d2b57");
    expect(msg.image.mime_type).toBe("image/jpeg");
    expect(msg.image.link).toBe("https://example.com/f.jpg");
  });
});
