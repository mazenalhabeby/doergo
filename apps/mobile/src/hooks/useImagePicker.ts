import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaAccess } from '../permissions/media-access-host';
import type { MediaPurpose } from '../permissions/purposes';

export interface PickedImage {
  uri: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
}

function assetToPickedImage(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const ext = asset.uri.split('.').pop() || 'jpg';
  return {
    uri: asset.uri,
    fileName: asset.fileName || `photo_${Date.now()}.${ext}`,
    fileSize: asset.fileSize || 0,
    mimeType: asset.mimeType || `image/${ext}`,
    width: asset.width,
    height: asset.height,
  };
}

export function useImagePicker() {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  /*
    ⚠️ This was a hard-coded English `Alert.alert` in an app that ships five
    languages, and it said "allow it in settings" the FIRST time somebody
    declined — when simply asking again would have worked. It also made no case
    at all for why the camera was wanted.

    `requestMediaAccess` asks properly: it reads the CURRENT status first, asks
    only when asking can still succeed, and explains the purpose in the person's
    own language before sending anybody to Settings.
  */
  const requestPermission = useCallback(
    (type: 'camera' | 'library', purpose: MediaPurpose) => requestMediaAccess(type, purpose),
    [],
  );

  const pickFromGallery = useCallback(async (
    /* What the picture is FOR. Drives the wording of the permission sheet, so
       a profile picture is not explained as a job photo. */
    purpose: MediaPurpose = 'task-photo',
  ): Promise<PickedImage[]> => {
    if (isPickerOpen) return [];
    const hasPermission = await requestPermission('library', purpose);
    if (!hasPermission) return [];

    setIsPickerOpen(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 5,
      });

      if (result.canceled || !result.assets) return [];
      return result.assets.map(assetToPickedImage);
    } finally {
      setIsPickerOpen(false);
    }
  }, [isPickerOpen, requestPermission]);

  const takePhoto = useCallback(async (
    purpose: MediaPurpose = 'task-photo',
  ): Promise<PickedImage | null> => {
    if (isPickerOpen) return null;
    const hasPermission = await requestPermission('camera', purpose);
    if (!hasPermission) return null;

    setIsPickerOpen(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return null;
      return assetToPickedImage(result.assets[0]!);
    } finally {
      setIsPickerOpen(false);
    }
  }, [isPickerOpen, requestPermission]);

  return { pickFromGallery, takePhoto };
}
