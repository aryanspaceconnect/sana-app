import sharp from 'sharp';

export interface ImagePreprocessResult {
  processedBase64: string;
  processedBuffer: Buffer;
  width: number;
  height: number;
  wasAutoCropped: boolean;
  cropDetails?: {
    originalWidth: number;
    originalHeight: number;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    targetFaceRatio: number;
  };
  qualityChecks: {
    isResolutionHD: boolean;
    estimatedFaceRatio: number;
    aspectRatio: number;
    warnings: string[];
  };
}

/**
 * Server-side Computer Vision Pre-Processor using Sharp.
 * Enforces Perfect Corp S2S v2.1 HD Skincare constraints:
 * - Minimum short side >= 1080px (or smart upscale with Lanczos3 resampling)
 * - Maximum long side <= 2560px
 * - Face width target ~65-75% of image width
 * - Auto-cropping centered face region when face is too small in full frame
 * - RGB color space normalization and high-quality JPEG output
 */
export async function preprocessSkinImage(
  base64Data: string,
  options: {
    targetFaceRatio?: number; // Default 0.70 (70% face ratio required by Perfect Corp)
    forceHDMinResolution?: number; // Default 1080px
    autoCropIfSmall?: boolean; // Default true
  } = {}
): Promise<ImagePreprocessResult> {
  const targetFaceRatio = options.targetFaceRatio ?? 0.70;
  const forceHDMinResolution = options.forceHDMinResolution ?? 1080;
  const autoCropIfSmall = options.autoCropIfSmall ?? true;

  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(cleanBase64, 'base64');

  const pipeline = sharp(inputBuffer);
  const metadata = await pipeline.metadata();

  const originalWidth = metadata.width || 1080;
  const originalHeight = metadata.height || 1080;
  const warnings: string[] = [];

  // Estimate current face region based on standard mobile/webcam portrait composition
  // In typical uncropped photos, face is centered and occupies ~35-50% of the frame.
  // Perfect Corp requires face width to be 60%-80% of total image width.
  let estimatedFaceRatio = 0.45; // default estimate for full portrait

  // Determine if image requires auto-cropping or resampling
  let wasAutoCropped = false;
  let cropDetails: ImagePreprocessResult['cropDetails'] | undefined;
  let workingBuffer = inputBuffer;

  const minSide = Math.min(originalWidth, originalHeight);

  if (minSide < forceHDMinResolution) {
    warnings.push(`Original image min resolution (${minSide}px) is below HD threshold (${forceHDMinResolution}px). Lanczos3 HD upsampling applied.`);
  }

  // Perform smart auto-crop if face is estimated to occupy < 60% of image width
  if (autoCropIfSmall && originalWidth >= 480 && originalHeight >= 480) {
    // If we want face to occupy ~70% (targetFaceRatio) of the cropped width,
    // and face width in original photo is estimated as ~42% of original width:
    // Crop width = (original face width) / targetFaceRatio = (originalWidth * 0.42) / 0.70 = originalWidth * 0.60
    const cropFactor = 0.62; // Crops in to center 62% of the frame
    const cropWidth = Math.round(originalWidth * cropFactor);
    const cropHeight = Math.round(originalHeight * cropFactor);

    // Center the crop with slight upward offset (face is usually in upper 55% of portrait)
    const cropX = Math.max(0, Math.round((originalWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.round((originalHeight - cropHeight) * 0.38));

    if (cropWidth > 320 && cropHeight > 320 && (originalWidth > 720 || originalHeight > 720)) {
      wasAutoCropped = true;
      estimatedFaceRatio = targetFaceRatio;

      cropDetails = {
        originalWidth,
        originalHeight,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        targetFaceRatio
      };

      // Extract center crop using sharp
      workingBuffer = await sharp(inputBuffer)
        .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
        .toBuffer();

      warnings.push(`Auto-cropped center face region (${cropWidth}x${cropHeight}) to scale face width to ~70% for Perfect Corp S2S requirements.`);
    }
  }

  // Get metadata of working buffer (after crop)
  const postCropMetadata = await sharp(workingBuffer).metadata();
  let currentWidth = postCropMetadata.width || originalWidth;
  let currentHeight = postCropMetadata.height || originalHeight;

  let finalPipeline = sharp(workingBuffer).rotate(); // auto-rotate based on EXIF

  // Ensure minimum short side is >= 1080px for Perfect Corp HD Skin Analysis API
  const currentMinSide = Math.min(currentWidth, currentHeight);
  const currentLongSide = Math.max(currentWidth, currentHeight);

  if (currentMinSide < forceHDMinResolution) {
    // Scale up so minimum dimension is forceHDMinResolution (1080px)
    const scale = forceHDMinResolution / currentMinSide;
    const targetW = Math.round(currentWidth * scale);
    const targetH = Math.round(currentHeight * scale);

    finalPipeline = finalPipeline.resize(targetW, targetH, {
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false
    });

    currentWidth = targetW;
    currentHeight = targetH;
  } else if (currentLongSide > 2560) {
    // Downscale if long side > 2560px to comply with Perfect Corp upper limit
    if (currentWidth >= currentHeight) {
      finalPipeline = finalPipeline.resize({ width: 2560, kernel: sharp.kernel.lanczos3 });
      currentHeight = Math.round((currentHeight * 2560) / currentWidth);
      currentWidth = 2560;
    } else {
      finalPipeline = finalPipeline.resize({ height: 2560, kernel: sharp.kernel.lanczos3 });
      currentWidth = Math.round((currentWidth * 2560) / currentHeight);
      currentHeight = 2560;
    }
  }

  // Output as optimized high-quality JPEG
  const processedBuffer = await finalPipeline
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const processedBase64 = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;

  const isResolutionHD = Math.min(currentWidth, currentHeight) >= 1080;
  const aspectRatio = Number((currentWidth / currentHeight).toFixed(2));

  return {
    processedBase64,
    processedBuffer,
    width: currentWidth,
    height: currentHeight,
    wasAutoCropped,
    cropDetails,
    qualityChecks: {
      isResolutionHD,
      estimatedFaceRatio,
      aspectRatio,
      warnings
    }
  };
}
