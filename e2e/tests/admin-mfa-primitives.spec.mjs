import { test, expect } from '@playwright/test';
import {
  opcionesRegistroHello, verificarRegistroHello, opcionesAccesoHello, verificarAccesoHello,
} from '../../api/services/adminMfaPrimitives.js';

test('WebAuthn de plataforma virtual: registro y prueba de posesión; rechaza desafío y contador repetidos', async ({ page, context }) => {
  const config = { origin: 'https://gn.example.test', rpID: 'gn.example.test' };
  await page.route(`${config.origin}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>WebAuthn</title>' }));
  await page.goto(`${config.origin}/`);
  const session = await context.newCDPSession(page);
  await session.send('WebAuthn.enable');
  await session.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  }});

  const registration = await opcionesRegistroHello({ ...config, tenantId: 1, userId: 7, account: 'admin' });
  const response = await page.evaluate(async options => {
    const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(options);
    return (await navigator.credentials.create({ publicKey })).toJSON();
  }, registration);
  const result = await verificarRegistroHello({ ...config, expectedChallenge: registration.challenge, response });
  expect(result.verified).toBe(true);
  expect(result.registrationInfo.userVerified).toBe(true);
  await expect(verificarRegistroHello({ ...config, expectedChallenge: 'incorrecto', response })).rejects.toThrow();

  const credential = result.registrationInfo.credential;
  const options = await opcionesAccesoHello({ ...config, credentials: [{ id: credential.id, transports: ['internal'] }] });
  const assertion = await page.evaluate(async opts => {
    const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(opts);
    return (await navigator.credentials.get({ publicKey })).toJSON();
  }, options);
  const verified = await verificarAccesoHello({ ...config, expectedChallenge: options.challenge, response: assertion, credential });
  expect(verified.verified).toBe(true);
  expect(verified.authenticationInfo.userVerified).toBe(true);
  await expect(verificarAccesoHello({ ...config, expectedChallenge: 'incorrecto', response: assertion, credential })).rejects.toThrow();
  await expect(verificarAccesoHello({ ...config, expectedChallenge: options.challenge, response: assertion,
    credential: { ...credential, counter: verified.authenticationInfo.newCounter } })).rejects.toThrow();
  await session.detach();
});
