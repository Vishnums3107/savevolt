/**
 * Blockchain Service for Carbon Credits
 * Manages carbon credits as NFTs on blockchain
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';

export interface CarbonCredit {
  id: string;
  tokenId: string;
  amount: number; // kg CO2 offset
  energySaved: number; // kWh
  earnedDate: Date;
  blockchain: 'ethereum' | 'polygon' | 'binance';
  transactionHash?: string;
  nftMetadata?: NFTMetadata;
  isRedeemed: boolean;
  marketValue: number; // USD
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface WalletInfo {
  address: string;
  balance: number;
  network: string;
  isConnected: boolean;
}

export interface MarketplaceListing {
  id: string;
  creditId: string;
  sellerId: string;
  price: number;
  amount: number;
  listedDate: Date;
  status: 'active' | 'sold' | 'cancelled';
}

class BlockchainService {
  private static instance: BlockchainService;
  private wallet: WalletInfo | null = null;
  private credits: CarbonCredit[] = [];
  private provider: any = null;
  private contract: any = null;
  
  // Demo contract address (would be real in production)
  private readonly CONTRACT_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
  
  private constructor() {}

  public static getInstance(): BlockchainService {
    if (!BlockchainService.instance) {
      BlockchainService.instance = new BlockchainService();
    }
    return BlockchainService.instance;
  }

  /**
   * Initialize blockchain service
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadWallet();
      await this.loadCredits();
      if (!this.wallet) {
        await this.connectWallet();
      }
      console.log('Blockchain Service initialized');
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
    }
  }

  /**
   * Connect wallet
   */
  public async connectWallet(privateKey?: string): Promise<WalletInfo> {
    try {
      let wallet: any;
      
      if (privateKey) {
        wallet = new ethers.Wallet(privateKey);
      } else {
        try {
          wallet = ethers.Wallet.createRandom();
        } catch {
          const randomHex = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
          wallet = new ethers.Wallet(randomHex);
        }
      }

      let balance = 0.05;
      try {
        this.provider = new ethers.JsonRpcProvider(
          'https://rpc-amoy.polygon.technology/'
        );
        const connectedWallet = wallet.connect(this.provider);
        const remoteBal = await connectedWallet.provider.getBalance(wallet.address);
        balance = parseFloat(ethers.formatEther(remoteBal));
      } catch {
        balance = 0.05;
      }

      this.wallet = {
        address: wallet.address,
        balance,
        network: 'Polygon Amoy Testnet',
        isConnected: true,
      };

      await this.saveWallet();
      
      // Initialize contract
      try {
        await this.initializeContract();
      } catch {
        // Safe skip
      }

      return this.wallet;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      const fallbackHex = '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      this.wallet = {
        address: fallbackHex,
        balance: 0.05,
        network: 'Polygon Amoy Testnet',
        isConnected: true,
      };
      await this.saveWallet();
      return this.wallet;
    }
  }

  /**
   * Initialize smart contract
   */
  private async initializeContract(): Promise<void> {
    // In production, this would use the real contract ABI
    const contractABI = [
      'function mintCarbonCredit(address to, uint256 amount) public returns (uint256)',
      'function getCarbonCredit(uint256 tokenId) public view returns (uint256)',
      'function transferCredit(address to, uint256 tokenId) public',
      'function redeemCredit(uint256 tokenId) public',
    ];

    if (this.provider && this.wallet) {
      try {
        const signer = new ethers.Wallet(
          ethers.Wallet.createRandom().privateKey,
          this.provider
        );
        this.contract = new ethers.Contract(this.CONTRACT_ADDRESS, contractABI, signer);
      } catch {
        // Contract fallback
      }
    }
  }

  /**
   * Mint carbon credit NFT
   */
  public async mintCarbonCredit(co2Offset: number, energySaved: number): Promise<CarbonCredit> {
    if (!this.wallet) {
      await this.connectWallet();
    }

    try {
      // Create NFT metadata
      const metadata: NFTMetadata = {
        name: `Carbon Credit - ${co2Offset.toFixed(2)} kg CO₂`,
        description: `This NFT represents ${co2Offset.toFixed(2)} kg of CO₂ offset by saving ${energySaved.toFixed(2)} kWh of energy.`,
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}`,
        attributes: [
          { trait_type: 'CO₂ Offset (kg)', value: co2Offset.toFixed(2) },
          { trait_type: 'Energy Saved (kWh)', value: energySaved.toFixed(2) },
          { trait_type: 'Trees Equivalent', value: Math.floor(co2Offset / 21.77) },
          { trait_type: 'Minted Date', value: new Date().toISOString() },
        ],
      };

      // In production, this would actually mint on blockchain
      // For demo, we simulate the transaction
      const credit: CarbonCredit = {
        id: `credit-${Date.now()}`,
        tokenId: `${Date.now()}`,
        amount: co2Offset,
        energySaved,
        earnedDate: new Date(),
        blockchain: 'polygon',
        transactionHash: `0x${Math.random().toString(16).substring(2, 66)}`,
        nftMetadata: metadata,
        isRedeemed: false,
        marketValue: this.calculateMarketValue(co2Offset),
      };

      this.credits.push(credit);
      await this.saveCredits();

      return credit;
    } catch (error) {
      console.error('Failed to mint carbon credit:', error);
      throw error;
    }
  }

  /**
   * Calculate market value of carbon credit
   */
  private calculateMarketValue(co2Amount: number): number {
    // Average carbon credit price: $15 per ton CO₂
    const pricePerTon = 15;
    const tons = co2Amount / 1000;
    return tons * pricePerTon;
  }

  /**
   * Get all carbon credits
   */
  public getCarbonCredits(): CarbonCredit[] {
    return [...this.credits];
  }

  /**
   * Get unredeemed credits
   */
  public getUnredeemedCredits(): CarbonCredit[] {
    return this.credits.filter((c) => !c.isRedeemed);
  }

  /**
   * Get total CO2 offset
   */
  public getTotalCO2Offset(): number {
    return this.credits.reduce((sum, credit) => sum + credit.amount, 0);
  }

  /**
   * Get total market value
   */
  public getTotalMarketValue(): number {
    return this.credits
      .filter((c) => !c.isRedeemed)
      .reduce((sum, credit) => sum + credit.marketValue, 0);
  }

  /**
   * Redeem carbon credit
   */
  public async redeemCredit(creditId: string): Promise<boolean> {
    const credit = this.credits.find((c) => c.id === creditId);
    if (!credit || credit.isRedeemed) {
      return false;
    }

    try {
      // In production, this would call smart contract to redeem
      credit.isRedeemed = true;
      await this.saveCredits();
      return true;
    } catch (error) {
      console.error('Failed to redeem credit:', error);
      return false;
    }
  }

  /**
   * Transfer credit to another address
   */
  public async transferCredit(creditId: string, _toAddress: string): Promise<boolean> {
    const credit = this.credits.find((c) => c.id === creditId);
    if (!credit || credit.isRedeemed) {
      return false;
    }

    try {
      // In production, this would call smart contract to transfer
      // For demo, we just mark it as transferred
      credit.isRedeemed = true; // Temporarily mark as redeemed (transferred out)
      await this.saveCredits();
      return true;
    } catch (error) {
      console.error('Failed to transfer credit:', error);
      return false;
    }
  }

  /**
   * List credit on marketplace
   */
  public async listOnMarketplace(
    creditId: string,
    price: number
  ): Promise<MarketplaceListing> {
    const credit = this.credits.find((c) => c.id === creditId);
    if (!credit || credit.isRedeemed) {
      throw new Error('Credit not available for listing');
    }

    const listing: MarketplaceListing = {
      id: `listing-${Date.now()}`,
      creditId,
      sellerId: this.wallet?.address || 'unknown',
      price,
      amount: credit.amount,
      listedDate: new Date(),
      status: 'active',
    };

    // Save listing to storage
    const listings = await this.getMarketplaceListings();
    listings.push(listing);
    await AsyncStorage.setItem('marketplace_listings', JSON.stringify(listings));

    return listing;
  }

  /**
   * Get marketplace listings
   */
  public async getMarketplaceListings(): Promise<MarketplaceListing[]> {
    try {
      const stored = await AsyncStorage.getItem('marketplace_listings');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load marketplace listings:', error);
      return [];
    }
  }

  /**
   * Buy credit from marketplace
   */
  public async buyCreditFromMarketplace(listingId: string): Promise<boolean> {
    const listings = await this.getMarketplaceListings();
    const listing = listings.find((l) => l.id === listingId);
    
    if (!listing || listing.status !== 'active') {
      return false;
    }

    try {
      // In production, this would handle payment and transfer
      listing.status = 'sold';
      await AsyncStorage.setItem('marketplace_listings', JSON.stringify(listings));
      
      // Create new credit for buyer
      const newCredit: CarbonCredit = {
        id: `credit-${Date.now()}`,
        tokenId: `${Date.now()}`,
        amount: listing.amount,
        energySaved: 0,
        earnedDate: new Date(),
        blockchain: 'polygon',
        transactionHash: `0x${Math.random().toString(16).substring(2, 66)}`,
        isRedeemed: false,
        marketValue: listing.price,
      };
      
      this.credits.push(newCredit);
      await this.saveCredits();
      
      return true;
    } catch (error) {
      console.error('Failed to buy credit:', error);
      return false;
    }
  }

  /**
   * Get wallet info
   */
  public getWallet(): WalletInfo | null {
    return this.wallet;
  }

  /**
   * Disconnect wallet
   */
  public async disconnectWallet(): Promise<void> {
    this.wallet = null;
    this.provider = null;
    this.contract = null;
    await AsyncStorage.removeItem('blockchain_wallet');
  }

  /**
   * Save wallet to storage
   */
  private async saveWallet(): Promise<void> {
    try {
      if (this.wallet) {
        await AsyncStorage.setItem('blockchain_wallet', JSON.stringify(this.wallet));
      }
    } catch (error) {
      console.error('Failed to save wallet:', error);
    }
  }

  /**
   * Load wallet from storage
   */
  private async loadWallet(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('blockchain_wallet');
      if (stored) {
        this.wallet = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load wallet:', error);
    }
  }

  /**
   * Save credits to storage
   */
  private async saveCredits(): Promise<void> {
    try {
      await AsyncStorage.setItem('carbon_credits', JSON.stringify(this.credits));
    } catch (error) {
      console.error('Failed to save credits:', error);
    }
  }

  /**
   * Load credits from storage
   */
  private async loadCredits(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('carbon_credits');
      if (stored) {
        this.credits = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load credits:', error);
    }
  }

  /**
   * Get credit statistics
   */
  public getStatistics(): {
    totalCredits: number;
    totalCO2: number;
    totalValue: number;
    redeemedCredits: number;
    activeCredits: number;
  } {
    const totalCredits = this.credits.length;
    const redeemedCredits = this.credits.filter((c) => c.isRedeemed).length;
    const activeCredits = totalCredits - redeemedCredits;
    const totalCO2 = this.getTotalCO2Offset();
    const totalValue = this.getTotalMarketValue();

    return {
      totalCredits,
      totalCO2,
      totalValue,
      redeemedCredits,
      activeCredits,
    };
  }
}

export default BlockchainService.getInstance();
