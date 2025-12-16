/**
 * Image hashing utilities for visual similarity matching
 * Uses perceptual hashing (pHash) via imghash library
 */

import sharp from 'sharp';
import imghash from 'imghash';

/**
 * Download an image from a URL and return as a buffer
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download image from ${url}: ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate perceptual hash for an image from URL
 * Returns a hex string that can be compared with other hashes
 */
export async function generateImageHash(imageUrl: string): Promise<string> {
  try {
    const imageBuffer = await downloadImage(imageUrl);

    // Process image with sharp to ensure consistent format
    const processedBuffer = await sharp(imageBuffer)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
      })
      .jpeg()
      .toBuffer();

    // Generate perceptual hash
    const imageHash = await imghash.hash(processedBuffer, 16); // 16-bit hash
    return imageHash;
  } catch (error) {
    console.error(`Failed to generate hash for ${imageUrl}:`, error);
    throw error;
  }
}

/**
 * Calculate Hamming distance between two hex hash strings
 * Returns a number between 0 (identical) and the bit-length (completely different)
 * Lower values indicate more similar images
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    // Count set bits in XOR result
    distance += xor.toString(2).split('1').length - 1;
  }

  return distance;
}

/**
 * Calculate visual similarity between two image hashes
 * Returns a score between 0 (completely different) and 1 (identical)
 */
export function calculateImageSimilarity(hash1: string, hash2: string): number {
  const maxDistance = hash1.length * 4; // Each hex char represents 4 bits
  const distance = hammingDistance(hash1, hash2);
  const similarity = 1 - distance / maxDistance;
  return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
}

/**
 * Check if two images are visually similar based on their hashes
 * @param threshold - Minimum similarity score (0-1) to consider images similar
 */
export function areImagesSimilar(
  hash1: string,
  hash2: string,
  threshold: number = 0.85
): boolean {
  const similarity = calculateImageSimilarity(hash1, hash2);
  return similarity >= threshold;
}

/**
 * Batch generate hashes for multiple image URLs with rate limiting
 * @param urls - Array of image URLs
 * @param delayMs - Delay between requests in milliseconds
 */
export async function batchGenerateHashes(
  urls: string[],
  delayMs: number = 100
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  for (const url of urls) {
    try {
      const imageHash = await generateImageHash(url);
      results.set(url, imageHash);
    } catch (error) {
      console.warn(`Failed to hash ${url}:`, error);
      results.set(url, null);
    }

    // Rate limiting delay
    if (delayMs > 0 && urls.indexOf(url) < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
