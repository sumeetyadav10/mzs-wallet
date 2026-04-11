import { Web3Auth } from "@web3auth/modal";
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

export const Web3AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "";
        
        if (!clientId) {
          throw new Error("Web3Auth Client ID not configured");
        }
        
        console.log("🔄 Initializing Web3Auth with Client ID:", clientId.substring(0, 20) + "...");
        
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
          sessionTime: 86400, // 24 hours
          storageKey: "local",
        });

        console.log("🔄 Initializing Web3Auth modal...");
        await web3authInstance.initModal();
        console.log("✅ Web3Auth initialized successfully");
        
        setWeb3auth(web3authInstance);
      } catch (error) {
        console.error("❌ Error initializing Web3Auth:", error);
        
        // Don't fail completely - allow retry
        if (error instanceof Error && error.message.includes('fetch')) {
          console.log("🔄 Network error during Web3Auth init - will retry on connect");
          // Create a minimal web3auth instance for retry
          const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "";
          if (clientId) {
            try {
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
              const fallbackInstance = new Web3Auth({
                clientId,
                privateKeyProvider,
                web3AuthNetwork: "sapphire_mainnet",
              });
              setWeb3auth(fallbackInstance);
            } catch (fallbackError) {
              console.error("❌ Fallback Web3Auth creation also failed:", fallbackError);
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const connect = async () => {
    if (!web3auth) {
      console.log("🔄 Web3Auth not initialized, attempting to retry initialization...");
      
      // Try to reinitialize Web3Auth
      const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "";
      if (!clientId) {
        throw new Error("Web3Auth Client ID not configured");
      }
      
      try {
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
          sessionTime: 86400,
        });
        
        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);
        console.log("✅ Web3Auth retry initialization successful");
      } catch (retryError) {
        console.error("❌ Web3Auth retry failed:", retryError);
        throw new Error("Web3Auth not initialized and retry failed");
      }
    }

    try {
      console.log("🔄 Attempting Web3Auth connection...");
      const web3authProvider = await web3auth!.connect();
      setProvider(web3authProvider as any);
      setIsConnected(true);
      console.log("✅ Web3Auth connection successful");
    } catch (error) {
      console.error("❌ Error connecting to Web3Auth:", error);
      
      // Clear any stuck sessions to allow new email attempts
      try {
        if (web3auth && web3auth.connected) {
          console.log("🧹 Clearing stuck Web3Auth session...");
          await web3auth.logout();
        }
        // Clear browser storage
        localStorage.removeItem('Web3Auth-cachedAdapter');
        sessionStorage.clear();
        console.log("✅ Session cleared - user can try different email");
      } catch (clearError) {
        console.warn("⚠️ Session clear warning:", clearError);
      }
      
      throw error;
    }
  };

  const disconnect = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      // Only logout if actually connected
      if (web3auth.connected) {
        await web3auth.logout();
      }
      setProvider(null);
      setIsConnected(false);
    } catch (error) {
      console.error("Error disconnecting from Web3Auth:", error);
      // Clear state even if logout fails
      setProvider(null);
      setIsConnected(false);
      throw error;
    }
  };

  const getUserInfo = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      return await web3auth.getUserInfo();
    } catch (error) {
      console.error("Error getting user info:", error);
      throw error;
    }
  };

  const getIdToken = async (): Promise<string> => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      // Get the ID token from Web3Auth
      const authResult = await web3auth.authenticateUser();
      
      // CRITICAL: Log the RAW response to detect truncation source
      console.log("🔍 CRITICAL DEBUG - Raw Web3Auth response:", {
        authResultType: typeof authResult,
        authResultKeys: authResult ? Object.keys(authResult) : null,
        hasIdToken: !!authResult?.idToken,
        idTokenType: typeof authResult?.idToken,
        rawTokenLength: authResult?.idToken ? authResult.idToken.length : 0,
        isExactly1000: authResult?.idToken?.length === 1000,
        rawAuthResult: authResult // Log the entire response
      });
      
      // Check if token was already truncated when received from Web3Auth
      if (authResult?.idToken) {
        const rawToken = authResult.idToken;
        console.log("🔍 Token received from Web3Auth:", {
          tokenLength: rawToken.length,
          tokenStart: rawToken.substring(0, 100),
          tokenEnd: rawToken.substring(rawToken.length - 100),
          lastChar: rawToken.charAt(rawToken.length - 1),
          endsWithDot: rawToken.endsWith('.'),
          tokenPreview: rawToken
        });
        
        // Test if this might be a string length limitation
        if (rawToken.length === 1000) {
          console.error("🚨 CRITICAL: Token is ALREADY truncated when received from web3auth.authenticateUser()!");
          console.error("🔍 This suggests the issue is in Web3Auth library or browser limitations");
        }
      }
      
      console.log("🔍 Web3Auth authenticateUser result:", {
        hasIdToken: !!authResult.idToken,
        tokenLength: authResult.idToken?.length || 0,
        tokenStart: authResult.idToken?.substring(0, 50) || '',
        tokenEnd: authResult.idToken?.substring(authResult.idToken?.length - 50) || '',
        authResultKeys: Object.keys(authResult),
        fullAuthResult: authResult
      });
      
      if (!authResult.idToken) {
        throw new Error("No ID token returned from Web3Auth");
      }
      
      // Check if token has proper JWT format (3 parts separated by dots)
      const tokenParts = authResult.idToken.split('.');
      console.log("🔍 Token structure check:", {
        partsCount: tokenParts.length,
        part1Length: tokenParts[0]?.length || 0,
        part2Length: tokenParts[1]?.length || 0,
        part3Length: tokenParts[2]?.length || 0,
        isTokenTruncated: authResult.idToken.length === 1000
      });
      
      if (tokenParts.length !== 3) {
        console.error("❌ Invalid JWT format: expected 3 parts, got", tokenParts.length);
        
        // Try alternative method to get the token
        console.log("🔄 Trying alternative token retrieval methods...");
        try {
          // Check if Web3Auth has other methods to get the token
          if (web3auth.connected && web3auth.provider) {
            console.log("🔍 Web3Auth is connected, trying provider methods...");
            // Alternative: Try getting token directly from the session
            const sessionData = await web3auth.getUserInfo();
            console.log("🔍 Session data:", sessionData);
          }
        } catch (altError) {
          console.error("❌ Alternative token methods failed:", altError);
        }
        
        throw new Error(`Invalid JWT format: expected 3 parts (header.payload.signature), got ${tokenParts.length}. Token appears to be truncated at ${authResult.idToken.length} characters.`);
      }
      
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