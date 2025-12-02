import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 512 512" 
    className={className}
    role="img"
    aria-label="Carmagne Logo"
  >
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor:'#fbbf24', stopOpacity:1}} />
        <stop offset="100%" style={{stopColor:'#f59e0b', stopOpacity:1}} />
      </linearGradient>
    </defs>
    {/* Fondo amarillo con esquinas redondeadas */}
    <rect width="512" height="512" rx="100" fill="url(#grad1)"/>
    
    {/* Icono abstracto de construcción (Casco/Edificio) en gris oscuro */}
    <path d="M256 130 L130 230 V410 H382 V230 L256 130 Z" fill="#0f172a"/>
    
    {/* Detalles interiores en amarillo */}
    <rect x="230" y="310" width="52" height="100" fill="#fbbf24"/>
    <rect x="180" y="260" width="40" height="40" fill="#fbbf24" opacity="0.9"/>
    <rect x="292" y="260" width="40" height="40" fill="#fbbf24" opacity="0.9"/>
    
    {/* Texto C estilizado */}
    <text x="50%" y="470" fontFamily="Arial, sans-serif" fontSize="60" fontWeight="bold" fill="#0f172a" textAnchor="middle" letterSpacing="4">CARMAGNE</text>
  </svg>
);