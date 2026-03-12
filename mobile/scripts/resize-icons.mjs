#!/usr/bin/env node
// ============================================================
// Generate properly sized icons for Matra
// Run: npx sharp-cli resize ... OR install sharp and run this script
// ============================================================
//
// ADAPTIVE ICON (Android):
//   - Canvas: 432x432px
//   - Safe zone (visible area): center 288x288px (66%)
//   - The logo MUST fit within the center 288x288 area
//   - Add transparent padding around the logo
//
// NOTIFICATION ICON (Android):
//   - Size: 96x96px (mdpi), ideally provide 192x192 (xxxhdpi)
//   - Must be white silhouette on transparent background
//   - Keep it simple — no fine details
//
// Instructions:
//   1. Install sharp: npm install sharp --save-dev
//   2. Run: node mobile/scripts/resize-icons.mjs
//   OR manually resize assets:
//   - adaptive-icon.png: Place your logo in center 66% of a 432x432 canvas
//   - notification-icon.png: Create a 96x96 white silhouette version

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '..', 'assets');

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharp not installed. Run: npm install sharp --save-dev');
    console.log('\nManual instructions:');
    console.log('1. adaptive-icon.png: Resize your logo to fit in the center 288x288px of a 432x432px canvas');
    console.log('   (add padding so the logo occupies ~66% of the total size)');
    console.log('2. notification-icon.png: Create a 96x96px white-on-transparent version of your logo');
    process.exit(1);
  }

  // Resize adaptive icon — add padding so logo fits in safe zone (66%)
  const adaptiveSource = resolve(assetsDir, 'icon.png');
  const adaptiveOut = resolve(assetsDir, 'adaptive-icon.png');

  await sharp(adaptiveSource)
    .resize(288, 288, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: 72, bottom: 72, left: 72, right: 72,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toFile(adaptiveOut);
  console.log('✓ adaptive-icon.png generated (432x432, logo in center 288x288 safe zone)');

  // Generate notification icon — larger, white silhouette
  const notifOut = resolve(assetsDir, 'notification-icon.png');
  await sharp(adaptiveSource)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(notifOut);
  console.log('✓ notification-icon.png generated (192x192)');
}

main().catch(console.error);
