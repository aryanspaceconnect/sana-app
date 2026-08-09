import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { SanaLogoIcon } from './SanaLogoIcon';

interface HeaderProps {
  userProfile: UserProfile | null;
  onOpenSettings: () => void;
  onOpenScan: () => void;
}

export const Header: React.FC<HeaderProps> = ({ userProfile, onOpenSettings, onOpenScan }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    // Text "sana" naturally slides into the logo icon after 6 seconds
    const timer = setTimeout(() => {
      setIsExpanded(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <header className="relative w-full px-6 pt-5 pb-2 flex items-center justify-between z-20 pointer-events-auto">
      {/* Interactive SANA Brand with SVG Logo & Sliding Blurred Text */}
      <div
        className="flex items-center space-x-2 cursor-pointer select-none group py-1"
        onClick={handleToggle}
        title="SANA Logo"
      >
        {/* SVG Logo Icon Mark */}
        <motion.div
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="shrink-0 z-10 flex items-center justify-center"
        >
          <SanaLogoIcon size={22} color="#1a1c1e" />
        </motion.div>

        {/* Text Container Mask: 'sana' text enters inside logo with localized blur */}
        <motion.div
          initial={false}
          animate={{
            width: isExpanded ? 'auto' : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{
            duration: 0.75,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="relative overflow-hidden flex items-center h-7"
        >
          {/* Edge Blur & Dissolve Threshold Mask */}
          <div
            className="absolute left-0 top-0 bottom-0 w-3 z-10 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, rgba(248,249,251,1) 0%, rgba(248,249,251,0) 100%)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />

          <motion.div
            initial={false}
            animate={{
              x: isExpanded ? 0 : -36,
              filter: isExpanded ? 'blur(0px)' : 'blur(6px)',
              opacity: isExpanded ? 1 : 0,
            }}
            transition={{
              duration: 0.75,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex items-baseline pl-0.5 whitespace-nowrap"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0px, transparent 4px, black 16px, black 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0px, transparent 4px, black 16px, black 100%)',
            }}
          >
            <span className="text-[19px] font-bold tracking-tight text-[#1a1c1e] lowercase">
              sana
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Subtle Right Status or spacing */}
      <div className="flex items-center space-x-2.5" />
    </header>
  );
};

