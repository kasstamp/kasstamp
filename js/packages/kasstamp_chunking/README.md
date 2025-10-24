# @kasstamp/chunking

Professional file chunking utilities for Kasstamp. Split large files into manageable chunks for efficient processing and storage.

## What it does

This package is responsible for splitting large files into smaller, manageable chunks. Each chunk includes metadata (index, total count, group ID) and a SHA-256 digest for integrity verification.

## Quick Start

```typescript
import { splitArtifact } from '@kasstamp/chunking';

// Split file into chunks
const fileData = new Uint8Array(await file.arrayBuffer());
const chunks = await splitArtifact(fileData, {
  chunkSize: 20000, // 20KB chunks (blockchain optimized)
  groupId: 'my-file-123',
});

console.log(`Split into ${chunks.length} chunks`);
console.log(
  'Chunk digests:',
  chunks.map((c) => c.digest)
);
```

## Best Practices

- **Chunk Size**: Use 20KB for blockchain transactions, 1MB for network transmission
- **Group IDs**: Use consistent, unique identifiers for related chunks
- **Integrity**: Each chunk has its own SHA-256 digest for verification
