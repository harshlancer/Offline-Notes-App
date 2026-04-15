Android Widget scaffold (react-native-android-widget)

This app includes a light scaffold for adding an Android homescreen widget that shows the 3 most recent notes.

Steps to finish native integration:

1. Install dependency:

   npm install react-native-android-widget

2. Follow the library's Android setup instructions: add AppWidgetProvider, update AndroidManifest.xml, add widget layout XML files under `android/app/src/main/res/layout` and configure `appwidget-provider` XML under `xml/`.

3. Implement a small native bridge that queries WatermelonDB for the 3 most recent notes and populates RemoteViews. You can expose a JS method that returns the latest 3 notes as JSON and call it from your native widget update logic.

4. Example: the JS helper below can be called by native code via Headless JS or a direct bridge.

See: https://github.com/your/widget-lib-docs
