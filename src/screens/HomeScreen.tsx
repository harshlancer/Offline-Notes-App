/**
 * HomeScreen — Interactive Note Canvas
 *
 * Visual design principles:
 *   - Warm neutral background (#F2EFEA in light, dark in dark mode)
 *   - Organic 3-column bubble packing with size-sequence hierarchy
 *   - Ghost-style action icons (white pill, soft shadow, no hard border)
 *   - Minimal pill search bar (pure white, soft shadow)
 *   - FAB: muted soft-purple circle, subtle shadow — no glow or gradients
 *   - No grids, no harsh shadows, no saturated colours
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDatabase} from '@nozbe/watermelondb/react';
import {SafeAreaView} from 'react-native-safe-area-context';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type {RootStack} from '../../App';
import {useAppLock} from '../biometrics/AppLockContext';
import {isSensorAvailable, promptBiometric} from '../biometrics/biometricAuth';
import {hasPin} from '../biometrics/keychain';
import {PinModal} from '../components/PinModal';
import {DeleteModal} from '../components/DeleteModal';
import {EmptyState} from '../components/EmptyState';
import {BubbleNoteCard} from '../components/BubbleNoteCard';
import type {
  BubbleLayout,
  BubbleSnapTarget,
  SnapPreview,
} from '../components/BubbleNoteCard';
import {NoteCard} from '../components/NoteCard';
import {ActionMenuModal} from '../components/ActionMenuModal';
import {AuthModal} from '../components/AuthModal';
import {LayoutPickerModal} from '../components/LayoutPickerModal';
import {ThemeSwitchButton} from '../components/ThemeSwitchButton';
import {NoteModel} from '../database/model/NoteModel';
import {deleteNoteById, observeNotes, saveNote} from '../database/notes';
import {firebaseConfig} from '../sync/firebaseConfig';
import {
  createUserWithEmailAndPassword,
  getAuthInstance,
  initFirebase,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOutFirebase,
} from '../sync/firebaseClient';
import {disableSync, enableSyncForUser} from '../sync/syncEngine';
import {BUBBLE_COLORS, NOTE_COLORS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import {getGreeting, stripHtml} from '../utils/helpers';

type Props = {navigation: NativeStackNavigationProp<RootStack, 'Home'>};
type BubbleOffsetMap = Record<string, {x: number; y: number}>;
type ActiveSnapPreview = (SnapPreview & {noteId: string; color: string}) | null;

const DRAG_DEEMPHASIS_SCALE = 0.97;
const DRAG_DEEMPHASIS_OPACITY = 0.85;
const ACTIVE_DRAG_Z_INDEX = 100;
const CLUSTER_DISTANCE_THRESHOLD = 132;

// ─── Layout constants ─────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 12;   // canvas left/right margin
const V_GAP = 12;   // minimum vertical gap between bubbles
const TOP_INSET = 26;

// ─── Bubble size tiers ────────────────────────────────────────────────────────
const SZ = {XL: 175, LG: 140, MD: 112, SM: 86, XS: 66} as const;

/**
 * Score a single note by its content weight.
 *   • Title chars are worth 1.5× (titles signal importance)
 *   • Each content char adds 1 pt
 *   • Pinned notes get a +60 pt boost (they're intentionally highlighted)
 */
function scoreNote(note: NoteModel): number {
  const plain       = stripHtml(note.content);
  const titleScore  = (note.title?.trim().length ?? 0) * 1.5;
  const bodyScore   = plain.trim().length;
  const pinnedBoost = note.pinned ? 60 : 0;
  return titleScore + bodyScore + pinnedBoost;
}

/**
 * Assigns every note a bubble diameter based on its rank within the current
 * visible set — so the canvas always shows a spread of sizes no matter how
 * much or how little content each note has.
 *
 * Tier distribution (percentile of rank, best → worst score):
 *   Top  18 %  → XL  (175 px) — spotlight notes
 *   Next 22 %  → LG  (140 px) — prominent notes
 *   Mid  27 %  → MD  (112 px) — standard notes
 *   Next 18 %  → SM  ( 86 px) — supporting notes
 *   Last 15 %  → XS  ( 66 px) — tag-like / minimal bubbles
 *
 * For very small collections (≤ 5) sizes stay in a comfortable
 * LG → SM range so the canvas doesn't look jarringly sparse.
 */
function computeSizeTiers(notes: NoteModel[]): Map<string, number> {
  const n = notes.length;
  if (n === 0) {return new Map();}

  // Sort notes descending by score
  const ranked = notes
    .map(note => ({id: note.id, score: scoreNote(note)}))
    .sort((a, b) => b.score - a.score);

  const sizeMap = new Map<string, number>();
  const TIERS   = [SZ.XL, SZ.LG, SZ.MD, SZ.SM, SZ.XS] as const;

  if (n <= 5) {
    // Small collection: avoid XL→XS jump; start one tier lower
    const startIdx = n <= 2 ? 1 : 0;   // 1 = start at LG, 0 = start at XL
    ranked.forEach((item, rank) =>
      sizeMap.set(item.id, TIERS[Math.min(startIdx + rank, TIERS.length - 1)]),
    );
  } else {
    // Percentile bucketing guarantees variety for larger sets
    ranked.forEach((item, rank) => {
      const pct = rank / (n - 1);       // 0.0 (top) → 1.0 (bottom)
      let size: number;
      if      (pct < 0.18) {size = SZ.XL;}
      else if (pct < 0.40) {size = SZ.LG;}
      else if (pct < 0.67) {size = SZ.MD;}
      else if (pct < 0.85) {size = SZ.SM;}
      else                  {size = SZ.XS;}
      sizeMap.set(item.id, size);
    });
  }

  return sizeMap;
}

// ─── Circle-packing layout ──────────────────────────────────────────────────────

interface PlacedCircle {
  cx: number;
  cy: number;
  r:  number;
}

const MIN_GAP = 10;  // minimum spacing between bubble edges

/**
 * Fixed center X for each of the 3 column tracks.
 * Using 22 / 50 / 78 % instead of equal thirds so side-column LG bubbles
 * have enough room from the screen edges and enough headroom from the centre.
 */
const COL_CX = [
  SCREEN_W * 0.22,   // left track centre
  SCREEN_W * 0.50,   // centre track
  SCREEN_W * 0.78,   // right track centre
] as const;

/**
 * Maximum RADIUS for each track (keeps bubbles from spilling off-screen).
 * Side tracks: distance from edge minus H_PAD gives usable radius.
 * Centre track: capped at SZ.XL / 2.
 */
const COL_MAX_R = [
  Math.min(COL_CX[0] - H_PAD, SZ.LG / 2),   // ≈ 66  → max Ø 132
  SZ.XL / 2,                                   //       → max Ø 175
  Math.min(SCREEN_W - COL_CX[2] - H_PAD, SZ.LG / 2), // ≈ same as left
] as const;

/** True if a candidate circle overlaps any already-placed circle. */
function overlapsAny(
  placed: PlacedCircle[],
  cx: number,
  cy: number,
  r: number,
): boolean {
  return placed.some(p => {
    const dx = p.cx - cx;
    const dy = p.cy - cy;
    // Euclidean distance check with required gap
    return dx * dx + dy * dy < (p.r + r + MIN_GAP) ** 2;
  });
}

/**
 * Returns the lowest Y-centre where a bubble of radius `r` centred at `cx`
 * can be placed without overlapping any circle in `placed`, starting the
 * search from `startCy`.
 */
function resolveY(
  placed: PlacedCircle[],
  cx: number,
  startCy: number,
  r: number,
): number {
  let cy = startCy;
  const MAX_ITER = 400;
  for (let i = 0; i < MAX_ITER; i++) {
    if (!overlapsAny(placed, cx, cy, r)) {return cy;}
    cy += 3;
  }
  return cy; // safety fallback
}

/**
 * Packs all notes into the canvas as non-overlapping circles.
 *
 * Strategy:
 *   1. For each note, determine desired radius from the size-tier map.
 *   2. For XL: try centre column first (score penalty on side cols).
 *      For all others: pick the column-track whose current bottom is lowest.
 *   3. Within the chosen track, push the bubble down until it clears
 *      ALL previously placed circles (cross-column collision safe).
 *   4. Record the exact (cx, cy, r) so future bubbles check against it.
 */
function computeLayouts(
  notes: NoteModel[],
  sizeTiers: Map<string, number>,
): {layouts: BubbleLayout[]; totalHeight: number} {
  const placed: PlacedCircle[]  = [];
  const colBottoms = [TOP_INSET, TOP_INSET, TOP_INSET]; // next candidate cy for each col
  const layouts: BubbleLayout[] = [];

  notes.forEach((note, i) => {
    const requestedSize = sizeTiers.get(note.id) ?? SZ.MD;
    const requestedR   = requestedSize / 2;
    const color        = BUBBLE_COLORS[i % BUBBLE_COLORS.length];

    // ── Pick the best column track ──────────────────────────────────────
    let bestCol   = 0;
    let bestCy    = Infinity;
    let bestR     = SZ.MD / 2;

    COL_CX.forEach((cx, col) => {
      const maxR = COL_MAX_R[col];
      const r    = Math.min(requestedR, maxR);
      const startCy = colBottoms[col] + r;

      // XL bubbles pay a penalty in side columns so they bias to centre
      const penalty  = requestedR >= SZ.XL / 2 && col !== 1 ? 35 : 0;
      const cy       = resolveY(placed, cx, startCy, r);
      const score    = cy + penalty;

      if (score < bestCy + (bestR > 0 ? 0 : 1)) {
        // Prefer the column whose resolved cy (+ penalty) is smallest
        if (cy + penalty < bestCy) {
          bestCy  = cy + penalty; // keep the adjusted score for comparison
          bestCol = col;
          bestR   = r;
        }
      }
    });

    // Re-resolve final cy without the XL penalty (actual placement)
    const finalCX = COL_CX[bestCol];
    const finalR  = bestR;
    const finalCY = resolveY(placed, finalCX, colBottoms[bestCol] + finalR, finalR);

    // Advance this column's bottom past the newly placed bubble
    colBottoms[bestCol] = finalCY + finalR + MIN_GAP;

    placed.push({cx: finalCX, cy: finalCY, r: finalR});

    layouts.push({
      x:    Math.max(H_PAD, finalCX - finalR),
      y:    finalCY - finalR,
      size: finalR * 2,
      color,
    });
  });

  const totalHeight =
    Math.max(...layouts.map(l => l.y + l.size), 0) + 180;
  return {layouts, totalHeight};
}

// ─── Widget refresh helper ─────────────────────────────────────────────────────
const triggerWidgetRefresh = () => {
  try {
    requestWidgetUpdate({widgetName: 'NotesWidgetProvider', renderWidget: renderNotesWidget});
  } catch (_) {}
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export const HomeScreen = ({navigation}: Props) => {
  const {colors, statusBarStyle, mode} = useAppTheme();
  const {enabled: isAppLockEnabled, setEnabled: setAppLockEnabled} = useAppLock();
  const database = useDatabase();

  const [notes, setNotes]             = useState<NoteModel[]>([]);
  const [viewMode, setViewMode]       = useState<'bubble' | 'list'>('bubble');
  const [query, setQuery]             = useState('');
  const [noteToDelete, setNoteToDelete] = useState<NoteModel | null>(null);
  const [noteForAction, setNoteForAction] = useState<NoteModel | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [isAuthBusy, setIsAuthBusy]   = useState(false);
  const [syncUserEmail, setSyncUserEmail] = useState<string | null>(null);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [bubbleOffsets, setBubbleOffsets] = useState<BubbleOffsetMap>({});
  const [isBubbleDragging, setIsBubbleDragging] = useState(false);
  const [activeSnapPreview, setActiveSnapPreview] = useState<ActiveSnapPreview>(null);
  const [activeDragNoteId, setActiveDragNoteId] = useState<string | null>(null);
  const [isLayoutPickerVisible, setIsLayoutPickerVisible] = useState(false);
  const activeDragNoteIds = useRef<Set<string>>(new Set());

  // ── Authentication per-note action ───────────────────────────────────────────
  const [authActionCallback, setAuthActionCallback] = useState<(() => void) | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [unlockPrompt, setUnlockPrompt] = useState<'method' | 'fallback' | null>(null);
  const unlockResolver = useRef<((value: 'biometric' | 'pin' | 'cancel') => void) | null>(null);

  const resolveUnlockPrompt = (value: 'biometric' | 'pin' | 'cancel') => {
    const resolver = unlockResolver.current;
    unlockResolver.current = null; setUnlockPrompt(null); resolver?.(value);
  };

  const promptUnlockChoice = (type: 'method' | 'fallback') =>
    new Promise<'biometric' | 'pin' | 'cancel'>(resolve => {unlockResolver.current = resolve; setUnlockPrompt(type);});

  const authenticateAction = async (note: NoteModel, action: () => void) => {
    if (!note.locked) { action(); return; }
    const [canBiometric, canUsePin] = await Promise.all([isSensorAvailable(), hasPin()]);
    if (canBiometric && canUsePin) {
      const method = await promptUnlockChoice('method');
      if (method === 'pin') { setShowPin(true); setAuthActionCallback(() => action); return; }
      if (method !== 'biometric') { return; }
    }
    if (canBiometric) {
      const unlocked = await promptBiometric('Unlock note');
      if (unlocked) { action(); return; }
      if (canUsePin) {
        const fallback = await promptUnlockChoice('fallback');
        if (fallback === 'pin') { setShowPin(true); setAuthActionCallback(() => action); }
      }
      return;
    }
    if (canUsePin) { setShowPin(true); setAuthActionCallback(() => action); return; }
    await promptUnlockChoice('fallback');
  };

  const fadeIn  = useRef(new Animated.Value(0)).current;
  const fabAnim = useRef(new Animated.Value(1)).current;
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const fabGlowAnim = useRef(new Animated.Value(0)).current;

  // ── Derived palette values (light vs dark) ──────────────────────────────────
  const isLight    = mode === 'light';
  // Warm off-white canvas — matches the Apple Freeform reference
  const canvasBg   = isLight ? '#F2EFEA' : colors.bg;
  // Ghost button: semi-transparent white on light, surface on dark
  const ghostBg    = isLight ? 'rgba(255,255,255,0.75)' : colors.surface;
  const ghostBorder = isLight ? 'rgba(0,0,0,0.06)' : colors.border;
  // Search bar: pure white on light, surface on dark
  const searchBg   = isLight ? '#FFFFFF' : colors.surface;
  // Separator / muted text
  const mutedText  = isLight ? '#8A8490' : colors.textMuted;
  const titleText  = isLight ? '#1E1A28' : colors.text;

  // ── Entrance animation ──────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeIn, {toValue: 1, duration: 300, useNativeDriver: true}).start();

    // Load saved preference; if no preference is stored yet, show the picker
    AsyncStorage.getItem('homescreen-view-mode').then(val => {
      if (val === 'list') {
        setViewMode('list');
      } else if (val === null) {
        // First launch — let user choose
        setIsLayoutPickerVisible(true);
      }
    });
  }, [fadeIn]);

  const handleLayoutPickerSelect = (chosenMode: 'bubble' | 'list') => {
    setViewMode(chosenMode);
    AsyncStorage.setItem('homescreen-view-mode', chosenMode);
  };

  const triggerHaptic = (type: 'impactLight' | 'impactMedium' = 'impactLight') => {
    ReactNativeHapticFeedback.trigger(type, {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    });
  };

  const handleToggleViewMode = () => {
    triggerHaptic('impactLight');
    const nextMode = viewMode === 'bubble' ? 'list' : 'bubble';
    setViewMode(nextMode);
    AsyncStorage.setItem('homescreen-view-mode', nextMode);
  };

  useEffect(() => {
    Animated.spring(searchFocusAnim, {
      toValue: searchFocused ? 1 : 0,
      useNativeDriver: false,
      tension: 130,
      friction: 16,
    }).start();
  }, [searchFocused, searchFocusAnim]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fabGlowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(fabGlowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, [fabGlowAnim]);

  // ── Data subscriptions ──────────────────────────────────────────────────────
  useEffect(() => {
    const sub = observeNotes(database).subscribe(next => {
      setNotes(next);
      triggerWidgetRefresh();
    });
    return () => sub.unsubscribe();
  }, [database]);

  useEffect(() => {
    setBubbleOffsets(prev => {
      const validIds = new Set(notes.map(note => note.id));
      let changed = false;
      const next: BubbleOffsetMap = {};
      Object.entries(prev).forEach(([noteId, offset]) => {
        if (validIds.has(noteId)) {
          next[noteId] = offset;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [notes]);

  useEffect(() => {
    if (!firebaseConfig) {
      disableSync(); setSyncAvailable(false); setSyncUserEmail(null); return;
    }
    try {initFirebase(firebaseConfig as any); setSyncAvailable(true);} catch {
      setSyncAvailable(false); return;
    }
    const auth        = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user: any) => {
      if (user?.uid) {
        setSyncUserEmail(user.email ?? null);
        enableSyncForUser(database, user.uid).catch(() => {});
        return;
      }
      setSyncUserEmail(null); disableSync();
    });
    return () => {unsubscribe?.();};
  }, [database]);

  // ── Filtered notes + layout ──────────────────────────────────────────────────
  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {return notes;}
    return notes.filter(
      n =>
        n.title.toLowerCase().includes(q) ||
        stripHtml(n.content).toLowerCase().includes(q),
    );
  }, [notes, query]);

  useEffect(() => {
    const visibleIds = new Set(filteredNotes.map(note => note.id));
    let changed = false;
    activeDragNoteIds.current.forEach(noteId => {
      if (!visibleIds.has(noteId)) {
        activeDragNoteIds.current.delete(noteId);
        changed = true;
      }
    });
    if (viewMode !== 'bubble' && activeDragNoteIds.current.size > 0) {
      activeDragNoteIds.current.clear();
      changed = true;
    }
    if (changed) {
      const nextDragging = activeDragNoteIds.current.size > 0;
      setIsBubbleDragging(prev => (prev === nextDragging ? prev : nextDragging));
    }
    setActiveDragNoteId(prev =>
      prev && visibleIds.has(prev)
        ? prev
        : activeDragNoteIds.current.values().next().value ?? null,
    );
    if (activeSnapPreview && !visibleIds.has(activeSnapPreview.noteId)) {
      setActiveSnapPreview(null);
    }
  }, [activeSnapPreview, filteredNotes, viewMode]);

  useEffect(() => {
    if (!isBubbleDragging && activeSnapPreview) {
      setActiveSnapPreview(null);
    }
  }, [activeSnapPreview, isBubbleDragging]);

  const sizeTiers = useMemo(
    () => computeSizeTiers(filteredNotes),
    [filteredNotes],
  );

  const {layouts, totalHeight} = useMemo(
    () => computeLayouts(filteredNotes, sizeTiers),
    [filteredNotes, sizeTiers],
  );

  const snapTargets = useMemo<BubbleSnapTarget[]>(
    () =>
      filteredNotes
        .map((note, index) => {
          const layout = layouts[index];
          if (!layout) {return null;}
          const offset = bubbleOffsets[note.id];
          return {
            id: note.id,
            x: layout.x + (offset?.x ?? 0),
            y: layout.y + (offset?.y ?? 0),
            size: layout.size,
          };
        })
        .filter((target): target is BubbleSnapTarget => Boolean(target)),
    [bubbleOffsets, filteredNotes, layouts],
  );

  const clusterStrengthById = useMemo<Record<string, number>>(() => {
    const strengths: Record<string, number> = {};
    snapTargets.forEach(target => {
      strengths[target.id] = 0;
    });

    for (let i = 0; i < snapTargets.length; i++) {
      for (let j = i + 1; j < snapTargets.length; j++) {
        const a = snapTargets[i];
        const b = snapTargets[j];
        const ax = a.x + a.size / 2;
        const ay = a.y + a.size / 2;
        const bx = b.x + b.size / 2;
        const by = b.y + b.size / 2;
        const dx = ax - bx;
        const dy = ay - by;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= CLUSTER_DISTANCE_THRESHOLD) {continue;}
        const intensity = 1 - distance / CLUSTER_DISTANCE_THRESHOLD;
        strengths[a.id] = Math.max(strengths[a.id] ?? 0, intensity);
        strengths[b.id] = Math.max(strengths[b.id] ?? 0, intensity);
      }
    }

    return strengths;
  }, [snapTargets]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleFAB = () => {
    triggerHaptic('impactMedium');
    Animated.sequence([
      Animated.timing(fabAnim, {toValue: 0.92, duration: 80, useNativeDriver: true}),
      Animated.spring(fabAnim, {toValue: 1, useNativeDriver: true}),
    ]).start();
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
    navigation.navigate('Editor', {defaultColor: color});
  };

  const handleDelete = async () => {
    if (!noteToDelete) {return;}
    await deleteNoteById(database, noteToDelete.id);
    setNoteToDelete(null);
  };

  const handleShareNote = async (note: NoteModel) => {
    const title = note.title.trim();
    const body = stripHtml(note.content).trim();

    if (!title && !body) {
      Alert.alert('Nothing to share', 'This note is empty.');
      return;
    }

    try {
      await Share.share({
        title: title || 'Note',
        message: title ? `${title}\n\n${body}` : body,
      });
    } catch (_) {}
  };

  const handleToggleLock = async (note: NoteModel) => {
    try {
      await saveNote(database, {
        id: note.id,
        title: note.title,
        content: note.content,
        color: note.color,
        pinned: note.pinned,
        locked: !note.locked,
      });
    } catch {
      Alert.alert('Action failed', 'Unable to update note lock state.');
    }
  };

  const handleNoteActions = (note: NoteModel) => {
    triggerHaptic('impactLight');
    setNoteForAction(note);
  };

  const handleToggleAppLock = async () => {
    triggerHaptic('impactMedium');
    const ok = await setAppLockEnabled(!isAppLockEnabled);
    if (!ok && !isAppLockEnabled) {
      Alert.alert(
        'App lock not enabled',
        'Set a fallback PIN or keep biometrics available first.',
      );
    }
  };

  const handleCloudPress = () => {
    triggerHaptic('impactLight');
    if (!syncAvailable) {
      Alert.alert('Cloud sync unavailable', 'Configure Firebase to enable sign-in.');
      return;
    }
    if (syncUserEmail) {
      Alert.alert('Signed in', `Signed in as ${syncUserEmail}.`, [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign out', style: 'destructive',
          onPress: async () => {
            try {
              setIsAuthBusy(true);
              await signOutFirebase(getAuthInstance());
            } catch {
              Alert.alert('Sign-out failed', 'Please try again.');
            } finally {setIsAuthBusy(false);}
          },
        },
      ]);
      return;
    }
    setIsAuthModalVisible(true);
  };

  const handleBubbleSettle = (
    noteId: string,
    nextOffsetX: number,
    nextOffsetY: number,
  ) => {
    setBubbleOffsets(prev => {
      const prevOffset = prev[noteId];
      if (
        prevOffset &&
        Math.abs(prevOffset.x - nextOffsetX) < 0.5 &&
        Math.abs(prevOffset.y - nextOffsetY) < 0.5
      ) {
        return prev;
      }
      return {
        ...prev,
        [noteId]: {x: nextOffsetX, y: nextOffsetY},
      };
    });
  };

  const handleBubbleDragState = (noteId: string, dragging: boolean) => {
    if (dragging) {
      activeDragNoteIds.current.add(noteId);
      setActiveDragNoteId(noteId);
    } else {
      activeDragNoteIds.current.delete(noteId);
      setActiveDragNoteId(prev =>
        prev === noteId
          ? activeDragNoteIds.current.values().next().value ?? null
          : prev,
      );
    }
    const nextDragging = activeDragNoteIds.current.size > 0;
    setIsBubbleDragging(prev => (prev === nextDragging ? prev : nextDragging));
  };

  const handleAuthSubmit = async ({
    email, password, mode: authMode,
  }: {email: string; password: string; mode: 'signin' | 'signup'}) => {
    try {
      setIsAuthBusy(true);
      const auth = getAuthInstance();
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setIsAuthModalVisible(false);
    } catch (error: any) {
      const code = String(error?.code ?? '');
      if (code.includes('auth/invalid-credential')) {
        Alert.alert('Sign-in failed', 'Wrong email or password.');
      } else if (code.includes('auth/email-already-in-use')) {
        Alert.alert('Account exists', 'Email is already registered.');
      } else if (code.includes('auth/weak-password')) {
        Alert.alert('Weak password', 'Use 6+ characters.');
      } else {
        Alert.alert('Authentication failed', 'Please try again.');
      }
    } finally {setIsAuthBusy(false);}
  };
  const searchInset = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 10],
  });
  const searchScaleX = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });
  const searchVerticalPad = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [11, 13],
  });
  const searchShadowOpacity = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.07, 0.12],
  });
  const fabGlowOpacity = fabGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, 0.42],
  });
  const fabGlowScale = fabGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, {backgroundColor: canvasBg}]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={statusBarStyle} />
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.content, {opacity: fadeIn}]}>

          {/* ══ Top Bar ═══════════════════════════════════════════════════ */}
          <View style={styles.topBar}>
            {/* Left — greeting + title */}
            <View style={styles.topLeft}>
              <Text style={[styles.greeting, {color: mutedText}]}>
                {getGreeting()}
              </Text>
              <Text style={[styles.screenTitle, {color: titleText}]}>
                goodnote
              </Text>
            </View>

            {/* Right — ghost icon buttons */}
            <View style={styles.topActions}>
              {/* Cloud sync */}
              <TouchableOpacity
                style={[
                  styles.ghostBtn,
                  {backgroundColor: ghostBg, borderColor: ghostBorder},
                  Boolean(syncUserEmail) && styles.ghostBtnActive,
                  !syncAvailable && styles.ghostBtnDisabled,
                ]}
                onPress={handleCloudPress}
                activeOpacity={0.72}
                accessibilityLabel={syncUserEmail ? 'Manage sync' : 'Sign in for sync'}>
                <MaterialIcons
                  name={syncUserEmail ? 'cloud-done' : syncAvailable ? 'cloud-upload' : 'cloud-off'}
                  size={18}
                  color={syncUserEmail ? '#fff' : mutedText}
                />
              </TouchableOpacity>

              {/* App lock */}
              <TouchableOpacity
                style={[
                  styles.ghostBtn,
                  {backgroundColor: ghostBg, borderColor: ghostBorder},
                  isAppLockEnabled && styles.ghostBtnActive,
                ]}
                onPress={handleToggleAppLock}
                activeOpacity={0.72}
                accessibilityLabel={isAppLockEnabled ? 'Disable lock' : 'Enable lock'}>
                <MaterialIcons
                  name={isAppLockEnabled ? 'lock' : 'lock-open'}
                  size={18}
                  color={isAppLockEnabled ? '#fff' : mutedText}
                />
              </TouchableOpacity>

              {/* Layout Toggle — tap to switch, long-press to open picker */}
              <TouchableOpacity
                style={[styles.ghostBtn, {backgroundColor: ghostBg, borderColor: ghostBorder}]}
                onPress={handleToggleViewMode}
                onLongPress={() => setIsLayoutPickerVisible(true)}
                delayLongPress={500}
                activeOpacity={0.72}
                accessibilityLabel="Toggle view layout">
                <MaterialIcons
                  name={viewMode === 'bubble' ? 'view-module' : 'bubble-chart'}
                  size={18}
                  color={mutedText}
                />
              </TouchableOpacity>

              {/* Theme */}
              <ThemeSwitchButton compact />

              {/* Settings */}
              <TouchableOpacity
                style={[styles.ghostBtn, {backgroundColor: ghostBg, borderColor: ghostBorder}]}
                onPress={() => navigation.navigate('Settings' as any)}
                activeOpacity={0.72}
                accessibilityLabel="Open settings">
                <MaterialIcons name="settings" size={18} color={mutedText} />
              </TouchableOpacity>

              {/* Note count badge */}
              <View
                style={[styles.countBadge, {backgroundColor: ghostBg, borderColor: ghostBorder}]}>
                <Text style={[styles.countText, {color: titleText}]}>{notes.length}</Text>
              </View>
            </View>
          </View>

          {/* ══ Search Bar ════════════════════════════════════════════════ */}
          <Animated.View
            style={[
              styles.searchBar,
              {
                marginHorizontal: searchInset,
                paddingVertical: searchVerticalPad,
                shadowOpacity: searchShadowOpacity,
                transform: [{scaleX: searchScaleX}],
                backgroundColor: searchBg,
                borderColor: searchFocused
                  ? (isLight ? 'rgba(0,0,0,0.14)' : colors.accentSoft)
                  : 'transparent',
              },
            ]}>
            <MaterialIcons
              name="search"
              size={18}
              color={mutedText}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, {color: titleText}]}
              placeholder="Search your canvas…"
              placeholderTextColor={mutedText}
              value={query}
              onChangeText={setQuery}
              selectionColor={colors.accent}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {query.length > 0 ? (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <MaterialIcons name="close" size={16} color={mutedText} />
              </TouchableOpacity>
            ) : (
              <MaterialIcons name="mic" size={18} color={mutedText} />
            )}
          </Animated.View>

          {/* ══ Canvas ════════════════════════════════════════════════════ */}
          {filteredNotes.length === 0 ? (
            <EmptyState hasSearch={Boolean(query.trim())} />
          ) : viewMode === 'bubble' ? (
            <ScrollView
              style={styles.canvas}
              contentContainerStyle={{height: totalHeight}}
              scrollEnabled={!isBubbleDragging}
              showsVerticalScrollIndicator={false}>
              {activeSnapPreview ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.snapPreviewBubble,
                    {
                      left: activeSnapPreview.x,
                      top: activeSnapPreview.y,
                      width: activeSnapPreview.size,
                      height: activeSnapPreview.size,
                      borderRadius: activeSnapPreview.size / 2,
                      backgroundColor: activeSnapPreview.color,
                    },
                  ]}
                />
              ) : null}
              {filteredNotes.map((note, index) => {
                const layout = layouts[index];
                if (!layout) {return null;}
                const offset = bubbleOffsets[note.id];
                const isActiveDraggedBubble =
                  Boolean(activeDragNoteId) && activeDragNoteId === note.id;
                const isDeemphasized =
                  isBubbleDragging && !isActiveDraggedBubble;
                return (
                  <BubbleNoteCard
                    key={note.id}
                    note={note}
                    index={index}
                    size={layout.size}
                    color={layout.color}
                    x={layout.x}
                    y={layout.y}
                    onPress={() =>
                      navigation.navigate('Editor', {
                        noteId: note.id,
                        allowLockedAccess: true,
                      })
                    }
                    onLongPress={() => handleNoteActions(note)}
                    snapTargets={snapTargets}
                    canvasWidth={SCREEN_W}
                    canvasHeight={totalHeight}
                    settledOffsetX={offset?.x ?? 0}
                    settledOffsetY={offset?.y ?? 0}
                    onSettle={(nextOffsetX, nextOffsetY) =>
                      handleBubbleSettle(note.id, nextOffsetX, nextOffsetY)
                    }
                    onDragStateChange={dragging =>
                      handleBubbleDragState(note.id, dragging)
                    }
                    stackOrder={isActiveDraggedBubble ? ACTIVE_DRAG_Z_INDEX : 1}
                    interactionScale={isDeemphasized ? DRAG_DEEMPHASIS_SCALE : 1}
                    interactionOpacity={isDeemphasized ? DRAG_DEEMPHASIS_OPACITY : 1}
                    clusterStrength={clusterStrengthById[note.id] ?? 0}
                    onSnapPreview={preview => {
                      if (preview) {
                        setActiveSnapPreview({
                          ...preview,
                          noteId: note.id,
                          color: layout.color,
                        });
                        return;
                      }
                      setActiveSnapPreview(prev =>
                        prev && prev.noteId === note.id ? null : prev,
                      );
                    }}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.canvas}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}>
              <View style={styles.gridRow}>
                {filteredNotes.map((note, index) => (
                  <View key={note.id} style={styles.gridItem}>
                    <NoteCard
                      note={note}
                      index={index}
                      onPress={() =>
                        navigation.navigate('Editor', {
                          noteId: note.id,
                          allowLockedAccess: true,
                        })
                      }
                      onLongPress={() => handleNoteActions(note)}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>

      {/* ══ FAB ═══════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[styles.fabWrap, {transform: [{scale: fabAnim}]}]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fabGlow,
            {
              opacity: fabGlowOpacity,
              transform: [{scale: fabGlowScale}],
            },
          ]}
        />
        <TouchableOpacity
          style={styles.fab}
          onPress={handleFAB}
          activeOpacity={0.85}>
          <View pointerEvents="none" style={styles.fabGradientTop} />
          <View pointerEvents="none" style={styles.fabGradientBottom} />
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ══ Modals ════════════════════════════════════════════════════════ */}
      <DeleteModal
        visible={Boolean(noteToDelete)}
        noteTitle={noteToDelete?.title}
        onCancel={() => setNoteToDelete(null)}
        onConfirm={handleDelete}
      />
      <AuthModal
        visible={isAuthModalVisible}
        busy={isAuthBusy}
        onClose={() => setIsAuthModalVisible(false)}
        onSubmit={handleAuthSubmit}
      />
      <ActionMenuModal
        visible={Boolean(noteForAction)}
        title={noteForAction?.title || 'Note Actions'}
        actions={
          noteForAction
            ? [
                {
                  id: 'lock',
                  label: noteForAction.locked ? 'Unlock' : 'Lock',
                  icon: noteForAction.locked ? 'lock-open' : 'lock',
                  hapticMs: 20,
                  onPress: () => {
                    authenticateAction(noteForAction, () => handleToggleLock(noteForAction).catch(() => {}));
                  },
                },
                {
                  id: 'share',
                  label: 'Share',
                  icon: 'share',
                  hapticMs: 14,
                  onPress: () => {
                    authenticateAction(noteForAction, () => handleShareNote(noteForAction).catch(() => {}));
                  },
                },
                {
                  id: 'delete',
                  label: 'Delete',
                  icon: 'delete-outline',
                  destructive: true,
                  hapticMs: [0, 24, 56, 32],
                  onPress: () => {
                    authenticateAction(noteForAction, () => setNoteToDelete(noteForAction));
                  },
                },
              ]
            : []
        }
        onClose={() => setNoteForAction(null)}
      />

      {/* ══ Layout Preference Picker ══════════════════════════════════════ */}
      <LayoutPickerModal
        visible={isLayoutPickerVisible}
        currentMode={viewMode}
        onSelect={handleLayoutPickerSelect}
        onClose={() => setIsLayoutPickerVisible(false)}
      />

      {/* ── Auth Modals for Secured Actions ────────────────────────────────── */}
      <PinModal
        visible={showPin} mode="verify" title="Verify action"
        description="Enter your PIN to perform this action."
        onRequestClose={() => setShowPin(false)}
        onSuccess={() => {setShowPin(false); if (authActionCallback) authActionCallback(); setAuthActionCallback(null);}}
      />
      
      <Modal visible={unlockPrompt !== null} transparent animationType="fade"
        onRequestClose={() => resolveUnlockPrompt('cancel')}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
            <View style={[styles.dialogIconWrap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <MaterialIcons name={unlockPrompt === 'fallback' ? 'lock-clock' : 'fingerprint'} size={22} color={colors.accentText} />
            </View>
            <Text style={[styles.dialogTitle, {color: colors.text}]}>
              {unlockPrompt === 'fallback' ? 'Try PIN instead' : 'Unlock required'}
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
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {flex: 1},
  safe: {flex: 1},
  content: {flex: 1},

  // ── Top Bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  topLeft: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  screenTitle: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ghostBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft, minimal shadow
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  ghostBtnActive: {
    backgroundColor: '#6889BB',
    borderColor: '#6889BB',
  },
  ghostBtnDisabled: {
    opacity: 0.38,
  },
  countBadge: {
    minWidth: 38,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Canvas & Grid ──────────────────────────────────────────────────────────
  snapGhost: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    zIndex: 999,
  },
  canvas: {
    flex: 1,
  },
  snapPreviewBubble: {
    position: 'absolute',
    opacity: 0.2,
    transform: [{scale: 1.05}],
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 160,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    marginBottom: 16,
  },

  // ── Search & FAB ─────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    borderRadius: 28,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    // Soft shadow — feels floating, not pasted
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
    fontWeight: '400',
  },

  // ── FAB ────────────────────────────────────────────────────────────────────
  fabWrap: {
    position: 'absolute',
    bottom: 34,
    right: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(84, 122, 180, 0.45)',
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    // Muted soft purple — not bright, not glossy
    backgroundColor: '#6889BB',
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle coloured shadow — depth without glare
    shadowColor: '#3C5B8A',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  fabGradientTop: {
    position: 'absolute',
    top: 2,
    left: 3,
    right: 3,
    height: 28,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  fabGradientBottom: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 30,
    borderRadius: 16,
    backgroundColor: 'rgba(43, 84, 143, 0.22)',
  },
  fabIcon: {
    fontSize: 30,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 36,
    marginTop: -1,
  },
});
