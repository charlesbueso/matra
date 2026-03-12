import React from 'react';
import { Modal, View, Pressable, Text, StyleSheet, StatusBar } from 'react-native';
import { Image } from 'expo-image';

interface AvatarViewerProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  name?: string;
}

export function AvatarViewer({ visible, uri, onClose, name }: AvatarViewerProps) {
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.container}>
          {name && <Text style={styles.name}>{name}</Text>}
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={200}
          />
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    aspectRatio: 1,
    alignItems: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
});
