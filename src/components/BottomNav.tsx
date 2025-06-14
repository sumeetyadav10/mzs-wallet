'use client';

import { usePathname, useRouter } from 'next/navigation';
import { FaGolfBall, FaFlagCheckered, FaCog } from 'react-icons/fa';
import { motion } from 'framer-motion';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { path: '/dashboard', icon: FaGolfBall, label: '지갑' },
    { path: '/tokens', icon: FaGolfBall, label: '토큰' },
    { path: '/profile', icon: FaFlagCheckered, label: '스코어카드' },
    { path: '/settings', icon: FaCog, label: '설정' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center items-end pb-3">
      <div
        className="glass flex items-center justify-between w-full max-w-[500px] mx-auto rounded-3xl px-2 py-2 border border-[var(--golf-gold)]/20 animate-glow shadow-lg"
        style={{ boxShadow: 'var(--glass-shadow)', borderRadius: 24 }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <motion.button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center flex-1 min-w-0 gap-0.5 py-1 px-0 transition-all duration-200 ${
                isActive ? 'text-[var(--golf-green)] font-bold' : 'text-[var(--golf-dark)]/60'
              }`}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.96 }}
              style={{ background: 'none', border: 'none' }}
            >
              <item.icon size={20} className={isActive ? 'text-[var(--golf-gold)]' : ''} />
              <span className="text-[11px] font-medium leading-tight truncate w-full text-center">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
} 