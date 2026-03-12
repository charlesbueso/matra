const MAX_DIMENSION = 600;

/**
 * Resize an image so its largest side is at most MAX_DIMENSION pixels.
 * Returns the URI of the resized image.
 * Falls back to the original URI if expo-image-manipulator is unavailable (e.g. Expo Go).
 */
export async function resizeImageForUpload(uri: string): Promise<string> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    // Native module unavailable (Expo Go) — return original URI
    return uri;
  }
}
