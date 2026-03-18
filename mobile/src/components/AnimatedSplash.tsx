import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import { Colors } from '../theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOGO_DISPLAY_MS = 800;

interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const [phase, setPhase] = useState<'logo' | 'lottie'>('logo');
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    const timer = setTimeout(() => setPhase('lottie'), LOGO_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleAnimationFinish = useCallback(() => {
    onFinish();
  }, [onFinish]);

  return (
    <View style={styles.container}>
      {phase === 'logo' ? (
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <LottieView
          ref={lottieRef}
          source={require('../../assets/lottie/loading_matra.json')}
          autoPlay
          loop={false}
          speed={0.3}
          style={styles.lottie}
          onAnimationFinish={handleAnimationFinish}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background.void,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  logo: {
    width: SCREEN_WIDTH * 0.4,
    height: SCREEN_WIDTH * 0.4,
  },
  lottie: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
  },
});
