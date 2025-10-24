import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export interface QRCodeOptions {
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  includeMargin?: boolean;
}

export interface QRCodeResult {
  svgElement: SVGElement;
  canvas: HTMLCanvasElement;
  blob: Blob;
}

export class QRCodeService {
  private static readonly DEFAULT_OPTIONS: Required<QRCodeOptions> = {
    size: 1000,
    level: 'L',
    includeMargin: true,
  };

  /**
   * Generate QR code SVG element
   */
  static generateQRCodeSVG(data: string, options: QRCodeOptions = {}): React.ReactElement {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    return React.createElement(QRCodeSVG, {
      value: data,
      size: opts.size,
      level: opts.level,
      includeMargin: opts.includeMargin,
      className: 'h-full w-full',
    });
  }

  /**
   * Convert SVG element to PNG blob
   */
  static async convertSVGToPNG(svgElement: SVGElement): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();

    return new Promise((resolve, reject) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          },
          'image/png',
          1.0,
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to load SVG image'));
      };

      img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
    });
  }

  /**
   * Check if data is suitable for QR code
   */
  static isDataSuitableForQR(data: string, limit: number = 2500): boolean {
    return data.length <= limit;
  }

  /**
   * Get QR code size recommendation based on data length
   */
  static getRecommendedSize(dataLength: number): number {
    if (dataLength < 100) return 800;
    if (dataLength < 500) return 1000;
    if (dataLength < 1000) return 1200;
    return 1500;
  }
}
