const { Jimp, loadFont } = require('jimp');
const fonts = require('jimp/fonts');
const crypto = require('crypto');

let cachedFont16 = null;

async function getFont() {
  if (!cachedFont16) {
    cachedFont16 = await loadFont(fonts.SANS_16_WHITE);
  }
  return cachedFont16;
}

const LINE_HEIGHT = 22;
const CHAR_WIDTH = 9; // approximate advance of SANS_16

function fit(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3))}...` : text;
}

/**
 * Apply server-controlled tamper-evident stamp: User, Toilet ID, Date, Location / Plant, Submission time
 */
async function applyWatermark(imageBuffer, metadata) {
  const now = new Date();
  const {
    plantName = 'PLANT',
    toiletCode = 'TOILET',
    location = '',
    sessionCode = '',
    photoType = 'EVIDENCE',
    serverTimestampStr = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }),
    timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    uploadedBy = 'USER'
  } = metadata;

  const rawHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  try {
    const image = await Jimp.read(imageBuffer);
    const font = await getFont();

    const imgWidth = image.bitmap.width;
    const imgHeight = image.bitmap.height;
    const padX = 16;
    const maxChars = Math.max(20, Math.floor((imgWidth - padX * 2) / CHAR_WIDTH));

    const lines = [
      `HYGIENE360  |  ${String(photoType).toUpperCase()}`,
      `TOILET ID: ${String(toiletCode).toUpperCase()}`,
      `USER: ${uploadedBy}`,
      `LOCATION: ${location || plantName}`,
      `DATE: ${dateStr}  |  SUBMISSION TIME: ${timeStr} IST`,
      `REF: ${sessionCode || '-'}  |  HASH: ${rawHash.slice(0, 12)}`
    ].map(l => fit(l, maxChars));

    const bannerHeight = Math.min(imgHeight, lines.length * LINE_HEIGHT + 20);
    const bannerY = imgHeight - bannerHeight;

    // Darken the bottom band so the white stamp text stays readable on any photo
    for (let y = bannerY; y < imgHeight; y++) {
      for (let x = 0; x < imgWidth; x++) {
        const idx = (y * imgWidth + x) * 4;
        image.bitmap.data[idx] = Math.floor(image.bitmap.data[idx] * 0.15);
        image.bitmap.data[idx + 1] = Math.floor(image.bitmap.data[idx + 1] * 0.15);
        image.bitmap.data[idx + 2] = Math.floor(image.bitmap.data[idx + 2] * 0.2);
      }
    }

    let textY = bannerY + 10;
    for (const text of lines) {
      if (textY + 18 > imgHeight) break;
      image.print({ font, x: padX, y: textY, text });
      textY += LINE_HEIGHT;
    }

    const watermarkedBuffer = await image.getBuffer('image/jpeg');
    const finalHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');

    return {
      buffer: watermarkedBuffer,
      rawHash,
      finalHash,
      serverTimestampStr
    };
  } catch (err) {
    console.error('Watermark processing error, using fallback:', err);
    return {
      buffer: imageBuffer,
      rawHash,
      finalHash: rawHash,
      serverTimestampStr
    };
  }
}

module.exports = {
  applyWatermark
};
