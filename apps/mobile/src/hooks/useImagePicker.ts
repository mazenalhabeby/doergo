import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

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

  const requestPermission = useCallback(async (type: 'camera' | 'library') => {
    const request = type === 'camera'
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const { status } = await request();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        `Please allow ${type === 'camera' ? 'camera' : 'photo library'} access in settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return false;
    }
    return true;
  }, []);

  const pickFromGallery = useCallback(async (): Promise<PickedImage[]> => {
    if (isPickerOpen) return [];
    const hasPermission = await requestPermission('library');
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

  const takePhoto = useCallback(async (): Promise<PickedImage | null> => {
    if (isPickerOpen) return null;
    const hasPermission = await requestPermission('camera');
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
