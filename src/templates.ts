export const TEMPLATES: Record<string, string> = {
  flutter: `workflows:
  flutter-workflow:
    name: Flutter Workflow
    max_build_duration: 120
    instance_type: mac_mini_m2
    environment:
      android_signing:
        - keystore_reference
      ios_signing:
        distribution_type: app_store
        bundle_identifier: io.codemagic.fluttersample
      vars:
        PACKAGE_NAME: "io.codemagic.fluttersample"
        BUNDLE_ID: "io.codemagic.fluttersample"
      flutter: stable
    scripts:
      - name: Get Flutter packages
        script: |
          flutter pub get
      - name: Flutter analyze
        script: |
          flutter analyze
      - name: Flutter unit tests
        script: |
          flutter test
        ignore_failure: true
      - name: Build Android AAB
        script: |
          flutter build appbundle --release
      - name: Build iOS IPA
        script: |
          flutter build ipa --release \\
            --export-options-plist=/Users/builder/export_options.plist
    artifacts:
      - build/**/outputs/**/*.aab
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log`,

  "react-native": `workflows:
  react-native-android:
    name: React Native Android
    max_build_duration: 120
    instance_type: mac_mini_m2
    environment:
      android_signing:
        - keystore_reference
      vars:
        PACKAGE_NAME: "io.codemagic.sample.reactnative"
    scripts:
      - name: Set Android SDK location
        script: |
          echo "sdk.dir=$ANDROID_SDK_ROOT" > "$CM_BUILD_DIR/android/local.properties"
      - name: Install npm dependencies
        script: |
          npm install
      - name: Run Expo Prebuild
        script: |
          npx expo prebuild
      - name: Build Android release
        script: |
          cd android
          ./gradlew bundleRelease
    artifacts:
      - android/app/build/outputs/**/*.aab

  react-native-ios:
    name: React Native iOS
    max_build_duration: 120
    instance_type: mac_mini_m2
    integrations:
      app_store_connect: codemagic
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: io.codemagic.sample.reactnative
      vars:
        XCODE_WORKSPACE: "CodemagicSample.xcworkspace"
        XCODE_SCHEME: "CodemagicSample"
        APP_STORE_APPLE_ID: 1555555551
    scripts:
      - name: Install npm dependencies
        script: |
          npm install
      - name: Run Expo Prebuild
        script: |
          npx expo prebuild
      - name: Install CocoaPods dependencies
        script: |
          cd ios && pod install
      - name: Set up provisioning profiles
        script: xcode-project use-profiles
      - name: Increment build number
        script: |
          cd $CM_BUILD_DIR/ios
          LATEST_BUILD_NUMBER=$(app-store-connect get-latest-app-store-build-number "$APP_STORE_APPLE_ID")
          agvtool new-version -all $(($LATEST_BUILD_NUMBER + 1))
      - name: Build ipa for distribution
        script: |
          xcode-project build-ipa \\
            --workspace "$CM_BUILD_DIR/ios/$XCODE_WORKSPACE" \\
            --scheme "$XCODE_SCHEME"
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log`,

  ios: `workflows:
  ios-native-workflow:
    name: iOS Native
    max_build_duration: 120
    instance_type: mac_mini_m2
    integrations:
      app_store_connect: codemagic
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: io.codemagic.sample.iosnative
      vars:
        XCODE_WORKSPACE: "CodemagicSample.xcworkspace"
        XCODE_SCHEME: "CodemagicSample"
        APP_STORE_APPLE_ID: 1555555551
      xcode: latest
      cocoapods: default
    scripts:
      - name: Install CocoaPods dependencies
        script: |
          pod install
      - name: Set up provisioning profiles
        script: xcode-project use-profiles
      - name: Increment build number
        script: |
          cd $CM_BUILD_DIR
          LATEST_BUILD_NUMBER=$(app-store-connect get-latest-app-store-build-number "$APP_STORE_APPLE_ID")
          agvtool new-version -all $(($LATEST_BUILD_NUMBER + 1))
      - name: Build ipa for distribution
        script: |
          xcode-project build-ipa \\
            --workspace "$CM_BUILD_DIR/$XCODE_WORKSPACE" \\
            --scheme "$XCODE_SCHEME"
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log`,

  android: `workflows:
  native-android:
    name: Native Android
    max_build_duration: 120
    instance_type: mac_mini_m2
    environment:
      android_signing:
        - keystore_reference
      vars:
        PACKAGE_NAME: "io.codemagic.sample.androidnative"
    scripts:
      - name: Set Android SDK location
        script: |
          echo "sdk.dir=$ANDROID_SDK_ROOT" > "$CM_BUILD_DIR/local.properties"
      - name: Build Android release
        script: |
          ./gradlew bundleRelease
    artifacts:
      - app/build/outputs/**/*.aab`,

  unity: `workflows:
  unity-android-workflow:
    name: Unity Android Workflow
    max_build_duration: 120
    environment:
      unity: 2022.2.16f1
      android_signing:
        - keystore_reference
      groups:
        - unity_credentials
      vars:
        PACKAGE_NAME: "io.codemagic.unitysample"
    scripts:
      - name: Activate Unity License
        script: |
          $UNITY_HOME/Contents/MacOS/Unity -batchmode -quit -logFile - \\
            -serial \${UNITY_SERIAL} \\
            -username \${UNITY_EMAIL} \\
            -password \${UNITY_PASSWORD}
      - name: Build the project
        script: |
          $UNITY_HOME/Contents/MacOS/Unity -batchmode \\
            -quit \\
            -logFile \\
            -projectPath . \\
            -executeMethod BuildScript.BuildAndroid \\
            -nographics
    artifacts:
      - android/*.aab
    publishing:
      scripts:
        - name: Deactivate Unity License
          script: |
            $UNITY_HOME/Contents/MacOS/Unity -batchmode -quit -logFile - \\
              -returnlicense \\
              -username \${UNITY_EMAIL} \\
              -password \${UNITY_PASSWORD}`,

  "ionic-capacitor": `workflows:
  ionic-capacitor-android:
    name: Ionic Capacitor Android
    max_build_duration: 120
    instance_type: mac_mini_m2
    environment:
      android_signing:
        - keystore_reference
      vars:
        PACKAGE_NAME: "io.codemagic.ionicsample"
      node: latest
    scripts:
      - name: Set up local.properties
        script: |
          echo "sdk.dir=$ANDROID_SDK_ROOT" > "$CM_BUILD_DIR/android/local.properties"
      - name: Install npm dependencies
        script: |
          npm install
      - name: Compile web code
        script: npm run build
      - name: Sync Capacitor
        script: |
          npx cap sync
      - name: Build Android release
        script: |
          cd android
          ./gradlew bundleRelease
    artifacts:
      - android/app/build/outputs/**/*.aab`,

  "ionic-cordova": `workflows:
  ionic-cordova-android:
    name: Ionic Cordova Android
    max_build_duration: 120
    instance_type: mac_mini_m2
    environment:
      android_signing:
        - keystore_reference
      vars:
        PACKAGE_NAME: "io.codemagic.ionicsample"
      node: latest
    scripts:
      - name: Install npm dependencies
        script: |
          npm install
          npm ci
          cvm install 9.0.0
          cvm use 9.0.0
      - name: Setup Cordova Android platform
        script: |
          ionic cordova platform remove android --nosave
          ionic cordova platform add android \\
            --confirm \\
            --no-interactive \\
            --noresources
      - name: Build Android Cordova App
        script: |
          ionic cordova build android \\
            --release \\
            --no-interactive \\
            --prod \\
            --device
      - name: Sign APK
        script: |
          APK_PATH=$(find platforms/android/app/build/outputs/apk/release -name "*.apk" | head -1)
          jarsigner \\
            -sigalg SHA1withRSA \\
            -digestalg SHA1 \\
            -keystore $CM_KEYSTORE_PATH \\
            -storepass $CM_KEYSTORE_PASSWORD \\
            -keypass $CM_KEY_PASSWORD \\
            $APK_PATH $CM_KEY_ALIAS
    artifacts:
      - platforms/android/app/build/outputs/**/*.apk`,
};

/**
 * Get a starter codemagic.yaml template for a given project type.
 * Templates cover build and signing only — publishing is handled via ASC/Google Play tools.
 * @param projectType - One of the supported project types (see listYamlTemplateTypes).
 * @returns The yaml template string, or null if the project type is not recognised.
 */
export function getYamlTemplate(projectType: string): string | null {
  return TEMPLATES[projectType] ?? null;
}

/**
 * List all supported project type keys for yaml templates.
 * @returns Array of project type strings, e.g. ["flutter", "react-native", ...].
 */
export function listYamlTemplateTypes(): string[] {
  return Object.keys(TEMPLATES);
}