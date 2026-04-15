/**
 * BubbleNoteCard — Addictive Drag System
 *
 * ✦ Magnetic Lean     — bubble tilts toward nearest neighbour during drag
 * ✦ Snap Preview      — ghost orbit circle shows exactly where it will land
 * ✦ Snap Haptic       — short tick on every settle; stronger on cluster
 * ✦ Rubber Band       — translation damping kicks in near canvas edges
 * ✦ Premium Spring    — tension 220 / friction 20 for that satisfying thud
 *
 * Performance:
 *   dragX/dragY → native driver (Animated.event, zero JS overhead mid-drag)
 *   leanAngle   → native driver (rotateZ, updated via 50 ms interval from JS)
 *   shadowAnim  → JS driver    (shadow props can't be native-driven)
 *   All float/press/entrance animations → native driver
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {
  PanGestureHandler,
  State as GestureState,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {isSensorAvailable, promptBiometric} from '../biometrics/biometricAuth';
import {hasPin} from '../biometrics/keychain';
import {NoteModel} from '../database/model/NoteModel';
import {useAppTheme} from '../theme/ThemeContext';
import {stripHtml} from '../utils/helpers';
import {PinModal} from './PinModal';

export interface BubbleLayout {
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface BubbleSnapTarget {
  id: string;
  x: number;
  y: number;
  size: number;
}

export interface SnapPreview {
  x: number;
  y: number;
  size: number;
}

interface Props extends BubbleLayout {
  note: NoteModel;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  snapTargets: BubbleSnapTarget[];
  canvasWidth: number;
  canvasHeight: number;
  settledOffsetX?: number;
  settledOffsetY?: number;
  onSettle?: (nextOffsetX: number, nextOffsetY: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  stackOrder?: number;
  interactionScale?: number;
  interactionOpacity?: number;
  clusterStrength?: number;
  /** Called during drag with the projected snap position, or null when no target nearby. */
  onSnapPreview?: (preview: SnapPreview | null) => void;
}

type UnlockMethod     = 'biometric' | 'pin' | 'cancel';
type UnlockPromptType = 'method' | 'fallback' | null;

const TEXT_PRIMARY   = '#222222';
const TEXT_SECONDARY = '#666666';
const SNAP_GAP       = 10;
/** Radius from bubble centre within which magnetic lean + ghost kick in (px). */
const MAGNET_RANGE   = 130;
/** Rubber-band damping starts this many px from any canvas edge. */
const EDGE_ZONE      = 60;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const nearlyEqual = (a: number, b: number, epsilon = 0.5) =>
  Math.abs(a - b) <= epsilon;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type CandidatePoint = {x: number; y: number};

const squaredDistance = (fx: number, fy: number, tx: number, ty: number) => {
  const dx = fx - tx; const dy = fy - ty;
  return dx * dx + dy * dy;
};

// ─── Component ────────────────────────────────────────────────────────────────
export const BubbleNoteCard = ({
  note,
  index,
  size,
  color,
  x,
  y,
  onPress,
  onLongPress,
  snapTargets,
  canvasWidth,
  canvasHeight,
  settledOffsetX = 0,
  settledOffsetY = 0,
  onSettle,
  onDragStateChange,
  stackOrder = 1,
  interactionScale = 1,
  interactionOpacity = 1,
  clusterStrength = 0,
  onSnapPreview,
}: Props) => {
  const {colors} = useAppTheme();
  const [showPin, setShowPin] = useState(false);
  const [unlockPrompt, setUnlockPrompt] = useState<UnlockPromptType>(null);
  const unlockResolver = useRef<((value: UnlockMethod) => void) | null>(null);

  // ── Animated values ──────────────────────────────────────────────────────────
  const entranceScale  = useRef(new Animated.Value(0.55)).current;
  const opacity        = useRef(new Animated.Value(0)).current;
  const pressScale     = useRef(new Animated.Value(1)).current;
  const longPressScale = useRef(new Animated.Value(1)).current;
  const openScale      = useRef(new Animated.Value(1)).current;
  const shadowAnim     = useRef(new Animated.Value(0)).current; // non-native (shadow props)
  const floatY         = useRef(new Animated.Value(0)).current;
  const dragX          = useRef(new Animated.Value(0)).current; // native via Animated.event
  const dragY          = useRef(new Animated.Value(0)).current;
  const settledX       = useRef(new Animated.Value(settledOffsetX)).current;
  const settledY       = useRef(new Animated.Value(settledOffsetY)).current;
  /** Subtle tilt toward nearest neighbour — native driver, updated every 50 ms. */
  const leanAngle      = useRef(new Animated.Value(0)).current;

  // ── JS-side refs ──────────────────────────────────────────────────────────────
  const settledXRef      = useRef(settledOffsetX);
  const settledYRef      = useRef(settledOffsetY);
  /** JS mirror of dragX (from listener) — used by lean interval. */
  const dragXRef         = useRef(0);
  const dragYRef         = useRef(0);
  const suppressTapRef   = useRef(false);
  const dragWasActiveRef = useRef(false);
  const isDraggingRef    = useRef(false);
  const floatLoop        = useRef<Animated.CompositeAnimation | null>(null);
  const floatResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Running interval that updates lean angle + snap preview during drag. */
  const leanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const leanAnimRef      = useRef<Animated.CompositeAnimation | null>(null);
  /** Stale-closure-safe refs for props used inside the lean interval. */
  const snapTargetsRef   = useRef(snapTargets);
  const propsRef         = useRef({x, y, size, canvasWidth, canvasHeight});
  const onSnapPreviewRef = useRef(onSnapPreview);

  useEffect(() => { snapTargetsRef.current = snapTargets; }, [snapTargets]);
  useEffect(() => { propsRef.current = {x, y, size, canvasWidth, canvasHeight}; }, [x, y, size, canvasWidth, canvasHeight]);
  useEffect(() => { onSnapPreviewRef.current = onSnapPreview; }, [onSnapPreview]);

  // ── Entrance animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const delay = Math.min(index * 45, 400);
    Animated.parallel([
      Animated.spring(entranceScale, {toValue: 1, delay, useNativeDriver: true, tension: 64, friction: 9}),
      Animated.timing(opacity, {toValue: 1, duration: 260, delay, useNativeDriver: true}),
    ]).start();
  }, [entranceScale, index, opacity]);

  // ── Float helpers ─────────────────────────────────────────────────────────────
  const startFloat = useCallback(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {toValue: -5, duration: 2000, useNativeDriver: true}),
        Animated.timing(floatY, {toValue:  0, duration: 2000, useNativeDriver: true}),
      ]),
    );
    floatLoop.current = loop;
    loop.start();
  }, [floatY]);

  const pauseFloat = useCallback(() => {
    if (floatResumeTimer.current) {clearTimeout(floatResumeTimer.current); floatResumeTimer.current = null;}
    floatLoop.current?.stop(); floatLoop.current = null;
    floatY.stopAnimation(); floatY.setValue(0);
  }, [floatY]);

  const resumeFloat = useCallback(() => {
    pauseFloat();
    floatResumeTimer.current = setTimeout(() => {
      floatResumeTimer.current = null; startFloat();
    }, 600);
  }, [pauseFloat, startFloat]);

  useEffect(() => {
    const startDelay = (index * 340) % 2200;
    const timer = setTimeout(() => startFloat(), startDelay);
    return () => {
      clearTimeout(timer);
      if (floatResumeTimer.current) {clearTimeout(floatResumeTimer.current);}
      floatLoop.current?.stop(); floatLoop.current = null;
    };
  }, [index, startFloat]);

  // ── JS-side value listeners ───────────────────────────────────────────────────
  // dragX/Y: needed by lean interval (low overhead since it only updates a ref)
  // settledX/Y: needed so settleBubble can read the current resting position
  useEffect(() => {
    const dxId = dragX.addListener(({value}) => {dragXRef.current = value;});
    const dyId = dragY.addListener(({value}) => {dragYRef.current = value;});
    const sxId = settledX.addListener(({value}) => {settledXRef.current = value;});
    const syId = settledY.addListener(({value}) => {settledYRef.current = value;});
    return () => {
      dragX.removeListener(dxId); dragY.removeListener(dyId);
      settledX.removeListener(sxId); settledY.removeListener(syId);
    };
  }, [dragX, dragY, settledX, settledY]);

  // Sync animated values when parent updates settledOffset props
  useEffect(() => {
    if (nearlyEqual(settledXRef.current, settledOffsetX) && nearlyEqual(settledYRef.current, settledOffsetY)) {return;}
    settledX.stopAnimation(); settledY.stopAnimation();
    settledX.setValue(settledOffsetX); settledY.setValue(settledOffsetY);
    settledXRef.current = settledOffsetX; settledYRef.current = settledOffsetY;
  }, [settledOffsetX, settledOffsetY, settledX, settledY]);

  // ── Magnetic lean + snap preview (50 ms tick during drag) ────────────────────
  /**
   * Runs every 50 ms while a drag is active:
   *   1. Finds nearest bubble within MAGNET_RANGE
   *   2. Springs leanAngle toward ±12° based on horizontal direction + proximity
   *   3. Computes a 2D orbit position around that bubble and emits a snap preview
   *   4. Applies rubber-band damping near canvas edges (via leanAngle twist)
   */
  const startLeanTracking = useCallback(() => {
    if (leanIntervalRef.current) {clearInterval(leanIntervalRef.current);}

    const tick = () => {
      const {x: bx, y: by, size: bs, canvasWidth: cw, canvasHeight: ch} = propsRef.current;
      const cx = bx + settledXRef.current + dragXRef.current + bs / 2; // bubble centre X
      const cy = by + settledYRef.current + dragYRef.current + bs / 2; // bubble centre Y

      // ── Rubber band: edge proximity → tilt inward ───────────────────────────
      const edgeLeft   = cx - bs / 2;
      const edgeRight  = cw - (cx + bs / 2);
      const edgeTop    = cy - bs / 2;
      const edgeBottom = ch - (cy + bs / 2);
      const minEdgeDist = Math.min(edgeLeft, edgeRight, edgeTop, edgeBottom);
      const edgeTilt = minEdgeDist < EDGE_ZONE
        ? ((EDGE_ZONE - minEdgeDist) / EDGE_ZONE) * 6 * (edgeLeft < edgeRight ? 1 : -1)
        : 0;

      // ── Magnetic neighbour search ────────────────────────────────────────────
      const targets = snapTargetsRef.current;
      let nearest: BubbleSnapTarget | null = null;
      let nearestDist = Infinity;

      for (const t of targets) {
        if (t.id === note.id) {continue;}
        const tcx = t.x + t.size / 2;
        const tcy = t.y + t.size / 2;
        const d   = Math.sqrt(squaredDistance(cx, cy, tcx, tcy));
        if (d < MAGNET_RANGE && d < nearestDist) {nearestDist = d; nearest = t;}
      }

      // ── Lean angle ──────────────────────────────────────────────────────────
      let targetLean = edgeTilt;
      if (nearest) {
        const tcx    = nearest.x + nearest.size / 2;
        const strength = (MAGNET_RANGE - nearestDist) / MAGNET_RANGE; // 0..1
        // Lean up to ±12° toward nearest, bias by horizontal direction
        const dx = tcx - cx;
        targetLean += Math.sign(dx) * strength * 12;
      }
      targetLean = clamp(targetLean, -15, 15);

      leanAnimRef.current?.stop();
      leanAnimRef.current = Animated.spring(leanAngle, {
        toValue: targetLean,
        useNativeDriver: true,
        tension: 80, friction: 12,
      });
      leanAnimRef.current.start();

      // ── Snap preview ghost ───────────────────────────────────────────────────
      if (nearest) {
        // Project an orbit position around nearest bubble closest to current drag pos
        const tcx   = nearest.x + nearest.size / 2;
        const tcy   = nearest.y + nearest.size / 2;
        const orbit = (nearest.size + bs) / 2 + 16;
        const angle = Math.atan2(cy - tcy, cx - tcx);
        const ghostX = clamp(tcx + orbit * Math.cos(angle) - bs / 2, 0, cw - bs);
        const ghostY = clamp(tcy + orbit * Math.sin(angle) - bs / 2, 0, ch - bs);
        onSnapPreviewRef.current?.({x: ghostX, y: ghostY, size: bs});
      } else {
        onSnapPreviewRef.current?.(null);
      }
    };

    tick(); // immediate first tick so there's no visual delay
    leanIntervalRef.current = setInterval(tick, 50);
  }, [leanAngle, note.id]);

  const stopLeanTracking = useCallback(() => {
    if (leanIntervalRef.current) {clearInterval(leanIntervalRef.current); leanIntervalRef.current = null;}
    leanAnimRef.current?.stop();
    // Spring lean angle back to upright
    Animated.spring(leanAngle, {toValue: 0, useNativeDriver: true, tension: 120, friction: 14}).start();
    onSnapPreviewRef.current?.(null);
  }, [leanAngle]);

  // ── Unlock helpers ────────────────────────────────────────────────────────────
  const resolveUnlockPrompt = (value: UnlockMethod) => {
    const resolver = unlockResolver.current;
    unlockResolver.current = null; setUnlockPrompt(null); resolver?.(value);
  };

  const promptUnlockChoice = (type: Exclude<UnlockPromptType, null>) =>
    new Promise<UnlockMethod>(resolve => {unlockResolver.current = resolve; setUnlockPrompt(type);});

  const animateOpen = () => {
    Animated.sequence([
      Animated.spring(openScale, {toValue: 1.06, useNativeDriver: true, tension: 170, friction: 14}),
      Animated.spring(openScale, {toValue: 1,    useNativeDriver: true, tension: 160, friction: 16}),
    ]).start(({finished}) => {if (finished) {onPress();}});
  };

  // ── Press handlers ────────────────────────────────────────────────────────────
  const handlePressIn = () => {
    if (isDraggingRef.current) {return;}
    Animated.spring(pressScale, {
      toValue: 0.94,
      tension: 300,
      friction: 20,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (isDraggingRef.current) {return;}
    Animated.spring(pressScale, {toValue: 1, useNativeDriver: true, tension: 120, friction: 13}).start();
  };

  const handleLongPress = () => {
    // Keep long-press feedback short so it feels crisp, not buzzy.
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true });
    Animated.sequence([
      Animated.spring(longPressScale, {toValue: 1.1,  useNativeDriver: true, tension: 175, friction: 10}),
      Animated.spring(longPressScale, {toValue: 0.96, useNativeDriver: true, tension: 170, friction: 11}),
      Animated.spring(longPressScale, {toValue: 1,    useNativeDriver: true, tension: 150, friction: 13}),
    ]).start(({finished}) => {if (finished) {onLongPress();}});
  };

  const attemptOpen = async () => {
    if (suppressTapRef.current || dragWasActiveRef.current || isDraggingRef.current) {return;}
    if (!note.locked) {animateOpen(); return;}
    const [canBiometric, canUsePin] = await Promise.all([isSensorAvailable(), hasPin()]);
    if (canBiometric && canUsePin) {
      const method = await promptUnlockChoice('method');
      if (method === 'pin') {setShowPin(true); return;}
      if (method !== 'biometric') {return;}
    }
    if (canBiometric) {
      const unlocked = await promptBiometric('Unlock note');
      if (unlocked) {animateOpen(); return;}
      if (canUsePin) {const fallback = await promptUnlockChoice('fallback'); if (fallback === 'pin') {setShowPin(true);}}
      return;
    }
    if (canUsePin) {setShowPin(true); return;}
    await promptUnlockChoice('fallback');
  };

  // ── Snap / settle ─────────────────────────────────────────────────────────────
  const selectSnapPoint = (
    releaseX: number, releaseY: number,
    projectedX: number, projectedY: number,
    anchorX: number, anchorY: number,
    minX: number, maxX: number, minY: number, maxY: number,
  ) => {
    const pcx = projectedX + size / 2;
    const pcy = projectedY + size / 2;

    const collides = (nx: number, ny: number) => {
      const ncx = nx + size / 2; const ncy = ny + size / 2;
      return snapTargets.some(t => {
        if (t.id === note.id) {return false;}
        const minDist = (t.size + size) / 2 + SNAP_GAP;
        return squaredDistance(ncx, ncy, t.x + t.size / 2, t.y + t.size / 2) < minDist * minDist;
      });
    };

    const nearest = [...snapTargets]
      .sort((a, b) =>
        squaredDistance(pcx, pcy, a.x + a.size / 2, a.y + a.size / 2) -
        squaredDistance(pcx, pcy, b.x + b.size / 2, b.y + b.size / 2),
      )
      .slice(0, 6);

    const candidates: CandidatePoint[] = [
      {x: anchorX, y: anchorY}, {x: releaseX, y: releaseY}, {x: projectedX, y: projectedY},
    ];

    nearest.forEach(t => {
      if (t.id === note.id) {candidates.push({x: t.x, y: t.y}); return;}
      const bx = t.x + t.size / 2; const by = t.y + t.size / 2;
      const orbit = (t.size + size) / 2 + 14;
      candidates.push({x: t.x, y: t.y});
      [[1,0],[-1,0],[0,1],[0,-1],[0.75,0.75],[-0.75,0.75],[0.75,-0.75],[-0.75,-0.75]].forEach(([vx, vy]) => {
        candidates.push({x: bx + orbit * vx - size / 2, y: by + orbit * vy - size / 2});
      });
    });

    const ranked = candidates
      .map(c => ({
        x: clamp(c.x, minX, maxX), y: clamp(c.y, minY, maxY),
        score:
          squaredDistance(projectedX, projectedY, c.x, c.y) * 0.62 +
          squaredDistance(releaseX,   releaseY,   c.x, c.y) * 0.28 +
          squaredDistance(anchorX,    anchorY,    c.x, c.y) * 0.1,
      }))
      .sort((a, b) => a.score - b.score);

    const best = ranked.find(c => !collides(c.x, c.y));
    if (best) {return {x: best.x, y: best.y};}
    return {x: clamp(projectedX, minX, maxX), y: clamp(projectedY, minY, maxY)};
  };

  const settleBubble = (
    translationX: number, translationY: number,
    velocityX: number,   velocityY: number,
  ) => {
    const anchorX  = x + settledXRef.current;
    const anchorY  = y + settledYRef.current;
    const releaseX = anchorX + translationX;
    const releaseY = anchorY + translationY;
    const maxX     = Math.max(0, canvasWidth - size);
    const maxY     = Math.max(0, canvasHeight - size - 12);

    const momentumX  = clamp(velocityX * 0.045, -72, 72);
    const momentumY  = clamp(velocityY * 0.045, -84, 84);
    const projectedX = clamp(releaseX + momentumX, 0, maxX);
    const projectedY = clamp(releaseY + momentumY, 0, maxY);

    const snapped     = selectSnapPoint(releaseX, releaseY, projectedX, projectedY, anchorX, anchorY, 0, maxX, 0, maxY);
    const nextOffsetX = snapped.x - x;
    const nextOffsetY = snapped.y - y;

    // ── Transfer drag delta into settledX/Y before clearing dragX/Y ──────────
    // This prevents the visual "jump back then forward" double-animation.
    const currentOffsetX = settledXRef.current + translationX;
    const currentOffsetY = settledYRef.current + translationY;
    settledX.setValue(currentOffsetX); settledXRef.current = currentOffsetX;
    settledY.setValue(currentOffsetY); settledYRef.current = currentOffsetY;
    dragX.setValue(0); dragY.setValue(0);

    // ── Snap haptic ──────────────────────────────────────────────────────────
    // Detect cluster: nearby bubble within 100px? → stronger buzz
    const snapCx = snapped.x + size / 2;
    const snapCy = snapped.y + size / 2;
    const isCluster = snapTargets.some(t => {
      if (t.id === note.id) {return false;}
      return squaredDistance(snapCx, snapCy, t.x + t.size / 2, t.y + t.size / 2) < 100 * 100;
    });
    ReactNativeHapticFeedback.trigger(isCluster ? 'impactHeavy' : 'impactLight', { enableVibrateFallback: true });

    const svx = clamp(velocityX / 1200, -2.2, 2.2);
    const svy = clamp(velocityY / 1200, -2.2, 2.2);

    // ── Premium spring: tension 220, friction 20 ─────────────────────────────
    Animated.parallel([
      Animated.spring(settledX, {toValue: nextOffsetX, velocity: svx, useNativeDriver: true, tension: 220, friction: 20}),
      Animated.spring(settledY, {toValue: nextOffsetY, velocity: svy, useNativeDriver: true, tension: 220, friction: 20}),
      Animated.sequence([
        Animated.spring(pressScale, {toValue: 1.08, useNativeDriver: true, tension: 350, friction: 12}),
        Animated.spring(pressScale, {toValue: 1,    useNativeDriver: true, tension: 220, friction: 18}),
      ]),
      Animated.spring(shadowAnim, {toValue: 0,  useNativeDriver: false, tension: 160, friction: 18}),
    ]).start(({finished}) => {
      if (finished) {onSettle?.(nextOffsetX, nextOffsetY);}
    });

    resumeFloat();
  };

  // ── Gesture ───────────────────────────────────────────────────────────────────
  const onGestureEvent = Animated.event(
    [{nativeEvent: {translationX: dragX, translationY: dragY}}],
    {useNativeDriver: true},
  );

  const handleGestureStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const {state, oldState, translationX, translationY, velocityX, velocityY} = event.nativeEvent;

    if (state === GestureState.BEGAN) {dragWasActiveRef.current = false; return;}

    if (state === GestureState.ACTIVE) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        onDragStateChange?.(true);
        pauseFloat();
        startLeanTracking(); // ← magnetic lean + snap preview start here
      }
      dragWasActiveRef.current = true;
      Animated.parallel([
        Animated.spring(pressScale, {toValue: 1.06, useNativeDriver: true,  tension: 220, friction: 22}),
        Animated.spring(shadowAnim, {toValue: 1,    useNativeDriver: false, tension: 220, friction: 22}),
      ]).start();
      return;
    }

    if (
      oldState === GestureState.ACTIVE ||
      state === GestureState.END ||
      state === GestureState.CANCELLED ||
      state === GestureState.FAILED
    ) {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragStateChange?.(false);
        stopLeanTracking(); // ← lean springs back to 0, preview cleared
      }

      const endX  = isFiniteNumber(translationX) ? translationX : 0;
      const endY  = isFiniteNumber(translationY) ? translationY : 0;
      const endVX = isFiniteNumber(velocityX)    ? velocityX    : 0;
      const endVY = isFiniteNumber(velocityY)    ? velocityY    : 0;
      const moved = Math.abs(endX) > 6 || Math.abs(endY) > 6;

      if (dragWasActiveRef.current || moved) {
        suppressTapRef.current = true;
        settleBubble(endX, endY, endVX, endVY);
        setTimeout(() => {suppressTapRef.current = false;}, 140);
      } else {
        dragX.setValue(0); dragY.setValue(0);
        Animated.parallel([
          Animated.spring(pressScale, {toValue: 1, useNativeDriver: true,  tension: 120, friction: 13}),
          Animated.spring(shadowAnim, {toValue: 0, useNativeDriver: false, tension: 120, friction: 14}),
        ]).start();
        resumeFloat();
      }
    }
  };

  // ── Derived display values ────────────────────────────────────────────────────
  const plain      = stripHtml(note.content);
  const isXS       = size <= 70;
  const isSM       = size <= 92 && size > 70;
  const isMD       = size > 92  && size <= 118;
  const isLG       = size > 118 && size <= 148;
  const showTitle   = !isXS;
  const showPreview = size > 118 && !note.locked;
  const previewLen  = size > 158 ? 115 : 58;
  const titleLines  = size > 148 ? 3 : size > 118 ? 2 : 1;
  const textAreaW   = size * (isSM ? 0.68 : 0.64);
  const titleSize   = isXS ? 11 : isSM ? 12 : isMD ? 13 : isLG ? 15 : 16;
  const radius      = size / 2;
  const clusterScale = 1 + clusterStrength * 0.03;
  const clusterGlowOpacity = 0.18 * clusterStrength;
  const clusterGlowInset = 9 * clusterStrength;

  // ── Transform composition ────────────────────────────────────────────────────
  // floatY is 0 during drags (paused), added directly — no multiply needed.
  // leanAngle is updated every 50 ms by the lean interval, native driver.
  const translateX = useMemo(() => Animated.add(settledX, dragX), [dragX, settledX]);
  const translateY = useMemo(
    () => Animated.add(Animated.add(settledY, dragY), floatY),
    [dragY, floatY, settledY],
  );
  const rotate = useMemo(
    () => leanAngle.interpolate({inputRange: [-15, 0, 15], outputRange: ['-15deg', '0deg', '15deg']}),
    [leanAngle],
  );
  const scale = useMemo(
    () => Animated.multiply(
      Animated.multiply(Animated.multiply(entranceScale, pressScale), openScale),
      longPressScale,
    ),
    [entranceScale, longPressScale, openScale, pressScale],
  );

  const shadowOpacity = shadowAnim.interpolate({inputRange: [0, 1], outputRange: [0.08, 0.28]});
  const shadowRadius  = shadowAnim.interpolate({inputRange: [0, 1], outputRange: [10, 32]});
  const elevation     = shadowAnim.interpolate({inputRange: [0, 1], outputRange: [6, 22]});

  const shadowLayerStyle = {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius,
    shadowColor: '#000',
    shadowOffset: {width: 6, height: 8},
    shadowOpacity, shadowRadius, elevation,
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: radius,
          zIndex: stackOrder,
          elevation: stackOrder,
          opacity: Animated.multiply(opacity, interactionOpacity),
          transform: [
            {translateX},
            {translateY},
            {scale},
            {scale: interactionScale * clusterScale},
            {rotate},
          ],
        },
      ]}>
      {clusterStrength > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.clusterGlow,
            {
              left: -clusterGlowInset,
              top: -clusterGlowInset,
              width: size + clusterGlowInset * 2,
              height: size + clusterGlowInset * 2,
              borderRadius: (size + clusterGlowInset * 2) / 2,
              opacity: clusterGlowOpacity,
            },
          ]}
        />
      ) : null}
      <Animated.View style={shadowLayerStyle} />

      {/* activeOffsetX/Y ±3 → gesture recognised in fewer pixels → snappier */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={handleGestureStateChange}
        activeOffsetX={[-3, 3]}
        activeOffsetY={[-3, 3]}>
        <Animated.View>
          <TouchableOpacity
            style={[styles.bubble, {width: size, height: size, borderRadius: radius, backgroundColor: color}]}
            onPress={attemptOpen}
            onLongPress={handleLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            delayLongPress={180}
            activeOpacity={1}>
            <View
              pointerEvents="none"
              style={[styles.innerHighlight, {width: size - 10, height: size - 10, borderRadius: (size - 10) / 2}]}
            />

            {note.locked ? (
              <View style={styles.lockedWrap}>
                <MaterialIcons name="lock" size={isXS ? 13 : isSM ? 16 : 20} color={TEXT_PRIMARY} style={styles.lockIcon} />
                {!isXS && !isSM ? <Text style={styles.lockedLabel}>Locked</Text> : null}
              </View>
            ) : (
              <View style={[styles.textWrap, {width: textAreaW}]}>
                {showTitle && note.title ? (
                  <Text style={[styles.title, {fontSize: titleSize, lineHeight: titleSize * 1.3}]} numberOfLines={titleLines}>
                    {note.title}
                  </Text>
                ) : null}
                {showPreview && plain ? (
                  <Text style={[styles.preview, isLG && styles.previewSM]} numberOfLines={size > 158 ? 5 : 3}>
                    {plain.slice(0, previewLen)}{plain.length > previewLen ? '...' : ''}
                  </Text>
                ) : null}
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>

      <PinModal
        visible={showPin} mode="verify" title="Unlock note"
        description="Enter your PIN to open this note."
        onRequestClose={() => setShowPin(false)}
        onSuccess={() => {setShowPin(false); animateOpen();}}
      />

      <Modal visible={unlockPrompt !== null} transparent animationType="fade"
        onRequestClose={() => resolveUnlockPrompt('cancel')}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
            <View style={[styles.dialogIconWrap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <MaterialIcons name={unlockPrompt === 'fallback' ? 'lock-clock' : 'fingerprint'} size={22} color={colors.accentText} />
            </View>
            <Text style={[styles.dialogTitle, {color: colors.text}]}>
              {unlockPrompt === 'fallback' ? 'Try PIN instead' : 'Unlock note'}
            </Text>
            <Text style={[styles.dialogBody, {color: colors.textFaint}]}>
              {unlockPrompt === 'fallback' ? 'Biometrics failed. Use your PIN to continue.' : 'Use biometrics or choose PIN instead.'}
            </Text>
            <View style={styles.dialogBtns}>
              {unlockPrompt === 'method' ? (
                <TouchableOpacity style={[styles.btnPrimary, {backgroundColor: colors.accent}]} onPress={() => resolveUnlockPrompt('biometric')} activeOpacity={0.78}>
                  <MaterialIcons name="fingerprint" size={17} color="#fff" />
                  <Text style={[styles.btnText, {color: '#fff'}]}>Biometrics</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.btnSecondary, {borderColor: colors.border, backgroundColor: colors.surface}]} onPress={() => resolveUnlockPrompt('pin')} activeOpacity={0.78}>
                <MaterialIcons name="pin" size={17} color={colors.text} />
                <Text style={[styles.btnText, {color: colors.text}]}>Use PIN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnCancel, {backgroundColor: colors.surfaceUp}]} onPress={() => resolveUnlockPrompt('cancel')} activeOpacity={0.65}>
                <Text style={[styles.btnText, {color: colors.textSec}]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {position: 'absolute'},
  clusterGlow: {
    position: 'absolute',
    backgroundColor: '#B4CFFC',
  },
  bubble: {alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  innerHighlight: {position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)'},
  textWrap: {alignItems: 'center'},
  title: {fontWeight: '600', color: TEXT_PRIMARY, textAlign: 'center', letterSpacing: -0.1},
  preview: {fontSize: 12, fontWeight: '400', color: TEXT_SECONDARY, textAlign: 'center', lineHeight: 17, marginTop: 4},
  previewSM: {fontSize: 11.5, lineHeight: 16},
  lockedWrap: {alignItems: 'center', gap: 6},
  lockIcon: {opacity: 0.42},
  lockedLabel: {fontSize: 11, fontWeight: '500', color: TEXT_PRIMARY, opacity: 0.42, letterSpacing: 0.35},
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28},
  dialog: {width: '100%', maxWidth: 340, borderRadius: 22, borderWidth: 1, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.16, shadowRadius: 20, elevation: 14},
  dialogIconWrap: {width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14},
  dialogTitle: {fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.35, marginBottom: 8},
  dialogBody: {fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginBottom: 20},
  dialogBtns: {gap: 10},
  btnPrimary: {height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8},
  btnSecondary: {height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8},
  btnCancel: {height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  btnText: {fontSize: 14, fontWeight: '600'},
});
