const [major, minor, patch] = process.versions.node.split(".").map(Number);
const minimum = { 22: [23, 5], 24: [22, 3], 26: [13, 1] }[major];
if (!minimum || minor < minimum[0] || (minor === minimum[0] && patch < minimum[1])) {
  console.error("Tempo requires patched Node.js LTS: 22.23.5+, 24.22.3+, or 26.13.1+ on those release lines.");
  process.exit(1);
}
