/**
 * Icon Generator Script for RecordX
 * Run this in a browser console or Node.js canvas environment
 * to generate PNG icons from the SVG logo.
 * 
 * For quick setup, you can use any online SVG-to-PNG converter
 * with the logo.svg file, or run this script.
 * 
 * Required sizes: 16x16, 32x32, 48x48, 128x128
 */

const sizes = [16, 32, 48, 128];

function createIconSVG(size) {
  const scale = size / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a28"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FF6B6B"/>
      <stop offset="50%" style="stop-color:#EE5A24"/>
      <stop offset="100%" style="stop-color:#F0932B"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <circle cx="64" cy="64" r="20" fill="url(#accent)"/>
  <polygon points="58,50 58,78 78,64" fill="white"/>
</svg>`;
}

// In a browser environment:
async function generatePNG(size) {
  const svg = createIconSVG(size);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  const img = new Image();
  img.src = url;
  
  await new Promise(resolve => img.onload = resolve);
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  
  URL.revokeObjectURL(url);
  
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `icon-${size}.png`;
    a.click();
  }, 'image/png');
}

// Generate all sizes
// sizes.forEach(size => generatePNG(size));
console.log('Run generatePNG(size) in a browser to generate icons');
console.log('Sizes needed:', sizes);
