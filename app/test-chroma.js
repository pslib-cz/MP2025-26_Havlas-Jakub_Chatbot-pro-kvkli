const { ChromaClient } = require('chromadb');

async function testChroma() {
  const chromaUrl = process.env.CHROMA_URL || 'http://chromadb:8000';
  console.log('Connecting to ChromaDB at:', chromaUrl);
  
  const client = new ChromaClient({ path: chromaUrl });
  
  try {
    const version = await client.version();
    console.log('✓ ChromaDB version:', version);
    
    const heartbeat = await client.heartbeat();
    console.log('✓ Heartbeat:', heartbeat);
    
    const collections = await client.listCollections();
    console.log('✓ Collections:', collections.length);
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error('Full error:', error);
  }
}

testChroma();
