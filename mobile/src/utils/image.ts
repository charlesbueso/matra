const MAX_DIMENSION = 600;

/**
 * Resize an image so its largest side is at most MAX_DIMENSION pixels.
 * Returns the URI of the resized image.
 */
export async function resizeImageForUpload(uri: string): Promise<string> {
  const ImageManipulator = await import('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}
