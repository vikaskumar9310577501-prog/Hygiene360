const http = require('http');
const https = require('https');

const TARGET_PORT = 3000;
const TARGET_HOST = '127.0.0.1';
// Vite dev server runs on HTTPS with a self-signed certificate
const targetAgent = new https.Agent({ rejectUnauthorized: false });

process.on('uncaughtException', (err) => {
  if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE' && err.code !== 'EADDRINUSE') {
    console.error('[FORWARDER] Uncaught error:', err.message);
  }
});

function createProxy(port) {
  const server = http.createServer((req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});

    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${TARGET_PORT}` },
      agent: targetAgent
    };

    const proxyReq = https.request(options, (proxyRes) => {
      proxyRes.on('error', () => {});
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
      }
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy to Vite :3000 error: ' + err.message);
      }
    });

    req.pipe(proxyReq, { end: true });
  });

  // WebSocket Forwarding for Vite Hot Module Reloading (HMR)
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});

    const proxyReq = https.request({
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
      agent: targetAgent
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      proxySocket.on('error', () => {
        try { socket.destroy(); } catch (e) {}
      });
      socket.on('error', () => {
        try { proxySocket.destroy(); } catch (e) {}
      });

      if (!socket.destroyed) {
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          Object.keys(proxyRes.headers).map(h => `${h}: ${proxyRes.headers[h]}`).join('\r\n') +
          '\r\n\r\n'
        );
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      }
    });

    proxyReq.on('error', () => {
      try { socket.destroy(); } catch (e) {}
    });

    proxyReq.end();
  });

  server.on('error', (err) => {
    console.warn(`[FORWARDER :${port}] Server error:`, err.message);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[FORWARDER] Listening on http://0.0.0.0:${port} -> Forwarding to http://localhost:${TARGET_PORT}`);
  });

  return server;
}

// Support both 3001 and 3002
createProxy(3001);
createProxy(3002);
