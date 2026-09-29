import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

export type PickResult = { photos: Photo[] } | { denied: true };

/** Longest side sent to the model. Larger images cost more and are downscaled server-side anyway. */
const MAX_SIDE = 1568;
export const MAX_PHOTOS = 4;

function toPhotos(result: ImagePicker.ImagePickerResult): Photo[] {
  if (result.canceled) return [];
  return result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

export async function takePhoto(): Promise<PickResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { denied: true };
  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    return { photos: toPhotos(result) };
  } catch {
    // No camera available (simulator, some browsers): fall back to the library.
    return pickPhotos(1);
  }
}

export async function pickPhotos(limit: number): Promise<PickResult> {
  if (limit <= 0) return { photos: [] };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.9,
  });
  return { photos: toPhotos(result) };
}

/** Downscale and JPEG-encode a photo; returns base64 without a data-URL prefix. */
export async function encodePhoto(photo: Photo): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  const longest = Math.max(photo.width, photo.height);
  if (longest > MAX_SIDE) {
    context.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Could not encode photo');
  return saved.base64;
}
