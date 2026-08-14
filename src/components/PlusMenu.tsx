import React, { useState, useRef, useEffect } from 'react';
import { Liquid } from 'liquid-gooey';

interface PlusMenuProps {
  onUploadDocument?: () => void;
  onUploadImage?: () => void;
  onOpenVault?: () => void;
}

export const PlusMenu: React.FC<PlusMenuProps> = ({
  onUploadDocument,
  onUploadImage,
  onOpenVault
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative z-40 flex items-center justify-center shrink-0">
      <Liquid
        blur={6}
        contrast={18}
        fill="#ffffff"
        shadow="0 3px 10px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.06)"
      >
        {/* Left Item: Document */}
        <Liquid.Item
          x={open ? -54 : 0}
          y={open ? -34 : 0}
          transition="bouncy"
          radius={20}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              if (onUploadDocument) onUploadDocument();
            }}
            title="Upload Document / Skin Note"
            className={`w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-[#121316] transition-opacity cursor-pointer focus:outline-none ${
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </button>
        </Liquid.Item>

        {/* Top Item: Photo / Image */}
        <Liquid.Item
          x={0}
          y={open ? -64 : 0}
          transition="bouncy"
          delay={40}
          radius={20}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              if (onUploadImage) onUploadImage();
            }}
            title="Upload Photo / Skin Image"
            className={`w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-[#121316] transition-opacity cursor-pointer focus:outline-none ${
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>
        </Liquid.Item>

        {/* Right Item: Folder / Vault */}
        <Liquid.Item
          x={open ? 54 : 0}
          y={open ? -34 : 0}
          transition="bouncy"
          delay={80}
          radius={20}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              if (onOpenVault) onOpenVault();
            }}
            title="Open Memory Vault & History"
            className={`w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-[#121316] transition-opacity cursor-pointer focus:outline-none ${
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
          </button>
        </Liquid.Item>

        {/* Base Anchor Item: Plus / Close */}
        <Liquid.Item radius={20}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            title={open ? "Close menu" : "Add photo, document, or open vault"}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-[#121316] cursor-pointer focus:outline-none transition-transform active:scale-95"
          >
            {open ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
          </button>
        </Liquid.Item>
      </Liquid>
    </div>
  );
};

export default PlusMenu;
