/** Desktop pairing sheet: QR code + manual code for the Android companion. */
import QRCode from 'qrcode';
import type { Game } from '../app/Game';
import { h, btn } from './dom';
import { bridge, lastSeen } from '../app/phoneLink';
import { PROTOCOL } from '../sim/phoneLink';

export function openPhonePanel(game: Game): void {
  const sheet = h('div', { class: 'sheet card tape', style: 'width:560px' }, h('h1', null, 'Phone camera'));
  const close = game.hud.modal(sheet);
  const b = bridge();
  sheet.append(
    h('p', null, 'Shoot real life with the cameras in your collection. The Latent Image Camera app on your Android phone turns it into the camera you pick: its viewfinder, its dials, its faults. You never see the pictures on the phone. They come back here as an exposed roll, and you develop them in the darkroom.'),
  );
  if (!b) {
    sheet.append(h('p', { class: 'small' }, 'Pairing works in the desktop app (it runs a small server on your home network). You are running the browser version.'), btn('Close', () => close()));
    return;
  }
  const body = h('div', { class: 'flex', style: 'align-items:flex-start;gap:20px' });
  sheet.append(body, btn('Close', () => close()));
  void b.info().then(async (info) => {
    const payload = JSON.stringify({ url: info.url, token: info.token, v: PROTOCOL });
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 240, color: { dark: '#1b1813', light: '#f2ebdb' } });
    body.append(
      h('img', { src: dataUrl, width: '240', height: '240', style: 'display:block;image-rendering:pixelated' }),
      h(
        'div',
        { style: 'flex:1' },
        h('div', { class: 'label' }, '1 · Same Wi-Fi'),
        h('p', { class: 'small' }, 'Phone and PC on the same network.'),
        h('div', { class: 'label' }, '2 · Scan'),
        h('p', { class: 'small' }, 'Open the app → Pair → point it at this code.'),
        h('div', { class: 'label' }, 'Or type it in'),
        h('p', { style: 'font-family:var(--font-type);font-size:15px;margin:2px 0' }, info.url),
        h('p', { style: 'font-family:var(--font-label);font-size:26px;letter-spacing:.2em;margin:2px 0' }, info.token),
        info.addresses.length > 1 ? h('p', { class: 'small' }, `Other addresses: ${info.addresses.slice(1).join(', ')}`) : null,
        h('p', { class: 'small' }, lastSeen ? `Phone last seen ${Math.round((Date.now() - lastSeen.at) / 1000)} s ago (${lastSeen.ip}).` : 'No phone has connected yet. If it cannot connect, allow Latent Image through the PC firewall (private networks).'),
      ),
    );
  });
}
