import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDatabase} from '@nozbe/watermelondb/react';
import {SafeAreaView} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {actions, RichEditor, RichToolbar} from 'react-native-pell-rich-editor';
import {launchImageLibrary} from 'react-native-image-picker';
import Tts from 'react-native-tts';
import type {RootStack} from '../../App';
import {DeleteModal} from '../components/DeleteModal';
import {deleteNoteById, getNoteById, saveNote} from '../database/notes';
import {NOTE_COLORS, RADIUS} from '../theme/colors';
import {useAppTheme} from '../theme/ThemeContext';
import type {AppColors} from '../theme/colors';
import {createPdfFromHtml} from '../utils/pdf';
import {escapeHtml, htmlToPlainText, plainTextToHtml} from '../utils/helpers';

type Props = {
  navigation: NativeStackNavigationProp<RootStack, 'Editor'>;
  route: RouteProp<RootStack, 'Editor'>;
};

type SaveState = 'idle' | 'saving' | 'saved';

type Snapshot = {
  title: string;
  content: string;
  color: string;
  locked: boolean;
};

type ControlChipProps = {
  active?: boolean;
  colors: AppColors;
  danger?: boolean;
  disabled?: boolean;
  icon: string;
  label: string;
  onPress: () => void;
};

const ControlChip = ({
  active = false,
  colors,
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
}: ControlChipProps) => {
  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[
        styles.controlChip,
        active && styles.controlChipActive,
        danger && styles.controlChipDanger,
        disabled && styles.controlChipDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}>
      <MaterialIcons
        name={icon}
        size={16}
        color={
          danger
            ? colors.dangerText
            : active
            ? colors.accentText
            : colors.textSec
        }
      />
      <Text
        style={[
          styles.controlChipText,
          active && styles.controlChipTextActive,
          danger && styles.controlChipTextDanger,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const areSnapshotsEqual = (a: Snapshot | null, b: Snapshot) =>
  Boolean(
    a &&
      a.title === b.title &&
      a.content === b.content &&
      a.color === b.color &&
      a.locked === b.locked,
  );

const isSnapshotEmpty = (snapshot: Snapshot) =>
  !snapshot.title.trim() && !htmlToPlainText(snapshot.content).trim();

export const EditorScreen = ({navigation, route}: Props) => {
  const {colors, mode, statusBarStyle, toggleTheme} = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const richEditorStyle = useMemo(
    () => ({
      backgroundColor: 'transparent',
      color: colors.text,
      placeholderColor: colors.textMuted,
      contentCSSText:
        'font-size: 19px; line-height: 1.65; letter-spacing: -0.1px;',
    }),
    [colors.text, colors.textMuted],
  );
  const database = useDatabase();
  const params =
    route.params && typeof route.params === 'object' ? route.params : {};

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState(params.defaultColor ?? NOTE_COLORS[0]);
  const [locked, setLocked] = useState(false);
  const [noteId, setNoteId] = useState<string | undefined>(params.noteId);
  const [isLoading, setIsLoading] = useState(Boolean(params.noteId));
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showFloatingFontEditor, setShowFloatingFontEditor] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const titleInputRef = useRef<TextInput>(null);
  const richEditorRef = useRef<RichEditor>(null);
  const editorScrollRef = useRef<ScrollView>(null);
  const noteIdRef = useRef<string | undefined>(params.noteId);
  const bodyInputYRef = useRef(0);

  const titleValueRef = useRef('');
  const bodyValueRef = useRef('');
  const colorValueRef = useRef(params.defaultColor ?? NOTE_COLORS[0]);
  const lockedValueRef = useRef(false);
  const lastSavedSnapshotRef = useRef<Snapshot | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 120,
        friction: 14,
        useNativeDriver: true,
      }),
    ]).start();

    if (!params.noteId) {
      setTimeout(() => titleInputRef.current?.focus(), 250);
    }
  }, [fadeAnim, params.noteId, slideAnim]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (savedBadgeTimerRef.current) {
        clearTimeout(savedBadgeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const finishSubscription = Tts.addEventListener('tts-finish', () => {
      setIsSpeaking(false);
    }) as {remove?: () => void} | void;
    const cancelSubscription = Tts.addEventListener('tts-cancel', () => {
      setIsSpeaking(false);
    }) as {remove?: () => void} | void;

    return () => {
      finishSubscription?.remove?.();
      cancelSubscription?.remove?.();
      Tts.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  const buildSnapshot = (): Snapshot => ({
    title: titleValueRef.current,
    content: bodyValueRef.current,
    color: colorValueRef.current,
    locked: lockedValueRef.current,
  });

  const scheduleSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    if (savedBadgeTimerRef.current) {
      clearTimeout(savedBadgeTimerRef.current);
    }

    setSaveState(prev => (prev === 'saving' ? prev : 'idle'));

    saveTimerRef.current = setTimeout(() => {
      commitSave().catch(() => {});
    }, 900);
  };

  const commitSave = async ({force = false}: {force?: boolean} = {}) => {
    const snapshot = buildSnapshot();

    if (isSnapshotEmpty(snapshot)) {
      return;
    }

    if (!force && areSnapshotsEqual(lastSavedSnapshotRef.current, snapshot)) {
      return;
    }

    setSaveState('saving');

    try {
      const saved = await saveNote(database, {
        id: noteIdRef.current,
        ...snapshot,
      });

      if (!noteIdRef.current) {
        noteIdRef.current = saved.id;
        setNoteId(saved.id);
      }

      lastSavedSnapshotRef.current = snapshot;
      setSaveState('saved');

      if (savedBadgeTimerRef.current) {
        clearTimeout(savedBadgeTimerRef.current);
      }
      savedBadgeTimerRef.current = setTimeout(() => {
        setSaveState('idle');
      }, 1200);
    } catch (_) {
      setSaveState('idle');
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!params.noteId) {
        const defaultColor = params.defaultColor ?? NOTE_COLORS[0];
        titleValueRef.current = '';
        bodyValueRef.current = '';
        colorValueRef.current = defaultColor;
        lockedValueRef.current = false;
        lastSavedSnapshotRef.current = null;
        setTitle('');
        setBody('');
        setColor(defaultColor);
        setLocked(false);
        setIsLoading(false);
        return;
      }

      try {
        const note = await getNoteById(database, params.noteId);
        if (!mounted) {
          return;
        }

        setTitle(note.title);
        titleValueRef.current = note.title;

        const normalizedBody = /<[^>]+>/.test(note.content)
          ? note.content
          : plainTextToHtml(note.content);

        setBody(normalizedBody);
        bodyValueRef.current = normalizedBody;

        setColor(note.color);
        colorValueRef.current = note.color;

        setLocked(note.locked);
        lockedValueRef.current = note.locked;

        noteIdRef.current = note.id;
        setNoteId(note.id);

        lastSavedSnapshotRef.current = {
          title: note.title,
          content: normalizedBody,
          color: note.color,
          locked: note.locked,
        };
      } catch (_) {
        if (mounted) {
          Alert.alert('Not found', 'This note could not be loaded.', [
            {text: 'OK', onPress: () => navigation.goBack()},
          ]);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [database, navigation, params.defaultColor, params.noteId]);

  const handleTitleChange = (nextTitle: string) => {
    titleValueRef.current = nextTitle;
    setTitle(nextTitle);
    scheduleSave();
  };

  const handleBodyChange = (nextBodyHtml: string) => {
    bodyValueRef.current = nextBodyHtml;
    setBody(nextBodyHtml);
    scheduleSave();
  };

  const handleBack = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    commitSave({force: true})
      .catch(() => {})
      .finally(() => navigation.goBack());
  };

  const handleShare = async () => {
    const currentTitle = titleValueRef.current.trim();
    const currentBody = htmlToPlainText(bodyValueRef.current).trim();

    if (!currentTitle && !currentBody) {
      Alert.alert('Nothing to share', 'Write something first.');
      return;
    }

    try {
      await Share.share({
        message: currentTitle
          ? `${currentTitle}\n\n${currentBody}`
          : currentBody,
        title: currentTitle || 'Note',
      });
    } catch (_) {}
  };

  const handleExport = async () => {
    const currentTitle = titleValueRef.current.trim();
    const currentBody = bodyValueRef.current;
    const currentBodyText = htmlToPlainText(currentBody).trim();

    if (!currentTitle && !currentBodyText) {
      Alert.alert('Nothing to export', 'Write something first.');
      return;
    }

    setIsExporting(true);

    try {
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                color: #1a1a1a;
                padding: 48px 40px;
                line-height: 1.8;
                font-size: 16px;
              }
              h1 {
                font-size: 26px;
                font-weight: 700;
                margin: 0 0 24px 0;
                padding-bottom: 16px;
                border-bottom: 2px solid ${colorValueRef.current};
              }
              p {
                margin: 0 0 14px 0;
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(currentTitle || 'Untitled')}</h1>
            ${currentBody || '<p></p>'}
          </body>
        </html>`;

      const path = await createPdfFromHtml({
        html,
        fileName: currentTitle || 'note',
      });

      if (path) {
        const pdfUri = path.startsWith('file://') ? path : `file://${path}`;
        try {
          await Linking.openURL(pdfUri);
        } catch (_) {
          Alert.alert('PDF exported', `Saved at:\n${path}`);
        }
      } else {
        Alert.alert('Export failed', 'Could not generate PDF.');
      }
    } catch (_) {
      Alert.alert('Export failed', 'An error occurred.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (noteIdRef.current) {
      await deleteNoteById(database, noteIdRef.current);
    }

    navigation.goBack();
  };

  const toggleLock = () => {
    const nextLocked = !lockedValueRef.current;
    lockedValueRef.current = nextLocked;
    setLocked(nextLocked);
    scheduleSave();
  };

  const handleColorSelect = (nextColor: string) => {
    colorValueRef.current = nextColor;
    setColor(nextColor);
    scheduleSave();
  };

  const isEmpty =
    !titleValueRef.current.trim() && !htmlToPlainText(bodyValueRef.current);

  const normalizeLinkUrl = (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return '';
    }
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  const handleOpenLinkModal = () => {
    setLinkText('');
    setLinkUrl('https://');
    setShowLinkModal(true);
  };

  const handleInsertLink = () => {
    const normalizedUrl = normalizeLinkUrl(linkUrl);

    if (!normalizedUrl) {
      Alert.alert('Missing URL', 'Enter a link first.');
      return;
    }

    try {
      const parsedUrl = new URL(normalizedUrl);
      if (!parsedUrl.protocol) {
        throw new Error('Invalid protocol');
      }
    } catch (_) {
      Alert.alert('Invalid URL', 'Please enter a valid link.');
      return;
    }

    const label = linkText.trim() || normalizedUrl;
    richEditorRef.current?.insertLink(label, normalizedUrl);
    setShowLinkModal(false);
  };

  const handleEditorCursorMove = (cursorY: number) => {
    // cursorY is relative to the RichEditor WebView's top.
    // bodyInputYRef.current is the RichEditor's Y offset inside the ScrollView.
    // Together they give the cursor's true position in scroll space.
    const absoluteCursorY = bodyInputYRef.current + cursorY;

    // Subtract ~180px so the cursor sits well above the keyboard + toolbar.
    const targetScroll = Math.max(0, absoluteCursorY - 180);

    editorScrollRef.current?.scrollTo({y: targetScroll, animated: true});
  };

  const handleInsertImage = async () => {
    try {
      const pickerResult = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.8,
      });

      if (pickerResult.didCancel) {
        return;
      }

      if (pickerResult.errorCode) {
        Alert.alert('Image not added', 'Could not open your photo library.');
        return;
      }

      const asset = pickerResult.assets?.[0];
      if (!asset || (!asset.uri && !asset.base64)) {
        Alert.alert('Image not added', 'No image was selected.');
        return;
      }

      const imageUrl = asset.base64 
        ? `data:${asset.type || 'image/jpeg'};base64,${asset.base64}` 
        : asset.uri;

      richEditorRef.current?.insertImage(imageUrl, 'note image');
    } catch (_) {
      Alert.alert(
        'Image not added',
        'Something went wrong while adding image.',
      );
    }
  };

  const handleSpeak = async () => {
    const currentTitle = titleValueRef.current.trim();
    const currentBody = htmlToPlainText(bodyValueRef.current).trim();
    const speechText = currentTitle
      ? `${currentTitle}. ${currentBody}`
      : currentBody;

    if (!speechText.trim()) {
      Alert.alert('Nothing to read', 'Add some text first.');
      return;
    }

    try {
      if (isSpeaking) {
        await Tts.stop();
        setIsSpeaking(false);
        return;
      }

      await Tts.stop();
      setIsSpeaking(true);
      Tts.speak(speechText);
    } catch (_) {
      setIsSpeaking(false);
      Alert.alert('Playback failed', 'Could not start text to speech.');
    }
  };

  const handleFontToolbarAction = (action: string) => {
    if (action === 'insertTable') {
      richEditorRef.current?.insertHTML(
        '<table style="width:100%;border-collapse:collapse;margin:10px 0;"><tr><th style="border:1px solid #999;padding:6px;">Column 1</th><th style="border:1px solid #999;padding:6px;">Column 2</th></tr><tr><td style="border:1px solid #999;padding:6px;">Text</td><td style="border:1px solid #999;padding:6px;">Text</td></tr></table><p></p>',
      );
    }

    if (action === 'insertCodeBlock') {
      richEditorRef.current?.insertHTML(
        '<pre style="background:#f4f4f4;border-radius:8px;padding:10px;white-space:pre-wrap;"><code>Your code here</code></pre><p></p>',
      );
    }

    if (action === 'insertDivider') {
      richEditorRef.current?.insertHTML('<hr/><p></p>');
    }
  };

  const statusLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'saved'
      ? 'Saved'
      : locked
      ? 'Locked note'
      : 'Private note';

  return (
    <View style={styles.root}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={statusBarStyle}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.topIconBtn}
              onPress={handleBack}
              activeOpacity={0.72}>
              <MaterialIcons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.statusWrap}>
              <View style={[styles.statusDot, {backgroundColor: color}]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.topIconBtn,
                showControls && styles.topIconBtnActive,
              ]}
              onPress={() => setShowControls(prev => !prev)}
              activeOpacity={0.72}>
              <MaterialIcons
                name={showControls ? 'close' : 'tune'}
                size={18}
                color={showControls ? colors.accentText : colors.text}
              />
            </TouchableOpacity>
          </View>

          {showControls ? (
            <View style={styles.controlsPanel}>
              <View style={styles.controlsRow}>
                <ControlChip
                  colors={colors}
                  icon="share"
                  label="Share"
                  onPress={handleShare}
                  disabled={isEmpty}
                />
                <ControlChip
                  colors={colors}
                  icon="download"
                  label={isExporting ? 'Exporting' : 'PDF'}
                  onPress={handleExport}
                  disabled={isEmpty || isExporting}
                />
                <ControlChip
                  colors={colors}
                  icon={locked ? 'lock' : 'lock-open'}
                  label={locked ? 'Unlock' : 'Lock'}
                  onPress={toggleLock}
                  active={locked}
                />
                <ControlChip
                  colors={colors}
                  icon={isSpeaking ? 'stop-circle' : 'volume-up'}
                  label={isSpeaking ? 'Stop voice' : 'Read aloud'}
                  onPress={handleSpeak}
                  disabled={isEmpty}
                  active={isSpeaking}
                />
                <ControlChip
                  colors={colors}
                  icon={mode === 'dark' ? 'light-mode' : 'dark-mode'}
                  label={mode === 'dark' ? 'Light' : 'Dark'}
                  onPress={toggleTheme}
                />
                {noteId ? (
                  <ControlChip
                    colors={colors}
                    icon="delete"
                    label="Delete"
                    onPress={() => setShowDeleteModal(true)}
                    danger
                  />
                ) : null}
              </View>

              <View style={styles.paletteWrap}>
                <Text style={styles.paletteLabel}>Accent</Text>
                <View style={styles.paletteRow}>
                  {NOTE_COLORS.map(swatches => {
                    const selected = swatches === color;

                    return (
                      <TouchableOpacity
                        key={swatches}
                        style={[
                          styles.paletteDot,
                          {backgroundColor: swatches},
                          selected && styles.paletteDotSelected,
                        ]}
                        onPress={() => handleColorSelect(swatches)}
                        activeOpacity={0.84}>
                        {selected ? (
                          <MaterialIcons
                            name="check"
                            size={15}
                            color={colors.white}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fontEditorWrap}>
                <View style={styles.fontEditorToggle}>
                  <View style={styles.fontEditorTitleWrap}>
                    <MaterialIcons
                      name="format-size"
                      size={18}
                      color={colors.accentText}
                    />
                    <View style={styles.fontEditorLabelWrap}>
                      <Text style={styles.fontEditorLabel}>
                        Text formatting
                      </Text>
                      <Text style={styles.fontEditorHint}>
                        Floating toolbar outside editor
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.fontEditorActionBtn}
                  onPress={() => setShowFloatingFontEditor(true)}
                  activeOpacity={0.84}
                  disabled={showFloatingFontEditor}>
                  <MaterialIcons
                    name={
                      showFloatingFontEditor
                        ? 'check-circle-outline'
                        : 'open-in-new'
                    }
                    size={16}
                    color={colors.accentText}
                  />
                  <Text style={styles.fontEditorActionText}>
                    {showFloatingFontEditor
                      ? 'Floating toolbar visible'
                      : 'Show floating toolbar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading your note...</Text>
            </View>
          ) : (
            <Animated.View
              style={[
                styles.editorCanvas,
                {opacity: fadeAnim, transform: [{translateY: slideAnim}]},
              ]}>
              <View style={[styles.ambientGlow, {backgroundColor: color}]} />

              <ScrollView
                ref={editorScrollRef}
                style={styles.editorScroll}
                contentContainerStyle={[
                  styles.editorContent,
                  showFloatingFontEditor && styles.editorContentWithFloatingBar,
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <TextInput
                  ref={titleInputRef}
                  style={styles.titleInput}
                  placeholder="Title"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={handleTitleChange}
                  onFocus={() => setShowControls(false)}
                  onBlur={() => {
                    commitSave().catch(() => {});
                  }}
                  selectionColor={color}
                  multiline
                  autoCapitalize="sentences"
                  autoCorrect
                  blurOnSubmit={false}
                  textAlignVertical="top"
                />

                <View style={[styles.bodyAccent, {backgroundColor: color}]} />

                <View
                  style={styles.bodyInput}
                  onLayout={(e) => {
                    bodyInputYRef.current = e.nativeEvent.layout.y;
                  }}>
                  <RichEditor
                    ref={richEditorRef}
                    initialHeight={420}
                    initialContentHTML={body}
                    placeholder="Start writing..."
                    onChange={handleBodyChange}
                    onFocus={() => setShowControls(false)}
                    onBlur={() => {
                      commitSave().catch(() => {});
                    }}
                    onCursorPosition={handleEditorCursorMove}
                    editorStyle={richEditorStyle}
                  />
                </View>
              </ScrollView>
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {showFloatingFontEditor ? (
        <View pointerEvents="box-none" style={styles.floatingFontEditorHost}>
          <View style={styles.floatingFontEditorCard}>
            <View style={styles.floatingFontHeader}>
              <View style={styles.floatingFontTitleWrap}>
                <MaterialIcons
                  name="format-size"
                  size={16}
                  color={colors.accentText}
                />
                <Text style={styles.floatingFontTitle}>Text formatting</Text>
              </View>
              <TouchableOpacity
                style={styles.floatingFontClose}
                onPress={() => setShowFloatingFontEditor(false)}
                activeOpacity={0.8}>
                <MaterialIcons name="close" size={16} color={colors.textSec} />
              </TouchableOpacity>
            </View>

            <RichToolbar
              editor={richEditorRef}
              style={styles.floatingRichToolbar}
              actions={[
                actions.setBold,
                actions.setItalic,
                actions.setUnderline,
                actions.heading1,
                actions.insertBulletsList,
                actions.insertOrderedList,
                actions.insertLink,
                actions.undo,
                actions.redo,
                actions.removeFormat,
              ]}
              selectedIconTint={colors.accent}
              iconTint={colors.textSec}
              onPressAddLink={handleOpenLinkModal}
            />

            <View style={styles.insertActionsWrap}>
              <Text style={styles.insertActionsLabel}>Insert</Text>
              <View style={styles.insertActionsRow}>
                <TouchableOpacity
                  style={styles.insertActionChip}
                  onPress={() => handleFontToolbarAction('insertTable')}
                  activeOpacity={0.82}>
                  <MaterialIcons
                    name="table-chart"
                    size={15}
                    color={colors.accentText}
                  />
                  <Text style={styles.insertActionChipText}>Table</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.insertActionChip}
                  onPress={() => handleFontToolbarAction('insertCodeBlock')}
                  activeOpacity={0.82}>
                  <MaterialIcons
                    name="code"
                    size={15}
                    color={colors.accentText}
                  />
                  <Text style={styles.insertActionChipText}>Code block</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.insertActionChip}
                  onPress={() => handleFontToolbarAction('insertDivider')}
                  activeOpacity={0.82}>
                  <MaterialIcons
                    name="horizontal-rule"
                    size={15}
                    color={colors.accentText}
                  />
                  <Text style={styles.insertActionChipText}>Divider</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.insertActionChip}
                  onPress={handleInsertImage}
                  activeOpacity={0.82}>
                  <MaterialIcons
                    name="image"
                    size={15}
                    color={colors.accentText}
                  />
                  <Text style={styles.insertActionChipText}>Image</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <DeleteModal
        visible={showDeleteModal}
        noteTitle={title}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />

      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}>
        <Pressable
          style={styles.linkModalBackdrop}
          onPress={() => setShowLinkModal(false)}>
          <Pressable style={styles.linkModalCard} onPress={() => {}}>
            <Text style={styles.linkModalTitle}>Insert link</Text>

            <Text style={styles.linkInputLabel}>Display text (optional)</Text>
            <TextInput
              value={linkText}
              onChangeText={setLinkText}
              placeholder="Example: Project docs"
              placeholderTextColor={colors.textMuted}
              style={styles.linkInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.linkInputLabel}>URL</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://example.com"
              placeholderTextColor={colors.textMuted}
              style={styles.linkInput}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.linkModalActions}>
              <TouchableOpacity
                style={styles.linkModalCancel}
                onPress={() => setShowLinkModal(false)}
                activeOpacity={0.82}>
                <Text style={styles.linkModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkModalConfirm}
                onPress={handleInsertLink}
                activeOpacity={0.82}>
                <Text style={styles.linkModalConfirmText}>Insert</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    safe: {
      flex: 1,
    },
    keyboard: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 8,
      gap: 12,
    },
    topIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topIconBtnActive: {
      backgroundColor: colors.accentDim,
      borderColor: colors.accentSoft,
    },
    statusWrap: {
      flex: 1,
      minHeight: 42,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: RADIUS.pill,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textFaint,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    controlsPanel: {
      marginHorizontal: 18,
      marginBottom: 10,
      padding: 16,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 14,
    },
    controlsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    controlChip: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceUp,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    controlChipActive: {
      backgroundColor: colors.accentDim,
      borderColor: colors.accentSoft,
    },
    controlChipDanger: {
      backgroundColor: colors.dangerDim,
      borderColor: colors.dangerDim,
    },
    controlChipDisabled: {
      opacity: 0.42,
    },
    controlChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    controlChipTextActive: {
      color: colors.accentText,
    },
    controlChipTextDanger: {
      color: colors.dangerText,
    },
    paletteWrap: {
      gap: 10,
    },
    paletteLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textFaint,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    paletteRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    fontEditorWrap: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.accentSoft,
      backgroundColor: colors.accentDim,
    },
    fontEditorToggle: {
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    fontEditorTitleWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flex: 1,
    },
    fontEditorLabelWrap: {
      flex: 1,
      gap: 2,
    },
    fontEditorLabel: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
      color: colors.accentText,
      textTransform: 'uppercase',
    },
    fontEditorHint: {
      fontSize: 11,
      color: colors.accentText,
      opacity: 0.82,
    },
    fontEditorActionBtn: {
      minHeight: 40,
      marginHorizontal: 10,
      marginBottom: 10,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.accentSoft,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
    },
    fontEditorActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accentText,
      letterSpacing: 0.2,
    },
    floatingFontEditorHost: {
      position: 'absolute',
      right: 14,
      bottom: 16,
      left: 14,
      alignItems: 'center',
    },
    floatingFontEditorCard: {
      width: '100%',
      maxWidth: 760,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.accentSoft,
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 12,
      overflow: 'hidden',
    },
    floatingFontHeader: {
      minHeight: 44,
      borderBottomWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    floatingFontTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    floatingFontTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accentText,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    floatingFontClose: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceUp,
      borderWidth: 1,
      borderColor: colors.border,
    },
    floatingRichToolbar: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
    },
    insertActionsWrap: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      gap: 8,
    },
    insertActionsLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
    },
    insertActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    insertActionChip: {
      minHeight: 34,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.accentSoft,
      backgroundColor: colors.accentDim,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    insertActionChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accentText,
    },
    linkModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.42)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    linkModalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 10,
    },
    linkModalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    linkInputLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSec,
    },
    linkInput: {
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceUp,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    linkModalActions: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    linkModalCancel: {
      minHeight: 40,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceUp,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkModalCancelText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSec,
    },
    linkModalConfirm: {
      minHeight: 40,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.accentSoft,
      backgroundColor: colors.accentDim,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkModalConfirmText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.accentText,
    },
    paletteDot: {
      width: 30,
      height: 30,
      borderRadius: RADIUS.pill,
      borderWidth: 2,
      borderColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paletteDotSelected: {
      transform: [{scale: 1.08}],
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.textSec,
      fontSize: 14,
    },
    editorCanvas: {
      flex: 1,
      marginHorizontal: 12,
      marginBottom: 12,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 18},
      shadowOpacity: 0.12,
      shadowRadius: 28,
      elevation: 8,
    },
    ambientGlow: {
      position: 'absolute',
      top: -120,
      right: -40,
      width: 240,
      height: 240,
      borderRadius: 120,
      opacity: 0.12,
    },
    editorScroll: {
      flex: 1,
    },
    editorContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 26,
      paddingBottom: 48,
    },
    editorContentWithFloatingBar: {
      paddingBottom: 240,
    },
    titleInput: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '700',
      letterSpacing: -1,
      padding: 0,
      margin: 0,
      minHeight: 46,
    },
    bodyAccent: {
      width: 56,
      height: 4,
      borderRadius: RADIUS.pill,
      marginTop: 18,
      marginBottom: 18,
      opacity: 0.95,
    },
    bodyInput: {
      minHeight: 420,
    },
  });
