"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { updateUserWallet } from '@/lib/database';

export default function SetupWallet() {
  const [step, setStep] = useState<'choose' | 'import'>('choose');
  const [importKey, setImportKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async () => {
    try {
      const newWallet = ethers.Wallet.createRandom();
      const userId = sessionStorage.getItem('userId');
      if (userId) {
        await updateUserWallet(userId, newWallet.privateKey);
        sessionStorage.setItem('walletPrivateKey', newWallet.privateKey);
        window.location.href = '/dashboard';
      } else {
        setError('User not authenticated.');
      }
    } catch (e) {
      setError('Failed to create wallet.');
    }
  };

  const handleImport = async () => {
    try {
      const importedWallet = new ethers.Wallet(importKey);
      const userId = sessionStorage.getItem('userId');
      if (userId) {
        await updateUserWallet(userId, importKey);
        sessionStorage.setItem('walletPrivateKey', importKey);
        window.location.href = '/dashboard';
      } else {
        setError('User not authenticated.');
      }
    } catch (e) {
      setError('Invalid private key.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f8fa]">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full card" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1.5px solid #e6c20022', boxShadow: '0 8px 32px rgba(46, 125, 50, 0.18)' }}>
        <h1 className="text-2xl font-bold mb-6 text-center">Set Up Your Wallet</h1>
        {step === 'choose' && (
          <>
            <button
              className="w-full mb-4 px-4 py-3 bg-[#F6851B] hover:bg-[#E2761B] text-white font-semibold rounded-lg"
              onClick={handleCreate}
            >
              Create New Wallet
            </button>
            <button
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg"
              onClick={() => setStep('import')}
            >
              Import Existing Wallet
            </button>
          </>
        )}
        {step === 'import' && (
          <>
            <input
              type="text"
              value={importKey}
              onChange={e => setImportKey(e.target.value)}
              className="w-full px-4 py-3 mb-4 bg-gray-100 border border-gray-200 rounded-lg"
              placeholder="Enter your private key"
            />
            <button
              className="w-full px-4 py-3 bg-[#F6851B] hover:bg-[#E2761B] text-white font-semibold rounded-lg mb-2"
              onClick={handleImport}
            >
              Import Wallet
            </button>
            <button
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg"
              onClick={() => setStep('choose')}
            >
              Back
            </button>
          </>
        )}
        {error && <div className="text-red-500 text-center mt-4">{error}</div>}
      </div>
    </div>
  );
} 