import { webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const pair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
);
const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const publicBytes = new Uint8Array(65);
publicBytes[0] = 4;
publicBytes.set(Buffer.from(publicJwk.x, 'base64url'), 1);
publicBytes.set(Buffer.from(publicJwk.y, 'base64url'), 33);

await writeFile('.vapid-private-jwk.json', JSON.stringify(privateJwk), { mode: 0o600 });
console.log('Clé publique VAPID (à copier dans push-config.js) :');
console.log(Buffer.from(publicBytes).toString('base64url'));
console.log('Clé privée écrite dans .vapid-private-jwk.json (ne pas partager ni publier).');
