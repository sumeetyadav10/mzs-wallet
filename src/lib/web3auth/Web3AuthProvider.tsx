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
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  isLoading: true,
  isConnected: false,
  connect: async () => {},
  disconnect: async () => {},
  getUserInfo: async () => {},
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
        const privateKeyProvider = new EthereumPrivateKeyProvider({
          config: {
            chainConfig: {
              chainNamespace: CHAIN_NAMESPACES.EIP155,
              chainId: "0x89", // Polygon mainnet
              rpcTarget: "https://polygon-rpc.com",
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
        });

        const openloginAdapter = new OpenloginAdapter({
          adapterSettings: {
            clientId,
            network: "mainnet",
            uxMode: "popup",
          },
        });

        web3authInstance.configureAdapter(openloginAdapter);
        await web3authInstance.initModal();
        setWeb3auth(web3authInstance);
      } catch (error) {
        console.error("Error initializing Web3Auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const connect = async () => {
    if (!web3auth) {
      throw new Error("Web3Auth not initialized");
    }

    try {
      const web3authProvider = await web3auth.connect();
      setProvider(web3authProvider as any);
      setIsConnected(true);
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
      await web3auth.logout();
      setProvider(null);
      setIsConnected(false);
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
      return await web3auth.getUserInfo();
    } catch (error) {
      console.error("Error getting user info:", error);
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
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}; 