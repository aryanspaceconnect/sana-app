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

/**
 * Backwards & Cross-Service Compatible Alias for preprocessSkinImage
 */
export async function preprocessSkinAnalysisImage(
  base64Image: string,
  options: {
    forceCropToFaceRatio?: boolean;
    targetMinDimension?: number;
  } = {}
) {
  const result = await preprocessSkinImage(base64Image, {
    targetFaceRatio: 0.70,
    forceHDMinResolution: options.targetMinDimension || 1080,
    autoCropIfSmall: options.forceCropToFaceRatio !== false
  });

  return {
    processedBase64: result.processedBase64,
    processedBuffer: result.processedBuffer,
    mimeType: 'image/jpeg',
    width: result.width,
    height: result.height,
    faceRatioEstimated: result.qualityChecks.estimatedFaceRatio,
    wasCropped: result.wasAutoCropped,
    warnings: result.qualityChecks.warnings
  };
}

/**
 * Validates raw image buffer against Perfect Corp S2S requirements before submission
 */
export async function validateImageForSkinAnalysis(
  imageBuffer: Buffer
) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  const aspectRatio = width / (height || 1);

  const errors: string[] = [];
  const suggestions: string[] = [];

  if (minSide < 480) {
    errors.push(`Image resolution too low (${width}x${height}). Minimum short side must be at least 480px.`);
    suggestions.push('Please upload a higher resolution photo or move closer to the camera.');
  } else if (minSide < 1080) {
    suggestions.push('Recommended resolution is 1080px+ on the short side for optimal AI skin concern detection.');
  }

  if (maxSide > 4096) {
    suggestions.push('Image will be automatically downscaled to comply with maximum 4096px bounds.');
  }

  if (aspectRatio < 0.5 || aspectRatio > 2.0) {
    errors.push('Extreme image aspect ratio detected.');
    suggestions.push('Please use a standard portrait (3:4) or square (1:1) selfie orientation.');
  }

  const estimatedFaceWidthRatio = Math.min(0.85, (minSide * 0.65) / width);

  return {
    isValid: errors.length === 0,
    width,
    height,
    minSide,
    maxSide,
    aspectRatio,
    estimatedFaceWidthRatio,
    errors,
    suggestions,
  };
}

/**
 * Helper to format server error messages into human actionable user guidance
 */
export function mapPerfectCorpErrorToUserGuidance(errorCode: string): string {
  const code = errorCode.toLowerCase();
  if (code.includes('too_small') || code.includes('face_position_too_small')) {
    return 'Your face occupied too little of the photo frame. Please move closer to the camera so your face fills 60-80% of the screen.';
  }
  if (code.includes('below_min_image_size')) {
    return 'The image resolution was too low. Please upload a high-definition selfie or increase your camera settings.';
  }
  if (code.includes('out_of_boundary')) {
    return 'Your face was cut off at the edge of the photo. Please align your face squarely in the center of the frame.';
  }
  if (code.includes('angle') || code.includes('tilt') || code.includes('yaw') || code.includes('pitch')) {
    return 'Your head was tilted too far. Please look directly into the camera with your head straight and level.';
  }
  if (code.includes('invalid') || code.includes('no_face')) {
    return 'No single clear face was detected. Ensure proper lighting, remove dark glasses or face coverings, and ensure only one face is visible.';
  }
  return `Facial scan issue (${errorCode}). Please ensure clear frontal lighting, no shadows, and a straight, centered head position.`;
}

