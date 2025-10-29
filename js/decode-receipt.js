#!/usr/bin/env node

/**
 * KasStamp Receipt Decoder Utility
 *
 * Usage: node decode-receipt.js <receipt-url>
 */

import { gunzipSync, inflateSync, inflateRawSync } from 'zlib';

function decodeReceiptUrl(url) {
  try {
    // Extract the encoded part from the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const encodedData = pathParts[pathParts.length - 1];

    console.log(`Receipt URL: ${url}`);
    console.log(`Encoded data: ${encodedData.substring(0, 50)}...`);

    // Decode base64url
    const base64Data = encodedData.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const paddedBase64 = base64Data + '='.repeat((4 - (base64Data.length % 4)) % 4);

    const binaryData = Buffer.from(paddedBase64, 'base64');
    console.log(`\nDecoded binary size: ${binaryData.length} bytes`);

    // Try different decompression methods
    let decompressedData = binaryData;

    // Try gzip first
    try {
      decompressedData = gunzipSync(binaryData);
      console.log(`\n✅ Successfully decompressed with gzip!`);
      console.log(`Decompressed size: ${decompressedData.length} bytes`);
    } catch {
      try {
        decompressedData = inflateSync(binaryData);
        console.log(`\n✅ Successfully decompressed with zlib!`);
        console.log(`Decompressed size: ${decompressedData.length} bytes`);
      } catch {
        // Try raw deflate
        try {
          decompressedData = inflateRawSync(binaryData);
          console.log(`\n✅ Successfully decompressed with raw deflate!`);
          console.log(`Decompressed size: ${decompressedData.length} bytes`);
        } catch (rawError) {
          console.log(`Error: ${rawError.message}`);
          console.log(`\n⚠️ No compression detected, using raw data`);
        }
      }
    }

    // Try to parse as JSON (receipts are usually JSON)
    try {
      const receiptJson = JSON.parse(decompressedData.toString('utf-8'));
      console.log('\n=== RECEIPT DATA ===');
      console.log(JSON.stringify(receiptJson, null, 2));

      // Extract key information
      if (receiptJson.transactionId) {
        console.log(`\nTransaction ID: ${receiptJson.transactionId}`);
      }
      if (receiptJson.timestamp) {
        console.log(`Timestamp: ${new Date(receiptJson.timestamp).toISOString()}`);
      }
      if (receiptJson.artifactHash) {
        console.log(`Artifact Hash: ${receiptJson.artifactHash}`);
      }
      if (receiptJson.kaspaTransactionId) {
        console.log(`Kaspa Transaction ID: ${receiptJson.kaspaTransactionId}`);
      }
      if (receiptJson.artifactType) {
        console.log(`Artifact Type: ${receiptJson.artifactType}`);
      }
      if (receiptJson.network) {
        console.log(`Network: ${receiptJson.network}`);
      }
    } catch (jsonError) {
      console.log(`Error: ${jsonError.message}`);
      console.log('\nNot JSON format, showing raw data:');
      console.log('Raw text:', decompressedData.toString('utf-8'));
      console.log('\nHex dump:');
      console.log(
        decompressedData
          .toString('hex')
          .match(/.{1,32}/g)
          ?.join('\n') || 'No data'
      );
    }
  } catch (error) {
    console.error(`Error decoding receipt: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv.length !== 3) {
  console.log('Usage: node decode-receipt.js <receipt-url>');
  console.log('Example: node decode-receipt.js "https://kasstamp.com/r/eJytlEtvY0UQhf..."');
  process.exit(1);
}

const receiptUrl = process.argv[2];
decodeReceiptUrl(receiptUrl);
