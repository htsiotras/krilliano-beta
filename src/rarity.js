export const TIERS = [
  { key: 'krillion', label: 'One in a Krillion', points: 100 },
  { key: 'deepCut', label: 'Deep Cut', points: 85 },
  { key: 'rare', label: 'Rare', points: 60 },
  { key: 'schooler', label: 'Schooler', points: 30 },
  { key: 'tooClever', label: 'Too Clever', points: 15 },
  { key: 'plankton', label: 'Plankton', points: 10 },
  { key: 'missed', label: 'Missed', points: 0 },
];
export const POINTS = TIERS.map(t => t.points);
export function validateRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length !== 7 || rounds.some(v => !POINTS.includes(v) || !Number.isInteger(v))) {
    throw new Error('Choose a valid result for all seven prompts.');
  }
  return rounds.reduce((a, b) => a + b, 0);
}
export function rarityCounts(rounds) {
  validateRounds(rounds);
  return Object.fromEntries(TIERS.map(t => [t.key, rounds.filter(v => v === t.points).length]));
}
// Experimental estimate of depth-marker positions. These are NOT verified results:
// screenshots and layout changes can cause mistakes. Always require confirmation.
// Uses the fixed seven columns and depth chart seen in completed desktop screenshots.
export async function estimateRounds(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image screenshot.');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1460; canvas.height = Math.round(image.height * 1460 / image.width);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Other aspect ratios can move the dive log; avoid inventing detections.
    if (Math.abs(canvas.height - 1056) > 140) return null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = [];
    for (let round = 0; round < 7; round++) {
      const cx = 351 + 106 * round;
      let bestY = null, best = -Infinity;
      for (let y = 534; y < Math.min(975, canvas.height); y += 2) {
        let strength = 0;
        for (let x = cx - 10; x <= cx + 10; x += 2) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels.data[i], g = pixels.data[i+1], b = pixels.data[i+2];
          const high = Math.max(r,g,b), low = Math.min(r,g,b);
          const saturation = high - low;
          if (high > 75 && saturation > 43) strength += saturation * (high / 255);
        }
        if (strength > best) { best = strength; bestY = y; }
      }
      // A missing marker is ambiguous, and must be checked by the player.
      if (best < 110 || bestY === null) { result.push(null); continue; }
      const depth = Math.max(0, (bestY - 540) / 4.3);
      const candidates = [10, 15, 30, 60, 85, 100];
      result.push(candidates.reduce((a, b) => Math.abs(depth - a) < Math.abs(depth - b) ? a : b));
    }
    return result;
  } finally { image.close(); }
}
