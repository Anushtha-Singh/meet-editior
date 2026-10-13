const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Only run auto-installer on Linux hosting environments (e.g. Render, Railway)
if (process.platform !== 'linux') {
  process.exit(0);
}

// 1. Check if system java is already present
try {
  execSync('java -version', { stdio: 'ignore' });
  console.log('System Java runtime is already available.');
  process.exit(0);
} catch (_) {}

// 2. Check if local .jdk is already downloaded
const targetDir = path.join(__dirname, '..', '.jdk');
const targetJava = path.join(targetDir, 'bin', 'java');

if (fs.existsSync(targetJava)) {
  console.log('Local JDK is already installed at', targetDir);
  process.exit(0);
}

console.log('Downloading OpenJDK 17 for Linux host...');
fs.mkdirSync(targetDir, { recursive: true });

try {
  const url =
    'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz';
  execSync(`curl -sSL "${url}" | tar -xz -C "${targetDir}" --strip-components=1`, {
    stdio: 'inherit',
    timeout: 60000,
  });
  console.log('OpenJDK successfully installed at', targetDir);
} catch (error) {
  console.warn('Automatic JDK download failed:', error.message);
}
