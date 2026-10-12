#!/usr/bin/env bash
set -euo pipefail

# Run only with the existing, already provisioned hosted Android SDK/JDK.
# This generates a disposable NON-PRODUCTION key; it never reads repository secrets.
fixture_dir=$(mktemp -d)
trap 'rm -rf "$fixture_dir"' EXIT
mkdir -p build/verification
export HORIZONTUNER_KEYSTORE_PATH="$fixture_dir/contract-test-only.jks"
export HORIZONTUNER_KEYSTORE_PASSWORD=contract-test-only
export HORIZONTUNER_KEY_PASSWORD=contract-test-only
export HORIZONTUNER_KEY_ALIAS=contract-test-only
export HORIZONTUNER_ANDROID_VERSION_CODE=2
export HORIZONTUNER_PREVIOUS_VERSION_CODE=1
export HORIZONTUNER_ANDROID_VERSION_NAME=0.1.0
export HORIZONTUNER_RELEASE_LABEL=v1.8.0-contract-test-only
keytool -genkeypair -noprompt -keystore "$HORIZONTUNER_KEYSTORE_PATH" \
  -storepass:env HORIZONTUNER_KEYSTORE_PASSWORD -keypass:env HORIZONTUNER_KEY_PASSWORD \
  -alias "$HORIZONTUNER_KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 2 \
  -dname 'CN=HorizonTuner Contract Test Only,OU=NON-PRODUCTION'
keytool -exportcert -keystore "$HORIZONTUNER_KEYSTORE_PATH" \
  -storepass:env HORIZONTUNER_KEYSTORE_PASSWORD -alias "$HORIZONTUNER_KEY_ALIAS" \
  -file "$fixture_dir/test-only.der"
HORIZONTUNER_EXPECTED_CERT_SHA256=$(sha256sum "$fixture_dir/test-only.der" | cut -d ' ' -f 1)
export HORIZONTUNER_EXPECTED_CERT_SHA256

python_command=(uv run --no-project --active python ../scripts/build_companion_apk.py)
status=0
env -u HORIZONTUNER_KEYSTORE_PATH -u HORIZONTUNER_KEYSTORE_PASSWORD \
  -u HORIZONTUNER_KEY_ALIAS -u HORIZONTUNER_KEY_PASSWORD \
  "${python_command[@]}" > "$fixture_dir/missing.txt" 2>&1 || status=$?
test "$status" = 1
grep -Fq 'Missing delivery setting: HORIZONTUNER_KEYSTORE_PATH' "$fixture_dir/missing.txt"
printf 'PASS: production entry missing signing configuration; exit=1\n' > build/verification/release-negative-control.txt

# Also protect direct/abbreviated Gradle release use from the old debug fallback.
status=0
env -u HORIZONTUNER_KEYSTORE_PATH -u HORIZONTUNER_KEYSTORE_PASSWORD \
  -u HORIZONTUNER_KEY_ALIAS -u HORIZONTUNER_KEY_PASSWORD \
  -u HORIZONTUNER_APK_DELIVERY_MODE bash ./gradlew --no-daemon :app:assembleOfficialRelease \
  > "$fixture_dir/gradle-missing.txt" 2>&1 || status=$?
test "$status" != 0
grep -Fq 'Release requires scripts/build_companion_apk.py' "$fixture_dir/gradle-missing.txt"
printf 'PASS: direct Gradle release missing configuration; exit=%s\n' "$status" >> build/verification/release-negative-control.txt

# Leaving delivery environment in a maintainer shell must not change debug identity.
HORIZONTUNER_APK_DELIVERY_MODE=test-only bash ./gradlew --no-daemon :app:assembleDebug
"$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging app/build/outputs/apk/debug/app-debug.apk \
  > "$fixture_dir/debug-badging.txt"
grep -Fq "package: name='org.horizontuner.companion' versionCode='1' versionName='0.1.0'" "$fixture_dir/debug-badging.txt"
printf 'PASS: debug package/version unchanged with delivery environment configured\n' >> build/verification/release-negative-control.txt

"${python_command[@]}" --mode test-only | tee build/verification/release-positive-control.txt
apk=app/build/outputs/apk/release/app-release.apk
java scripts/VerifyFontApk.java "$apk" | tee build/verification/release-font-apk.txt

# A real signed APK with an incorrect trust pin must fail; restore the positive receipt afterward.
status=0
HORIZONTUNER_EXPECTED_CERT_SHA256=$(printf '0%.0s' {1..64}) \
  "${python_command[@]}" --mode test-only --verify-apk "$apk" \
  > "$fixture_dir/wrong-pin.txt" 2>&1 || status=$?
test "$status" = 1
grep -Fq 'APK certificate does not match' "$fixture_dir/wrong-pin.txt"
test ! -e build/official-apk/test-only/delivery.json
printf 'PASS: actual signed APK with wrong certificate pin; exit=1; stale receipt removed\n' >> build/verification/release-negative-control.txt
"${python_command[@]}" --mode test-only --verify-apk "$apk" | tee -a build/verification/release-positive-control.txt
cat build/verification/release-negative-control.txt
