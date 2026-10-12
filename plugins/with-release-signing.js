// Config plugin: signs local release builds with the Faithly upload key.
// The keystore and passwords are never in the repository; they are read at build time from
// Gradle properties (~/.gradle/gradle.properties) or environment variables:
//   FAITHLY_UPLOAD_STORE_FILE, FAITHLY_UPLOAD_STORE_PASSWORD, FAITHLY_UPLOAD_KEY_ALIAS, FAITHLY_UPLOAD_KEY_PASSWORD
// Without them the release build keeps the template's debug signing, and
// scripts/build-apk.mjs refuses to produce faithly.apk. EAS Build uses its own credentials.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// faithly-release-signing';

const RELEASE_CONFIG = `
        ${MARKER}
        if (findProperty('FAITHLY_UPLOAD_STORE_FILE') ?: System.getenv('FAITHLY_UPLOAD_STORE_FILE')) {
            faithlyRelease {
                storeFile file(findProperty('FAITHLY_UPLOAD_STORE_FILE') ?: System.getenv('FAITHLY_UPLOAD_STORE_FILE'))
                storePassword findProperty('FAITHLY_UPLOAD_STORE_PASSWORD') ?: System.getenv('FAITHLY_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('FAITHLY_UPLOAD_KEY_ALIAS') ?: System.getenv('FAITHLY_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('FAITHLY_UPLOAD_KEY_PASSWORD') ?: System.getenv('FAITHLY_UPLOAD_KEY_PASSWORD')
            }
        }`;

function apply(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const withConfig = gradle.replace(/signingConfigs \{/, (m) => `${m}${RELEASE_CONFIG}`);
  const withRelease = withConfig.replace(
    /(release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.findByName(\'faithlyRelease\') ?: signingConfigs.debug',
  );
  if (withConfig === gradle || withRelease === withConfig) {
    throw new Error('with-release-signing: android/app/build.gradle layout changed; update the plugin.');
  }
  return withRelease;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = apply(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.apply = apply;
