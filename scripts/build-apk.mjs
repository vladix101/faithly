#!/usr/bin/env node
// Local, signed, standalone release APK → dist/faithly.apk
//   npm run build:apk
// Requires JDK 17 and the Android SDK (JAVA_HOME / ANDROID_HOME, defaults below) and the
// FAITHLY_UPLOAD_* signing properties in ~/.gradle/gradle.properties (see README).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
env.JAVA_HOME ??= 'D:/AndroidDev/jdk/jdk-17.0.20.1+1';
env.ANDROID_HOME ??= 'D:/AndroidDev/sdk';
// Phones (ARM) plus x86_64 for emulators; skips 32-bit x86 to keep the APK smaller.
env.ORG_GRADLE_PROJECT_reactNativeArchitectures ??= 'arm64-v8a,armeabi-v7a,x86_64';
env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH}`;
const win = process.platform === 'win32';

function run(cmd, args, cwd = root) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
}

// 1. Signing must be configured, otherwise the APK would be debug-signed.
const gradleProps = path.join(env.GRADLE_USER_HOME ?? path.join(os.homedir(), '.gradle'), 'gradle.properties');
const props = fs.existsSync(gradleProps) ? fs.readFileSync(gradleProps, 'utf8') : '';
for (const key of [
  'FAITHLY_UPLOAD_STORE_FILE',
  'FAITHLY_UPLOAD_STORE_PASSWORD',
  'FAITHLY_UPLOAD_KEY_ALIAS',
  'FAITHLY_UPLOAD_KEY_PASSWORD',
]) {
  if (!props.includes(`${key}=`) && !env[key])
    throw new Error(`Missing ${key} (in ${gradleProps} or environment). See README "Potpisivanje".`);
}

// 2. Content database must be current, then generate the native project and build.
run('npm', ['run', 'test:content']);
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install']);
fs.writeFileSync(path.join(root, 'android', 'local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '/')}\n`);
run(path.join(root, 'android', win ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', '--no-daemon'], path.join(root, 'android'));

// 3. Verify the signature and copy to dist/faithly.apk.
const built = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const buildTools = fs.readdirSync(path.join(env.ANDROID_HOME, 'build-tools')).sort().pop();
const apksigner = path.join(env.ANDROID_HOME, 'build-tools', buildTools, win ? 'apksigner.bat' : 'apksigner');
const certs = execFileSync(apksigner, ['verify', '--print-certs', built], { env, shell: win }).toString();
if (/CN=Android Debug/.test(certs)) throw new Error('APK is signed with the debug key; check signing properties.');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const dest = path.join(root, 'dist', 'faithly.apk');
fs.copyFileSync(built, dest);
console.log(`\nSigned APK: ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)\n${certs.split('\n').slice(0, 3).join('\n')}`);
