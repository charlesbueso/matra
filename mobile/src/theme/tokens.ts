// ============================================================
// MATRA — Design Tokens
// ============================================================
// Warm light — creamy oak, living canopy, golden hour.
// Organic. Grounded. Alive.
// ============================================================

export const Colors = {
  // ── Warm Light Backgrounds ──
  background: {
    void: '#F7F2EA',       // Warm parchment — root bg
    abyss: '#FFFFFF',      // Pure white — card bg
    trench: '#F0EADE',     // Warm linen — container bg
    depth: '#EDE6D8',      // Slightly darker cream — elevated surface
    current: '#E5DDD0',    // Active/selected — warm sand
  },

  // ── Nature Accents ──
  accent: {
    cyan: '#6B8F3C',       // Primary — forest leaf green
    glow: '#8BAF5C',       // Secondary — spring green
    teal: '#7A9E4A',       // Blended green
    emerald: '#5A8C32',    // Success / growth — deep leaf
    amber: '#C49A3C',      // Warning / premium — golden oak
    coral: '#C4665A',      // Error / destructive — warm terracotta
    azure: '#8B7355',      // Info / links — warm brown
    seafoam: '#A0B878',    // Tertiary — sage
  },

  // ── Text ──
  text: {
    starlight: '#3B2E1E',  // Primary — rich bark brown
    moonlight: '#6B5D4F',  // Secondary — warm umber
    twilight: '#9B8E7E',   // Tertiary / placeholder — faded oak
    shadow: '#C4B9AB',     // Disabled text — pale bark
  },

  // ── Ancestral Graph ──
  graph: {
    lineActive: 'rgba(107, 143, 60, 0.6)',       // Active — green branch
    lineInactive: 'rgba(107, 143, 60, 0.18)',     // Inactive — faded branch
    nodeGlow: 'rgba(139, 175, 92, 0.35)',          // Node glow — spring green
    nodeCore: '#6B8F3C',                            // Node center — leaf green
    nodeRing: 'rgba(139, 175, 92, 0.25)',           // Node outer ring
  },

  // ── Gradients (as arrays for LinearGradient) ──
  gradients: {
    bioluminescent: ['#6B8F3C', '#8BAF5C'],          // Primary CTA — leaf green
    deepOcean: ['#F7F2EA', '#EDE6D8'],                // Background — warm cream
    tidal: ['#7A9E4A', '#A0B878'],                    // Green-sage gradient
    warmCurrent: ['#C49A3C', '#D4AA4C'],              // Warm golden gradient
    aurora: ['#6B8F3C', '#8BAF5C', '#A0B878'],        // Multi-stop green
    premium: ['#C49A3C', '#B8892E', '#A07828'],        // Gold premium gradient
  },

  // ── Semantic ──
  semantic: {
    success: '#5A8C32',
    warning: '#C49A3C',
    error: '#C4665A',
    info: '#6B8F3C',
  },

  // ── Overlay ──
  overlay: {
    light: 'rgba(107, 143, 60, 0.04)',
    medium: 'rgba(107, 143, 60, 0.08)',
    dark: 'rgba(59, 46, 30, 0.08)',
    heavy: 'rgba(59, 46, 30, 0.15)',
  },

  // ── Nature glow helpers ──
  bio: {
    cyanGlow: 'rgba(107, 143, 60, 0.12)',
    greenGlow: 'rgba(139, 175, 92, 0.10)',
    tealGlow: 'rgba(160, 184, 120, 0.08)',
  },
} as const;

export const Typography = {
  // ── Font Families ──
  fonts: {
    heading: 'SpaceGrotesk-Bold',
    subheading: 'SpaceGrotesk-Medium',
    body: 'Inter-Regular',
    bodyMedium: 'Inter-Medium',
    bodySemiBold: 'Inter-SemiBold',
    mono: 'JetBrainsMono-Regular',
  },

  // ── Font Sizes ──
  sizes: {
    hero: 36,
    h1: 28,
    h2: 24,
    h3: 20,
    h4: 17,
    body: 15,
    caption: 13,
    small: 11,
    micro: 9,
  },

  // ── Line Heights ──
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // ── Letter Spacing ──
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1.5,
    widest: 3,
  },
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 24,
  full: 9999,
} as const;

export const Shadows = {
  glow: {
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  glowGreen: {
    shadowColor: '#6B8F3C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  card: {
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  subtle: {
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

export const Animation = {
  duration: {
    instant: 100,
    fast: 250,
    normal: 400,
    slow: 700,
    glacial: 1400,
    drift: 3000,
  },
  easing: {
    // Slow, smooth ease-in-out — no spring bounce
    gentle: { damping: 28, stiffness: 80 },
    slow: { damping: 30, stiffness: 60 },
    drift: { damping: 35, stiffness: 40 },
  },
} as const;
