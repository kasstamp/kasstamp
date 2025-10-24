# KasStamp File Stamping System

## Overview

KasStamp is a comprehensive proof-of-existence system that allows users to create immutable timestamps of digital files on the Kaspa blockchain. The system operates entirely client-side, ensuring user privacy and data control. Files are processed, optionally compressed and encrypted, and stored as blockchain transactions that prove the file existed at a specific point in time.

## Table of Contents

1. [System Overview](#system-overview)
2. [Stamping Modes](#stamping-modes)
3. [Complete Stamping Process](#complete-stamping-process)
4. [JSON Payload Structure](#json-payload-structure)
5. [Chunking Strategy](#chunking-strategy)
6. [Transaction Structure](#transaction-structure)
7. [Fee Structure](#fee-structure)
8. [Receipt System](#receipt-system)
9. [Verification Process](#verification-process)
10. [User Experience Flow](#user-experience-flow)
11. [Security Model](#security-model)
12. [Error Handling](#error-handling)
13. [Performance Characteristics](#performance-characteristics)

## System Overview

KasStamp supports three distinct modes of operation, each offering different levels of privacy, cost, and recoverability. All modes automatically handle file chunking when necessary, ensuring that files of any size can be stamped.

The system is designed to be:

- **Secure**: Uses industry-standard cryptographic functions
- **Private**: All processing happens client-side
- **Efficient**: Optimized for blockchain storage costs
- **Flexible**: Supports various file types and sizes
- **Verifiable**: Multiple verification methods available

## Stamping Modes

### Mode 1: Public Inline Mode 🌍

**Purpose and Philosophy**
The public inline mode stores the actual file content directly on the blockchain, making it recoverable by anyone. This mode prioritizes content preservation and public verifiability over privacy. It's ideal for files that are meant to be publicly accessible or where content recovery is more important than privacy.

**What Gets Stored**

- The actual file content (optionally compressed)
- File metadata (name, size, MIME type, timestamp)
- Chunking information if file is large
- Merkle tree root for multi-chunk files

**Privacy Characteristics**

- No privacy - content is publicly visible
- Anyone can download and view the file
- Content is permanently stored on the blockchain
- Perfect for public documents or open-source materials

**Cost Structure**

- Cost proportional to file size
- Base transaction fee plus data storage fee
- Compression can reduce costs for compressible files
- Chunking adds overhead but enables large files

**Recovery and Verification**

- Anyone can recover the complete file
- No special keys or permissions required
- Full content verification possible
- Content can be shared by sharing transaction IDs

**Use Cases**

- Open-source software and documentation
- Public records and announcements
- Educational materials and tutorials
- Creative works meant for public consumption
- Any file where public access is desired

**Limitations**

- No privacy - content is permanently public
- Higher costs for large files
- Content cannot be made private later
- Blockchain storage is permanent and immutable

### Mode 2: Private Inline Mode 🔒

**Purpose and Philosophy**
The private inline mode provides a balance between content recovery and privacy. It stores encrypted file content on the blockchain, ensuring that only users with the appropriate decryption key can recover the content. This mode uses the wallet's private key for encryption, simplifying key management while maintaining security.

**What Gets Stored**

- Encrypted file content (optionally compressed before encryption)
- File metadata (name, size, MIME type, timestamp)
- Encryption metadata and key derivation information
- Chunking information for large encrypted files

**Privacy Characteristics**

- High privacy - content is encrypted
- Only wallet holders can decrypt and view content
- Content appears as random encrypted data to others
- Perfect balance of privacy and recoverability

**Cost Structure**

- Similar to public mode plus encryption overhead
- Slightly higher costs due to encryption padding
- Compression before encryption can reduce costs
- Chunking enables large encrypted files

**Recovery and Verification**

- Requires the wallet's private key for decryption
- Content can be fully recovered and verified
- Decryption is deterministic - same wallet always produces same result
- Content remains private to wallet holders

**Use Cases**

- Personal documents and photos
- Business communications and contracts
- Sensitive research data
- Private creative works
- Any file where controlled access is needed

**Limitations**

- Requires wallet access for decryption
- Lost wallet means lost content
- Cannot share content without sharing wallet access
- Encryption adds computational overhead

## Complete Stamping Process

### Phase 1: File Selection and Validation

**File Input Methods**
Users can provide files through multiple methods: file picker dialog, drag-and-drop interface, or direct text input. The system accepts any file type and size, with appropriate warnings for very large files.

**File Validation**
The system validates each file before processing, checking file size limits, type compatibility, and potential issues. Large files trigger warnings about increased costs and processing time. Invalid files are rejected with clear error messages.

**Mode Selection**
Users choose between the three stamping modes based on their privacy and cost requirements. The interface provides clear descriptions of each mode's characteristics, costs, and use cases to help users make informed decisions.

**Processing Options**
Users can enable optional compression to reduce file size and costs. The system shows estimated compression ratios and cost savings. For private mode, users can choose between wallet-derived encryption or random key generation.

### Phase 2: File Processing

**Hash Calculation**
Every file processing begins with calculating the SHA-256 hash of the original file. This hash serves as the unique fingerprint and is used for verification in all modes.

**Compression (Optional)**
If compression is enabled, the system applies GZIP compression to reduce file size. The compression ratio is calculated and displayed to the user. Compression is most effective for text-based files and less effective for already compressed formats.

**Encryption (Private Mode Only)**
For private mode, the system derives encryption keys from the wallet's private key using a deterministic key derivation function. Each chunk gets its own derived key to ensure security. The encryption uses AES-GCM for authenticated encryption.

**Chunking Decision**
The system automatically determines if chunking is needed based on file size and transaction limits. Large files are split into multiple chunks, each fitting within blockchain transaction size limits. Small files remain as single chunks.

**Chunk Creation**
When chunking is required, the system splits the file into multiple chunks, each with a unique index and digest. A group ID links all chunks together. The system calculates a Merkle tree root for verification purposes.

### Phase 3: Transaction Building

**Envelope Creation**
Each chunk is packaged into standardized envelopes containing metadata and payload data. Envelopes include version information, content type, and processing metadata.

**Transaction Construction**
The system builds blockchain transactions for each envelope, using the user's wallet address. Transactions are self-transfers with zero KAS amount but containing the envelope data in the transaction payload.

**Fee Calculation**
The system calculates precise fees for each transaction based on data size, transaction complexity, and network conditions. Users see detailed fee breakdowns before confirming the stamping process.

**Transaction Validation**
Before broadcasting, the system validates all transactions to ensure they meet blockchain requirements and will be accepted by the network. Invalid transactions are rejected with specific error messages.

### Phase 4: Blockchain Submission

**Transaction Broadcasting**
The system broadcasts all transactions to the Kaspa network. The system monitors transaction status and provides real-time updates.

**Confirmation Monitoring**
The system tracks transaction confirmations and provides progress updates. Users can see which transactions are pending, confirmed, or failed. Failed transactions can be retried automatically or manually.

**Block Time Recording**
Once transactions are confirmed, the system records the exact block time and height. This information is crucial for the proof-of-existence timestamp and is included in all receipts.

### Phase 5: Receipt Generation

**Local JSON Receipt**
The system generates a comprehensive local receipt containing all transaction details, file metadata, processing information, and verification instructions. This receipt serves as the primary record for future verification.

**Receipt Storage**
The system offers to save the local receipt to the user's device. Users can choose the storage location and format. The receipt can be exported in various formats for backup purposes.

## JSON Payload Structure

### Binary Payload Format

The transaction payload follows a structured binary format consisting of metadata length, JSON metadata, separator, and raw binary data. This format ensures efficient storage and parsing of stamped content.

**Payload Components:**

- **Metadata Length**: 4-byte little-endian uint32 indicating metadata JSON length
- **Metadata**: JSON containing only `groupId` and `mode` flag
- **Separator**: 4 zero bytes (0x00, 0x00, 0x00, 0x00) marking data boundary
- **Raw Binary Data**: Serialized `FullPayloadStructure` (plaintext or encrypted)

### JSON Metadata Structure

#### For PUBLIC Mode (Plaintext)

**Chunk Transaction:**
Contains metadata for individual file chunks including file information, chunk indexing, digest, Merkle root, and processing details.

**Multi-Chunk Files:**
For multi-chunk files, each chunk contains the complete file metadata and Merkle root, enabling verification without requiring a separate manifest transaction.

#### For PRIVATE Mode (Encrypted)

**Chunk Transaction:**
Contains encrypted metadata for individual file chunks where sensitive information like filename, file size, and digest are encrypted using wallet-derived keys.

**Multi-Chunk Files:**
For multi-chunk files, each chunk contains the complete encrypted file metadata and Merkle root, enabling verification without requiring a separate manifest transaction.

### Transaction Envelope (Minimal Metadata)

The transaction envelope metadata contains only essential information for payload processing:

**Metadata Fields:**

- `groupId`: Unique identifier for grouping related chunks (required for private mode decryption)
- `mode`: Stamping mode ("public" or "private")

### FullPayloadStructure (Serialized in Binary Data)

The actual file metadata is stored in the binary data section as a serialized `FullPayloadStructure` containing all file information, chunk details, and processing metadata.

**Important Notes:**

- This structure is serialized into binary and stored in the "Raw Binary Data" section
- For private mode, this entire structure is encrypted before serialization
- Only chunk transactions exist (no separate manifest transactions)
- **`chunkTxIds` are NOT stored in the payload** - they are stored in the local receipt only
- Transaction IDs are generated after stamping and stored separately

### Field Descriptions

| Field         | Type          | Description                                   |
| ------------- | ------------- | --------------------------------------------- |
| `fileName`    | `string`      | Original filename (encrypted in private mode) |
| `chunkIndex`  | `number`      | Chunk index (0-based)                         |
| `totalChunks` | `number`      | Total number of chunks                        |
| `digest`      | `string`      | SHA-256 hash (encrypted in private mode)      |
| `timestamp`   | `string`      | ISO 8601 timestamp                            |
| `chunkData`   | `Uint8Array?` | Actual chunk data (for chunks only)           |

## Chunking Strategy

### Automatic Chunking Triggers

**Size-Based Chunking**
Files exceeding the maximum transaction payload size are automatically chunked. The system calculates the optimal chunk size based on current network conditions and transaction limits.

**Network Condition Adaptation**
The chunking strategy adapts to network conditions, using smaller chunks during high-fee periods and larger chunks during low-fee periods. This optimization helps minimize total costs.

**Content Type Consideration**
Different file types may have different optimal chunk sizes. The system considers file type when determining chunking strategy, though this is transparent to the user.

### Chunk Organization

**Group Identification**
All chunks from a single file share a common group ID, enabling the system to identify related chunks and reconstruct the original file.

**Sequential Indexing**
Chunks are numbered sequentially from 0 to N-1, where N is the total number of chunks. This ordering is essential for proper reconstruction.

**Merkle Tree Construction**
The system builds a Merkle tree from chunk digests, creating a single root hash that represents all chunks. This enables efficient verification of chunk integrity.

### Chunk Recovery

**Parallel Processing**
When recovering chunks, the system can fetch multiple chunks in parallel to improve performance. The order of chunk retrieval doesn't matter due to the indexing system.

**Integrity Verification**
Each chunk includes its own digest for individual verification. The Merkle tree enables verification of the complete set of chunks without downloading all data.

**Error Handling**
Missing or corrupted chunks are detected and reported. The system can attempt to recover from alternative sources or request re-transmission of specific chunks.

## Transaction Structure

### Envelope Format

**Version Information**
All envelopes include version numbers to ensure compatibility as the system evolves. Version mismatches are handled gracefully with appropriate error messages.

**Content Type Identification**
Envelopes specify the type of content (chunk) and include MIME type information for proper handling during recovery.

**Metadata Storage**
Rich metadata is stored in each envelope, including file information, processing details, and blockchain-specific data. This metadata enables comprehensive verification and recovery.

**Payload Data**
The actual file content (or encrypted content) is stored in the envelope payload.

### Transaction Types

**Chunk Transactions**
Each chunk is stored in its own transaction, enabling parallel processing and independent verification. Chunk transactions include the chunk data and associated metadata.

**Self-Transfer Structure**
All stamping transactions are self-transfers with zero KAS amount, ensuring that only the data payload incurs costs. This structure maximizes cost efficiency.

### Blockchain Integration

**Kaspa-Specific Features**
The system leverages Kaspa's unique features, including its DAG structure and UTXO model, to optimize storage and verification.

**Network Compatibility**
The system is designed to work across different Kaspa networks (mainnet, testnet, devnet) with appropriate configuration and validation.

**Future-Proofing**
The transaction structure is designed to be extensible, allowing for future enhancements without breaking existing functionality.

## Fee Structure

### Base Fees

**Transaction Base Fee**
Every transaction incurs a base fee regardless of data size. This fee covers the basic transaction processing and network validation.

**Network Fee**
Additional fees may apply based on network congestion and priority requirements. The system estimates these fees based on current network conditions.

**Data Storage Fee**
Fees are calculated based on the amount of data stored in each transaction. This fee is proportional to the payload size and includes envelope overhead.

### Mode-Specific Costs

**Public Mode Costs**
Public mode costs are proportional to file size, including compression benefits. Large files may require multiple transactions, each incurring base fees.

**Private Mode Costs**
Private mode costs are similar to public mode but include encryption overhead. The additional cost is typically small compared to the data storage costs.

### Cost Optimization

**Compression Benefits**
Compression can significantly reduce costs for compressible files. The system shows estimated savings and recommends compression for appropriate file types.

**Chunking Efficiency**
Optimal chunking minimizes total costs by balancing chunk size against base transaction fees. The system automatically optimizes chunk sizes.

**Network Timing**
Costs can vary based on network conditions. The system may recommend waiting for lower-fee periods for large files.

## Receipt System

### Local JSON Receipt

**Comprehensive Information**
The local receipt contains all information needed for verification, including transaction IDs, file metadata, processing details, and verification instructions.

**Human-Readable Format**
The receipt is formatted for easy reading and includes clear instructions for verification. Users can understand what was stamped and how to verify it.

**Export Options**
Receipts can be exported in various formats (JSON, PDF, text) for different use cases. The system provides templates for common verification scenarios.

**Backup Recommendations**
The system strongly recommends backing up receipts, as they contain essential information for verification. Multiple backup strategies are suggested.

### Receipt Verification

**Self-Contained Verification**
Receipts contain all necessary information for verification, including transaction IDs and verification instructions.

**Multiple Verification Paths**
The system supports verification through receipts or wallet history, providing redundancy and flexibility.

**Verification Tools**
The system provides tools and instructions for verification, including command-line tools and web interfaces.

## Verification Process

### Verification Methods

**Receipt-Based Verification**
The most comprehensive verification method uses the local receipt to locate and verify all transactions. This method provides the most detailed verification results.

**Wallet History Verification**
Users can verify stamps by examining their wallet transaction history. This method is useful when receipts are lost but requires more manual work.

### Verification Steps

**Transaction Retrieval**
The verification process begins by retrieving all relevant transactions from the blockchain. This includes all chunk transactions for the file.

**Data Extraction**
File data is extracted from the retrieved transactions, including decryption if necessary. The system handles both single-chunk and multi-chunk files.

**Integrity Verification**
The system verifies the integrity of the data using cryptographic hashes and Merkle trees. Any corruption or tampering is detected and reported.

**Content Verification**
For public and private modes, the system verifies that the recovered content matches the original file. This includes hash comparison and content validation.

### Verification Results

**Success Confirmation**
Successful verification confirms that the file existed at the time of stamping and has not been modified. The system provides the exact timestamp and blockchain proof.

**Failure Analysis**
Failed verification provides detailed information about what went wrong, including specific error messages and suggested remediation steps.

**Proof Generation**
The system can generate cryptographic proofs of verification that can be shared with others or used in legal proceedings.

## User Experience Flow

### File Selection Interface

**Drag-and-Drop Support**
Users can drag files directly onto the interface for immediate processing. The system provides visual feedback during drag operations.

**File Browser Integration**
A traditional file browser allows users to select files from their system. The interface supports multiple file selection for batch processing.

**Text Input Option**
Users can input text directly for quick stamping of short content. This option is particularly useful for timestamping messages or notes.

### Mode Selection Interface

**Clear Mode Descriptions**
Each mode is clearly described with its characteristics, costs, and use cases. Visual indicators help users understand the trade-offs.

**Cost Estimation**
Real-time cost estimation helps users make informed decisions. The interface shows how different options affect the total cost.

**Recommendation System**
The system can recommend the best mode based on file characteristics and user preferences.

### Processing Interface

**Progress Indicators**
Real-time progress indicators show the current processing stage, including file analysis, compression, encryption, and chunking.

**Status Updates**
Detailed status updates inform users about what's happening and how long it might take. Error conditions are clearly communicated.

**Cancellation Support**
Users can cancel the processing at any time before transactions are broadcast. Once broadcast, cancellation is not possible.

### Results Interface

**Success Confirmation**
Successful stamping is clearly confirmed with transaction IDs, timestamps, and verification information.

**Receipt Display**
The generated receipt is displayed in a user-friendly format with options to save, export, or share.

**Verification Instructions**
Clear instructions are provided for future verification, including tools and methods available.

## Security Model

### Cryptographic Security

**Hash Function Security**
The system uses SHA-256 for all hashing operations, providing strong cryptographic security against collision attacks.

**Encryption Security**
AES-GCM encryption provides authenticated encryption, ensuring both confidentiality and integrity of encrypted data.

**Key Derivation Security**
The key derivation function uses industry-standard HKDF with proper salt and info parameters to ensure key security.

### Privacy Protection

**Client-Side Processing**
All file processing happens on the user's device, ensuring that sensitive data never leaves the user's control.

**No Server Dependencies**
The system operates entirely client-side, eliminating server-side privacy risks and ensuring user data sovereignty.

**Transparent Operations**
All operations are transparent to the user, with clear information about what data is stored where and how it's protected.

### Key Management

**Wallet Integration**
Private mode uses the wallet's private key for encryption, leveraging existing security infrastructure and user familiarity.

**Deterministic Keys**
Key derivation is deterministic, ensuring that the same wallet always produces the same decryption keys for the same data.

**Key Recovery**
Lost wallets mean lost data, which is clearly communicated to users. The system provides guidance on wallet backup and recovery.

## Error Handling

### File Processing Errors

**Size Limit Errors**
Files exceeding size limits are rejected with clear error messages and suggestions for resolution.

**Type Validation Errors**
Unsupported file types are handled gracefully with appropriate warnings and alternative suggestions.

**Processing Failures**
File processing failures are caught and reported with specific error information and suggested remediation steps.

### Network Errors

**Connection Failures**
Network connectivity issues are detected and handled with retry mechanisms and user notifications.

**Transaction Failures**
Failed transactions are identified and can be retried automatically or manually with appropriate user guidance.

**Confirmation Timeouts**
Long confirmation times are handled with progress indicators and timeout warnings.

### User Error Prevention

**Input Validation**
All user inputs are validated before processing to prevent common errors and provide immediate feedback.

**Confirmation Dialogs**
Critical operations require user confirmation to prevent accidental actions and data loss.

**Clear Error Messages**
Error messages are written in plain language with specific guidance for resolution.

## Performance Characteristics

### Processing Performance

**File Size Scaling**
Processing time scales roughly linearly with file size, with compression and encryption adding overhead.

**Chunking Performance**
Chunking adds minimal overhead and can actually improve performance for very large files by enabling parallel processing.

**Memory Usage**
Memory usage is optimized to handle large files without excessive memory consumption.

### Network Performance

**Transaction Broadcasting**
Multiple transactions can be broadcast in parallel to improve overall performance.

**Confirmation Times**
Confirmation times depend on network conditions and fee levels, with higher fees generally resulting in faster confirmation.

**Verification Performance**
Verification can be performed in parallel for multiple chunks, improving overall verification speed.

### User Experience Performance

**Responsive Interface**
The interface remains responsive during processing, with progress indicators and the ability to cancel operations.

**Background Processing**
Heavy processing operations can run in the background without blocking the user interface.

**Caching and Optimization**
Frequently accessed data is cached to improve performance and reduce network requests.

---

This comprehensive specification provides a complete understanding of how file stamping works in KasStamp, covering all aspects from user interaction to blockchain storage. The system is designed to be secure, efficient, and user-friendly while providing the flexibility to handle various use cases and file types.
