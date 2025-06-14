import { ethers } from 'ethers';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import bcrypt from 'bcryptjs';

interface UserData {
  user_id: string;
  password_hash: string;
  private_key: string;
  created_at: string;
}

// Function to hash a password using bcrypt
const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Function to verify a password against a hash
const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const authenticateUser = async (userId: string, password: string): Promise<UserData | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'mzs', userId));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data() as UserData;
    const isValid = await verifyPassword(password, userData.password_hash);
    if (!isValid) {
      console.log('Password verification failed');
      return null;
    }
    return userData;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
};

// Helper function to create a new user with hashed password
export const createUser = async (userId: string, password: string, privateKey: string): Promise<boolean> => {
  try {
    const hashedPassword = await hashPassword(password);
    await setDoc(doc(db, 'mzs', userId), {
      user_id: userId,
      password_hash: hashedPassword,
      private_key: privateKey,
      created_at: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error creating user:', error);
    return false;
  }
};

export const getUserWallet = async (userId: string): Promise<ethers.Wallet | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'mzs', userId));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data();
    if (!userData.private_key) return null;
    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
    return new ethers.Wallet(userData.private_key, provider);
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return null;
  }
};

export const updateUserWallet = async (userId: string, privateKey: string): Promise<boolean> => {
  try {
    await setDoc(doc(db, 'mzs', userId), {
      private_key: privateKey,
      updated_at: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating wallet:', error);
    return false;
  }
};

// MZS-specific versions
export const authenticateMzsUser = async (userId: string, password: string): Promise<UserData | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'mzs', userId));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data() as UserData;
    const isValid = await verifyPassword(password, userData.password_hash);
    if (!isValid) {
      console.log('Password verification failed');
      return null;
    }
    return userData;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
};

export const createMzsUser = async (userId: string, password: string, privateKey: string): Promise<boolean> => {
  try {
    const hashedPassword = await hashPassword(password);
    await setDoc(doc(db, 'mzs', userId), {
      user_id: userId,
      password_hash: hashedPassword,
      private_key: privateKey,
      created_at: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error creating user:', error);
    return false;
  }
};

export const getMzsUserWallet = async (userId: string): Promise<ethers.Wallet | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'mzs', userId));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data();
    if (!userData.private_key) return null;
    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL);
    return new ethers.Wallet(userData.private_key, provider);
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return null;
  }
};

export const updateMzsUserWallet = async (userId: string, privateKey: string): Promise<boolean> => {
  try {
    await setDoc(doc(db, 'mzs', userId), {
      private_key: privateKey,
      updated_at: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating wallet:', error);
    return false;
  }
}; 