import { ethers } from "ethers";
import { Web3Auth } from "@web3auth/modal";

export interface WalletInfo {
  address: string;
  privateKey?: string;
  isLegacy: boolean;
}

export const getWalletFromWeb3Auth = async (web3auth: Web3Auth): Promise<WalletInfo> => {
  if (!web3auth.provider) {
    throw new Error("Web3Auth provider not initialized");
  }

  const ethersProvider = new ethers.BrowserProvider(web3auth.provider);
  const signer = await ethersProvider.getSigner();
  const address = await signer.getAddress();

  return {
    address,
    isLegacy: false,
  };
};

export const getLegacyWallet = async (privateKey: string): Promise<WalletInfo> => {
  const wallet = new ethers.Wallet(privateKey);
  return {
    address: wallet.address,
    privateKey,
    isLegacy: true,
  };
};

export const getWalletBalance = async (provider: ethers.Provider, address: string): Promise<string> => {
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
};

export const sendTransaction = async (
  provider: ethers.BrowserProvider,
  from: string,
  to: string,
  amount: string,
  privateKey?: string
): Promise<ethers.TransactionResponse> => {
  const signer = privateKey
    ? new ethers.Wallet(privateKey, provider)
    : (await provider.getSigner());

  const tx = await signer.sendTransaction({
    from,
    to,
    value: ethers.parseEther(amount),
  });

  return tx;
}; 