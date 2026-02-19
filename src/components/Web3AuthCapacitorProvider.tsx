'use client';

import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { createContext, useContext, useEffect, useState } from "react";
import { CHAIN_NAMESPACES, IProvider } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: IProvider | null;
  isLoading: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getUserInfo: () => Promise<any>;
  getIdToken: () => Promise<string>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  isLoading: true,
  isConnected: false,
  connect: async () => {},
  disconnect: async () => {},
  getUserInfo: async () => {},
  getIdToken: async () => { throw new Error('Not initialized'); },
});

export const useWeb3Auth = () => useContext(Web3AuthContext);

export const Web3AuthCapacitorProvider = ({ children }: { children: React.ReactNode }) => {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('🔧 Initializing Web3Auth with persistent session...');
        
        const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "";
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: {
            chainConfig: {
              chainNamespace: CHAIN_NAMESPACES.EIP155,
              chainId: "0x89", // Polygon mainnet
              rpcTarget: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || "https://polygon.drpc.org",
              displayName: "Polygon Mainnet",
              blockExplorerUrl: "https://polygonscan.com",
              ticker: "MATIC",
              tickerName: "MATIC",
            }
          }
        });
        
        const web3authInstance = new Web3Auth({
          clientId,
          privateKeyProvider,
          web3AuthNetwork: "sapphire_mainnet",
          // 🔐 PERSISTENT LOGIN CONFIGURATION
          sessionTime: 86400 * 30, // 30 days session (in seconds)
          storageKey: "local", // Use local storage for persistence
        });

        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: {
            clientId,
            network: "sapphire_mainnet",
            uxMode: "popup",
            // 🔐 SESSION PERSISTENCE SETTINGS
            storageServerUrl: undefined, // Use local storage
          },
        });

        web3authInstance.configureAdapter(openloginAdapter);
        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);
        
        // 🚀 AUTO-RESTORE SESSION ON APP START
        console.log('🔍 Checking for existing session...');
        await checkAndRestoreSession(web3authInstance);
        
      } catch (error) {
        console.error("Error initializing Web3Auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // 🔐 AUTO-RESTORE EXISTING SESSION
  const checkAndRestoreSession = async (web3authInstance: Web3Auth) => {
    try {
      // Check if Web3Auth already has a valid session
      if (web3authInstance.connected && web3authInstance.provider) {
        console.log('✅ Found existing Web3Auth session');
        
        setProvider(web3authInstance.provider as any);
        setIsConnected(true);
        
        // Get and restore user info
        const userInfo = await web3authInstance.getUserInfo();
        if (userInfo && userInfo.email) {
          console.log('🔄 Restoring user session for:', userInfo.email);
          
          // Restore wallet from session storage or backend
          const savedPrivateKey = sessionStorage.getItem('walletPrivateKey');
          if (!savedPrivateKey) {
            // Try to get private key from Web3Auth provider
            try {
              const privateKey = await web3authInstance.provider.request({
                method: 'eth_private_key',
              });
              if (privateKey) {
                sessionStorage.setItem('walletPrivateKey', privateKey as string);
                console.log('✅ Restored wallet private key from Web3Auth');
              }
            } catch (pkError) {
              console.log('⚠️ Could not get private key from provider:', pkError);
            }
          }
          
          // Restore user info
          localStorage.setItem('userInfo', JSON.stringify(userInfo));
          
          console.log('🎉 Session restored successfully! User is auto-logged in.');
          return true;
        }
      }
      
      // Also check localStorage for saved session info
      const savedUserInfo = localStorage.getItem('userInfo');
      const savedPrivateKey = sessionStorage.getItem('walletPrivateKey');
      
      if (savedUserInfo && savedPrivateKey) {
        console.log('📱 Found saved session data, attempting to restore...');
        const userInfo = JSON.parse(savedUserInfo);
        
        // Check if we can restore the Web3Auth session
        if (userInfo.email) {
          console.log('🔄 Attempting to restore session for:', userInfo.email);
          // The session might be restorable by Web3Auth even if not immediately connected
          // This will be handled when user navigates to dashboard
          return true;
        }
      }
      
      console.log('📋 No existing session found - user needs to login');
      return false;
      
    } catch (error) {
      console.log('⚠️ Session restoration failed:', error);
      // Clear any invalid session data
      localStorage.removeItem('userInfo');
      sessionStorage.removeItem('walletPrivateKey');
      return false;
    }
  };

  const connect = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      console.log('🔄 Starting authentication...');
      
      // First check if already connected
      if (web3auth.connected && web3auth.provider) {
        console.log('✅ Already connected, using existing session');
        setProvider(web3auth.provider as any);
        setIsConnected(true);
        return;
      }
      
      // Start new authentication
      const web3authProvider = await web3auth.connect();
      setProvider(web3authProvider as any);
      setIsConnected(true);
      
      console.log('🎉 New authentication successful - session will persist');
    } catch (error) {
      console.error("Error connecting to Web3Auth:", error);
      throw error;
    }
  };

  const disconnect = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      console.log('🚪 Manually logging out...');
      
      // Clear Web3Auth session
      await web3auth.logout();
      
      // Clear all stored session data
      localStorage.removeItem('userInfo');
      sessionStorage.removeItem('walletPrivateKey');
      sessionStorage.removeItem('tronAddress');
      sessionStorage.removeItem('tronUserEmail');
      sessionStorage.removeItem('solanaAddress');
      sessionStorage.removeItem('selectedChain');
      sessionStorage.clear();
      
      // Clear custom token data  
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('customTokens_')) {
          localStorage.removeItem(key);
        }
      });
      
      setProvider(null);
      setIsConnected(false);
      
      console.log('✅ Logout complete - session cleared');
    } catch (error) {
      console.error("Error disconnecting from Web3Auth:", error);
      throw error;
    }
  };

  const getUserInfo = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      // First try to get from Web3Auth
      if (web3auth.connected) {
        return await web3auth.getUserInfo();
      }
      
      // Fallback to saved user info
      const savedUserInfo = localStorage.getItem('userInfo');
      if (savedUserInfo) {
        console.log('📱 Using saved user info');
        return JSON.parse(savedUserInfo);
      }
      
      throw new Error("No user information available");
    } catch (error) {
      console.error("Error getting user info:", error);
      throw error;
    }
  };

  const getIdToken = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      // Get the ID token from Web3Auth
      const authResult = await web3auth.authenticateUser();
      return authResult.idToken;
    } catch (error) {
      console.error("Error getting ID token:", error);
      throw error;
    }
  };

  return (
    <Web3AuthContext.Provider
      value={{
        web3auth,
        provider,
        isLoading,
        isConnected,
        connect,
        disconnect,
        getUserInfo,
        getIdToken,
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
};