import React from 'react';
import { motion } from 'framer-motion';

export type Chain = 'polygon' | 'tron';

interface ChainSelectorProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
}

const ChainSelector: React.FC<ChainSelectorProps> = ({ selectedChain, onChainChange }) => {
  const chains = [
    { id: 'polygon' as Chain, name: 'Polygon', icon: '/matic-logo.png', color: '#8247E5' },
    { id: 'tron' as Chain, name: 'Tron', icon: '/tron-logo.svg', color: '#FF0013' },
  ];

  return (
    <div className="flex items-center space-x-2 bg-gray-800/50 rounded-xl p-1">
      {chains.map((chain) => (
        <button
          key={chain.id}
          onClick={() => onChainChange(chain.id)}
          className={`relative px-4 py-2 rounded-lg flex items-center space-x-2 transition-all ${
            selectedChain === chain.id
              ? 'text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {selectedChain === chain.id && (
            <motion.div
              layoutId="chainSelector"
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: chain.color }}
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <img 
            src={chain.icon} 
            alt={chain.name} 
            className="w-5 h-5 relative z-10"
          />
          <span className="text-sm font-medium relative z-10">{chain.name}</span>
        </button>
      ))}
    </div>
  );
};

export default ChainSelector;