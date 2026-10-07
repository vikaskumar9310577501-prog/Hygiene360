const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
  stdio: 'inherit'
});

setTimeout(() => {
  const tester = spawn('node', [path.join(__dirname, 'backend-test.js')], {
    stdio: 'inherit'
  });

  tester.on('exit', (code) => {
    server.kill();
    process.exit(code);
  });
}, 2000);
