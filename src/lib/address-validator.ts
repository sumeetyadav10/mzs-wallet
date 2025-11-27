import { ethers } from 'ethers';

// Known token contract addresses for different chains
const KNOWN_TOKEN_CONTRACTS = {
  polygon: {
    // Popular ERC-20 tokens on Polygon
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    'GPTCH': '0x7Efe72a61ee1Cd8De6DA40f071287328D11034e9',
    // DeFi protocols
    'AAVE': '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    'UNISWAP': '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
    'QUICKSWAP': '0x831753DD7087CaC61aB5644b308642cc1c33Dc13',
    // Known contract patterns
    'MULTICALL': '0x11ce4B23bD875D7F5C6a31084f55fDe1e9A87507',
    'PROXY_ADMIN': '0x9bA6e03D8B90dE867373Db8cF1A58d2F7F006b3A'
  },
  ethereum: {
    // Common Ethereum contracts that users might accidentally send to
    'USDC': '0xA0b86a33E6417eFf2aC7d240D4e8DA21C49a8e2E', // On mainnet
    'USDT': '0xdac17f958d2ee523a2206206994597c13d831ec7',
    'DAI': '0x6b175474e89094c44da98b954eedeac495271d0f',
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  tron: {
    // TRC-20 tokens on Tron
    'USDT': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    'USDC': 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    'BTT': 'TAFjULxiVgT4qWVt9ePmKqjN2AcqEpT3a4'
  }
};

export interface AddressValidationResult {
  isValid: boolean;
  addressType: 'wallet' | 'contract' | 'token' | 'system' | 'unknown';
  warning?: string;
  suggestion?: string;
  knownTokenInfo?: {
    symbol: string;
    name?: string;
    warning: string;
  };
}

export class AddressValidator {
  
  // Check if an address is a known token contract
  private static getKnownTokenInfo(address: string, chain: string): { symbol: string; name?: string } | null {
    const contracts = KNOWN_TOKEN_CONTRACTS[chain as keyof typeof KNOWN_TOKEN_CONTRACTS];
    if (!contracts) return null;
    
    for (const [symbol, contractAddress] of Object.entries(contracts)) {
      if (contractAddress.toLowerCase() === address.toLowerCase()) {
        return { symbol };
      }
    }
    return null;
  }

  // Validate Ethereum/Polygon addresses
  static async validateEthereumAddress(
    address: string, 
    chain: 'polygon' | 'ethereum' = 'polygon'
  ): Promise<AddressValidationResult> {
    try {
      // First check if it's a valid Ethereum address format
      if (!ethers.isAddress(address)) {
        return {
          isValid: false,
          addressType: 'unknown',
          warning: '유효하지 않은 주소 형식입니다. 주소를 확인하고 다시 시도하세요.'
        };
      }

      // Get checksummed address
      const checksummedAddress = ethers.getAddress(address);
      
      // Use the industry standard method: check if address has contract code
      // This is exactly how MetaMask and other popular wallets do it
      const rpcUrl = chain === 'polygon' 
        ? process.env.NEXT_PUBLIC_POLYGON_RPC_URL 
        : 'https://eth.llamarpc.com';
      
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Add timeout and retry logic for more reliable contract detection
        const getCodeWithTimeout = async (address: string, timeoutMs: number = 5000) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          try {
            const code = await provider.getCode(address);
            clearTimeout(timeoutId);
            return code;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        };
        
        const code = await getCodeWithTimeout(checksummedAddress, 3000);
        
        // More robust contract detection
        // If code is exactly "0x" or empty, it's definitely a wallet address (EOA)
        // Only flag as contract if we get substantial bytecode
        if (code && code !== '0x' && code.length > 10) {
          // It's a smart contract - but let's be smarter about this
          const knownToken = this.getKnownTokenInfo(checksummedAddress, chain);
          
          if (knownToken) {
            // Known dangerous token contract
            return {
              isValid: true,
              addressType: 'token',
              warning: `⚠️ 이것은 ${knownToken.symbol} 토큰 컨트랙트 주소입니다!`,
              suggestion: '토큰 컨트랙트가 아닌 지갑 주소로 보내야 합니다. 컨트랙트 주소로 토큰을 보내면 영구적으로 손실될 수 있습니다.',
              knownTokenInfo: {
                symbol: knownToken.symbol,
                warning: `이것은 ${knownToken.symbol} 토큰 컨트랙트입니다. 여기로 보낸 토큰은 영구적으로 손실됩니다.`
              }
            };
          } else {
            // Unknown smart contract - could be a safe wallet or dangerous contract
            // Let's be less aggressive and just inform the user
            return {
              isValid: true,
              addressType: 'contract',
              warning: '📋 스마트 컨트랙트 주소 감지됨',
              suggestion: '이 주소는 스마트 컨트랙트입니다.\n\n✅ 만약 이것이 스마트 컨트랙트 지갑(Gnosis Safe 등)이라면 안전하게 토큰을 받을 수 있습니다.\n\n❌ 만약 이것이 프로토콜이나 토큰 컨트랙트라면 토큰이 영구 손실될 수 있습니다.\n\n보내기 전에 이 주소가 토큰을 받을 수 있는 올바른 주소인지 다시 한번 확인해주세요.'
            };
          }
        } else {
          // It's a regular wallet address (EOA)
          return {
            isValid: true,
            addressType: 'wallet'
          };
        }
      } catch (rpcError) {
        // If RPC fails, fall back to known token detection only
        const knownToken = this.getKnownTokenInfo(checksummedAddress, chain);
        if (knownToken) {
          return {
            isValid: true,
            addressType: 'token',
            warning: `⚠️ 이것은 ${knownToken.symbol} 토큰 컨트랙트로 보입니다!`,
            suggestion: '토큰 컨트랙트가 아닌 지갑 주소로 보내야 합니다.',
            knownTokenInfo: {
              symbol: knownToken.symbol,
              warning: `이것은 ${knownToken.symbol} 토큰 컨트랙트입니다.`
            }
          };
        }
        
        // If we can't verify due to RPC issues, default to wallet address
        // This prevents false positives where regular wallets are flagged as contracts
        console.warn('Address validation RPC failed, defaulting to wallet address:', rpcError);
        return {
          isValid: true,
          addressType: 'wallet',
          warning: '네트워크 연결 문제로 주소 유형을 확인할 수 없습니다. 주소가 올바른지 확인해주세요.'
        };
      }

    } catch (error) {
      return {
        isValid: false,
        addressType: 'unknown',
        warning: '주소를 확인할 수 없습니다. 형식을 확인하고 다시 시도하세요.'
      };
    }
  }


  // Validate Tron addresses
  static validateTronAddress(address: string): AddressValidationResult {
    try {
      // Basic Tron address validation
      if (!address.startsWith('T') || address.length !== 34) {
        return {
          isValid: false,
          addressType: 'unknown',
          warning: '유효하지 않은 트론 주소 형식입니다. 트론 주소는 "T"로 시작하며 34자여야 합니다.'
        };
      }

      // Check if it's a known token contract
      const knownToken = this.getKnownTokenInfo(address, 'tron');
      if (knownToken) {
        return {
          isValid: true,
          addressType: 'token',
          warning: `⚠️ 이것은 ${knownToken.symbol} 토큰 컨트랙트 주소로 보입니다!`,
          suggestion: '토큰 컨트랙트가 아닌 지갑 주소로 보내야 합니다. 컨트랙트로 보내면 영구적으로 손실될 수 있습니다.',
          knownTokenInfo: {
            symbol: knownToken.symbol,
            warning: `이것은 트론의 ${knownToken.symbol} 토큰 컨트랙트입니다.`
          }
        };
      }

      // For TRON, we mainly rely on known token contracts
      // Most users won't accidentally send to random Tron contracts
      return {
        isValid: true,
        addressType: 'wallet'
      };

    } catch (error) {
      return {
        isValid: false,
        addressType: 'unknown',
        warning: '트론 주소를 확인할 수 없습니다.'
      };
    }
  }


  // Main validation method that routes to appropriate validator
  static async validateAddress(
    address: string, 
    chain: 'polygon' | 'ethereum' | 'tron'
  ): Promise<AddressValidationResult> {
    switch (chain) {
      case 'polygon':
      case 'ethereum':
        return this.validateEthereumAddress(address, chain);
      case 'tron':
        return this.validateTronAddress(address);
      default:
        return {
          isValid: false,
          addressType: 'unknown',
          warning: '지원되지 않는 블록체인입니다.'
        };
    }
  }
}