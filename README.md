# 📓 GoodNote

[![React Native](https://img.shields.io/badge/React_Native-0.74.5-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Platform](https://img.shields.io/badge/Platform-Android_|_iOS-brightgreen)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**GoodNote** is a premium, distraction-free note-taking application designed for focus and privacy. It features a unique **Bubble Canvas** interface that makes organizing thoughts feel natural and interactive, combined with robust security and export tools.

---

## ✨ Key Features

### 🫧 Bubble Canvas & Grid Layouts
Switch between a traditional sorted grid or a dynamic, interactive bubble canvas where notes float freely. Avoid clutter with built-in collision detection and smooth animations.

### 🔒 Biometric Privacy
Keep your thoughts private. Lock specific notes or the entire app using **Biometric Authentication** (Fingerprint/FaceID) or a secure PIN.

### ✍️ Premium Rich Text Editor
Experience a refined writing environment with:
- Full text formatting (Bold, Italic, Lists)
- Image inserts
- Real-time auto-save
- Clean, distraction-free interface

### 📄 PDF Export & Sharing
Professional PDF generation for any note. Share your ideas as structured documents with a single tap.

### 🎨 Design Systems
Beautifully crafted UI with support for:
- **Matte Minimal**: A clean, professional look and feel.
- **Cyberpunk / Interactive**: For those who want a more dynamic experience.
- **Dark & Light Modes**: Full system-aware theme support.

### 📱 Android Home Screen Widget
Quickly view and access your most important notes directly from your home screen with a sleek, interactive widget.

---

## 🛠️ Tech Stack

- **Core**: React Native (0.74.5)
- **Database**: WatermelonDB (Offline-first, high performance)
- **Navigation**: React Navigation
- **Security**: React Native Biometrics & Keychain
- **Styling**: Context-based dynamic theme engine
- **Export**: React Native HTML to PDF

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- Android Studio / Xcode
- Yarn or NPM

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/harshlancer/Offline-Notes-App.git
   cd Offline-Notes-App
   ```

2. **Install dependencies**
   ```bash
   yarn install
   # or
   npm install
   ```

3. **Run on Android**
   ```bash
   yarn android
   ```

4. **Run on iOS**
   ```bash
   cd ios && pod install && cd ..
   yarn ios
   ```

---

## 🛡️ Privacy & Security
GoodNote is **Offline-First**. Your notes are stored locally on your device using encrypted storage where necessary, ensuring that your data stays yours. Optional Firebase sync is available but disabled by default.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Developed with ❤️ by [Harsh Lancer](https://github.com/harshlancer)
