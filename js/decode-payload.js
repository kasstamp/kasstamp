#!/usr/bin/env node

/**
 * KasStamp Payload Decoder Utility - Simple Version
 *
 * Usage: node decode-payload.js <hex-payload>
 */

function hexToBytes(hex) {
  const cleanHex = hex.replace(/^0x/, '').replace(/\s+/g, '');

  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }

  return bytes;
}

function decodeStampingPayload(hexPayload) {
  try {
    const bytes = hexToBytes(hexPayload);
    console.log(`Total payload size: ${bytes.length} bytes`);

    if (bytes.length < 8) {
      throw new Error('Payload too short');
    }

    // Read metadata length (4 bytes, little-endian)
    const metadataLength = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
    console.log(`Metadata length: ${metadataLength} bytes`);

    // Extract metadata JSON
    const metadataBytes = bytes.slice(4, 4 + metadataLength);
    const metadataJson = new TextDecoder('utf-8').decode(metadataBytes);

    console.log('\nTransaction Envelope Metadata:');
    console.log(metadataJson);

    // Read separator
    const separatorStart = 4 + metadataLength;
    const separator = bytes.slice(separatorStart, separatorStart + 4);
    console.log(
      `\nSeparator: ${Array.from(separator)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')}`
    );

    // Extract binary data
    const binaryDataStart = separatorStart + 4;
    const binaryData = bytes.slice(binaryDataStart);
    console.log(`\nBinary data size: ${binaryData.length} bytes`);

    if (binaryData.length > 0) {
      // Try to decode as structured payload
      if (binaryData.length >= 4) {
        const innerLength =
          binaryData[0] | (binaryData[1] << 8) | (binaryData[2] << 16) | (binaryData[3] << 24);

        if (innerLength > 0 && innerLength < 10000 && binaryData.length >= 4 + innerLength + 4) {
          const innerMetadataBytes = binaryData.slice(4, 4 + innerLength);
          const innerMetadataJson = new TextDecoder('utf-8').decode(innerMetadataBytes);

          console.log('\nFullPayloadStructure:');
          console.log(innerMetadataJson);

          // Extract inner separator
          const innerSeparatorStart = 4 + innerLength;
          const innerSeparator = binaryData.slice(innerSeparatorStart, innerSeparatorStart + 4);
          console.log(
            `\nInner separator: ${Array.from(innerSeparator)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ')}`
          );

          // Extract chunk data
          const chunkDataStart = innerSeparatorStart + 4;
          const chunkData = binaryData.slice(chunkDataStart);

          if (chunkData.length > 0) {
            console.log(`\nChunk data (${chunkData.length} bytes):`);
            try {
              const textData = new TextDecoder('utf-8').decode(chunkData);
              console.log(`As text: "${textData}"`);
            } catch {
              console.log(
                `As hex: ${Array.from(chunkData)
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join(' ')}`
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv.length !== 3) {
  console.log('Usage: node decode-payload.js <hex-payload>');
  process.exit(1);
}

const hexPayload = process.argv[2];
decodeStampingPayload(hexPayload);
