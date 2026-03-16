#!/bin/bash
# Debug script for ChromaDB issues on VPS

echo "=== ChromaDB Debug Information ==="
echo ""

echo "1. Container Status:"
docker ps -a | grep chromadb
echo ""

echo "2. ChromaDB Logs (last 50 lines):"
docker logs chromadb --tail 50
echo ""

echo "3. Health Check Status (from Docker):"
docker inspect chromadb --format='{{.State.Health.Status}}'
echo ""

echo "4. Python-based HTTP health check:"
docker exec chromadb python3 -c "
import http.client
try:
    conn = http.client.HTTPConnection('localhost', 8000, timeout=5)
    conn.request('GET', '/api/v1')
    response = conn.getresponse()
    print('✓ ChromaDB API is responding (status:', response.status, ')')
    print('Response:', response.read().decode())
    conn.close()
except Exception as e:
    print('✗ Health check failed:', str(e))
" 2>/dev/null || echo "✗ Python health check failed"
echo ""

echo "5. Volume permissions and data:"
docker exec chromadb ls -lah /chroma/chroma 2>/dev/null || echo "Cannot access /chroma/chroma"
echo ""

echo "6. Check port binding:"
docker port chromadb
echo ""

echo "7. Test from app container (if running):"
if docker ps | grep -q nextjs_app; then
    echo "Testing ChromaDB connectivity from app container..."
    docker exec nextjs_app node -e "
const http = require('http');
const options = { hostname: 'chromadb', port: 8000, path: '/api/v1', method: 'GET' };
const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', (d) => console.log('Response:', d.toString()));
});
req.on('error', (e) => console.error('Error:', e));
req.end();
" || echo "✗ Node.js test failed"
else
    echo "App container not running"
fi
echo ""

echo "8. Network inspection:"
docker network inspect apollo_app-network | grep -A 10 chromadb
echo ""

echo "9. Recent health check logs:"
docker inspect chromadb --format='{{range .State.Health.Log}}{{.Output}}{{end}}' | tail -5
echo ""

echo "10. Container resource usage:"
docker stats chromadb --no-stream
