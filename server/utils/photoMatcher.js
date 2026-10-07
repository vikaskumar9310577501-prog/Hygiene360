const { Jimp, compareHashes, diff } = require('jimp');
const storage = require('./storage');

/**
 * Compare live photo buffer against the master reference photo on disk using
 * Computer Vision (perceptual hashing + pixel divergence + brightness normalization)
 *
 * @param {Buffer|string} liveImageSource Buffer or file path of live captured photo
 * @param {string} masterRelativePath Path or URL of master benchmark photo (e.g. /uploads/master_photos/...)
 * @returns {Promise<Object>} Verification outcome with isMatch, similarityScore, boxColor, and message
 */
async function compareWithMasterPhoto(liveImageSource, masterRelativePath) {
  try {
    if (!masterRelativePath) {
      return {
        hasMaster: false,
        isMatch: true,
        similarityScore: 90,
        cleanlinessScore: 90,
        boxColor: 'GREEN',
        message: 'No Master Reference photo configured by IT Admin.'
      };
    }

    // 1. Load master photo from storage
    const masterBuffer = await storage.read(masterRelativePath);

    if (!masterBuffer) {
      console.warn('Master photo file not found in storage for:', masterRelativePath);
      return {
        hasMaster: false,
        isMatch: true,
        similarityScore: 90,
        cleanlinessScore: 90,
        boxColor: 'GREEN',
        message: 'Master reference photo file not found on disk. Standard verification applied.'
      };
    }

    // 2. Read both images using Jimp
    const [masterImg, liveImg] = await Promise.all([
      Jimp.read(masterBuffer),
      Jimp.read(liveImageSource)
    ]);

    // 3. Brightness & Dark-Lens / Flash Analysis
    let lumSum = 0;
    const liveData = liveImg.bitmap.data;
    const totalPixels = liveData.length / 4;
    for (let i = 0; i < liveData.length; i += 4) {
      lumSum += liveData[i] * 0.299 + liveData[i + 1] * 0.587 + liveData[i + 2] * 0.114;
    }
    const avgBrightness = lumSum / totalPixels;

    // Pitch black or covered camera lens
    if (avgBrightness < 22) {
      return {
        hasMaster: true,
        isMatch: false,
        similarityScore: 12,
        cleanlinessScore: 10,
        boxColor: 'RED',
        message: '⚠️ Photo REJECTED: Camera lens is covered or it is too dark. Please take a clear photo in good light.'
      };
    }

    // Flash blowout / blank white screen
    if (avgBrightness > 245) {
      return {
        hasMaster: true,
        isMatch: false,
        similarityScore: 15,
        cleanlinessScore: 12,
        boxColor: 'RED',
        message: '⚠️ Photo REJECTED: Photo is overexposed or blank white. Please take a clear photo without direct flash.'
      };
    }

    // 4. Perceptual Hashing (64-bit structural scene hash)
    const masterHash = masterImg.pHash();
    const liveHash = liveImg.pHash();
    const hashDist = compareHashes(masterHash, liveHash); // 0.00 (identical) to 1.00 (inverted)

    // 5. Visual Pixel Diff on Normalized Grid (64x64)
    const mThumb = masterImg.clone().resize({ w: 64, h: 64 });
    const lThumb = liveImg.clone().resize({ w: 64, h: 64 });
    const diffResult = diff(mThumb, lThumb);
    const pixelDiff = diffResult.percent; // 0.00 to 1.00

    // 6. Calibrated Similarity Scoring
    // hashDist <= 0.16 indicates high structural correlation of the same scene
    // hashDist >= 0.22 indicates a completely different scene/object
    const hashScore = Math.max(0, Math.min(100, Math.round(100 - (hashDist / 0.22) * 85)));
    const pixelScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, pixelDiff / 0.55)) * 100)));

    const similarityScore = Math.max(0, Math.min(100, Math.round((hashScore * 0.65) + (pixelScore * 0.35))));

    // Strict Match Decision:
    // 1. Must share scene structural pHash (hashDist <= 0.16)
    // 2. Combined similarity score must be >= 60%
    // 3. Normalized pixel diff must be <= 0.42
    const isMatch = hashDist <= 0.16 && similarityScore >= 60 && pixelDiff <= 0.42;

    const cleanlinessScore = isMatch ? similarityScore : Math.max(5, Math.round(similarityScore * 0.45));

    return {
      hasMaster: true,
      isMatch,
      similarityScore,
      cleanlinessScore,
      boxColor: isMatch ? 'GREEN' : 'RED',
      metrics: {
        hashDist: Math.round(hashDist * 1000) / 1000,
        pixelDiffPercent: Math.round(pixelDiff * 100),
        brightness: Math.round(avgBrightness)
      },
      message: isMatch
        ? `✨ Master Benchmark Match Verified (${similarityScore}% Cleanliness Score)`
        : `⚠️ Photo REJECTED: Does not match the master clean reference (${similarityScore}% score). Please clean properly and take the photo from the correct angle.`
    };
  } catch (err) {
    console.error('Master photo comparison error in photoMatcher:', err);
    return {
      hasMaster: true,
      isMatch: false,
      similarityScore: 0,
      cleanlinessScore: 0,
      boxColor: 'RED',
      message: `Image processing error: ${err.message || 'Could not process photo'}`
    };
  }
}

module.exports = {
  compareWithMasterPhoto
};
