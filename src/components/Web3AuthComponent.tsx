"use client";

import { useEffect, useState } from "react";
import { Web3Auth } from "@web3auth/modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";

export default function Web3AuthComponent() {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
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
      });
      const adapter = new OpenloginAdapter({
        adapterSettings: {
          uxMode: "popup",
        },
      });
      web3authInstance.configureAdapter(adapter);
      await web3authInstance.initModal();
      setWeb3auth(web3authInstance);
      if (web3authInstance.provider) {
        setProvider(web3authInstance.provider);
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async () => {
    if (!web3auth) return;
    const provider = await web3auth.connect();
    setProvider(provider);
  };

  return (
    <div>
      <button onClick={login} disabled={loading || !!provider}>
        {provider ? "Connected!" : loading ? "Loading..." : "Login with Web3Auth"}
      </button>
      {provider && <p>You're connected!</p>}
    </div>
  );
} 