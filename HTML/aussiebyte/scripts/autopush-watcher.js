// Simple file watcher that runs the PowerShell autopush script when files change.
// Usage:
//   node autopush-watcher.js        # watches and triggers autopush on changes (debounced)
//   node autopush-watcher.js --run  # run once immediately then exit

const { spawn } = require('child_process');
const path = require('path');
const chokidar = require('chokidar');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(__dirname, 'autopush.ps1');
const isWindows = process.platform === 'win32';

function runAutopush(message) {
  const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
  if (message) args.push('-Message', message);
  const ps = spawn('powershell', args, { cwd: repoRoot, stdio: 'inherit' });
  ps.on('close', (code) => {
    if (code !== 0) console.error(`autopush exited with code ${code}`);
  });
}

function debounce(fn, wait) {
  let t = null;
  return function(...a) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), wait);
  };
}

const runOnce = process.argv.includes('--run');
if (runOnce) {
  console.log('Running autopush once...');
  runAutopush();
  process.exit(0);
}

console.log('Starting autopush watcher...');

const watcher = chokidar.watch(['**/*', '!node_modules/**', '!\.git/**', '!public/**/uploads/**'], {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  cwd: repoRoot,
  ignoreInitial: true,
});

const debounced = debounce((pathChanged) => {
  const msg = `Auto-change detected: ${new Date().toISOString()} - ${pathChanged}`;
  console.log(msg);
  runAutopush(msg);
}, 500);

watcher.on('all', (event, changedPath) => {
  // Only respond to add/change/unlink events
  if (!['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event)) return;
  debounced(changedPath);
});

watcher.on('error', (err) => console.error('Watcher error:', err));

process.on('SIGINT', () => {
  console.log('Stopping watcher...');
  watcher.close();
  process.exit(0);
});
