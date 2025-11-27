'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeWithLogoProps {
  value: string;
  size?: number;
  logoSrc?: string;
  logoSize?: number;
  bgColor?: string;
  fgColor?: string;
  className?: string;
}

export default function QRCodeWithLogo({
  value,
  size = 256,
  logoSrc = '/mzs-logo.png',
  logoSize = 50,
  bgColor = '#FFFFFF',
  fgColor = '#000000',
  className = ''
}: QRCodeWithLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        // Generate QR code with high error correction
        await QRCode.toCanvas(canvas, value, {
          errorCorrectionLevel: 'H',
          margin: 3,
          width: size,
          color: {
            dark: fgColor,
            light: bgColor
          }
        });

        // Add a subtle border around the QR code
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        // Load and draw logo
        const logo = new Image();
        logo.onload = () => {
          // Calculate logo position
          const logoX = (canvas.width - logoSize) / 2;
          const logoY = (canvas.height - logoSize) / 2;
          
          // Create dark background for logo (circular) with gradient
          ctx.save();
          
          // Create gradient for background
          const gradient = ctx.createRadialGradient(
            logoX + logoSize / 2,
            logoY + logoSize / 2,
            0,
            logoX + logoSize / 2,
            logoY + logoSize / 2,
            logoSize / 2 + 12
          );
          gradient.addColorStop(0, '#2C2F36');
          gradient.addColorStop(1, '#181A20');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(
            logoX + logoSize / 2,
            logoY + logoSize / 2,
            logoSize / 2 + 8,
            0,
            Math.PI * 2
          );
          ctx.fill();
          
          // Add subtle shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 15;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;
          
          // Draw dark circle background
          ctx.fillStyle = '#23262F';
          ctx.beginPath();
          ctx.arc(
            logoX + logoSize / 2,
            logoY + logoSize / 2,
            logoSize / 2 + 8,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.restore();
          
          // Draw logo in circular clip
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            logoX + logoSize / 2,
            logoY + logoSize / 2,
            logoSize / 2,
            0,
            Math.PI * 2
          );
          ctx.clip();
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          ctx.restore();
          
        };
        
        logo.onerror = () => {
          // Failed to load logo
        };
        
        logo.src = logoSrc;
      } catch (error) {
        // Error generating QR code
      }
    };

    generateQRCode();
  }, [value, size, logoSrc, logoSize, bgColor, fgColor]);

  return (
    <canvas 
      ref={canvasRef} 
      className={className}
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}