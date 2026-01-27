#!/bin/bash
# Debug script for ChromaDB issues on VPS

echo "=== ChromaDB Debug Information ==="
echo ""

echo "1. Container Status:"
docker ps -a | grep chromadb
echo ""

echo "2. ChromaDB Logs (last 100 lines):"
docker logs chromadb --tail 100
echo ""

echo "3. ChromaDB Health Check:"
docker exec chromadb curl -f http://localhost:8000/api/v1/heartbeat 2>/dev/null && echo "✓ Health check passed" || echo "✗ Health check failed"
echo ""

echo "4. Alternative health check (root):"
docker exec chromadb curl -f http://localhost:8000/ 2>/dev/null && echo "✓ Root endpoint accessible" || echo "✗ Root endpoint failed"
echo ""

echo "5. Check if curl is installed:"
docker exec chromadb which curl 2>/dev/null && echo "✓ curl is installed" || echo "✗ curl not found - this is the problem!"
echo ""

echo "6. Volume permissions:"
docker exec chromadb ls -la /chroma/chroma 2>/dev/null || echo "Cannot access /chroma/chroma"
echo ""

echo "7. ChromaDB process:"
docker exec chromadb ps aux 2>/dev/null || echo "Cannot list processes"
echo ""

echo "8. Network connectivity:"
docker exec chromadb wget -O- http://localhost:8000/ 2>/dev/null | head -n 5 || echo "wget test failed"
echo ""

echo "9. Container inspect (restart count):"
docker inspect chromadb | grep -A 3 "RestartCount"
