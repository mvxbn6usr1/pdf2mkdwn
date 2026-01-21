import type { Project, StoredFile } from '../types';

const DB_NAME = 'pdf2markdown';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;

// Encryption key derived from a fixed salt (stored in code) and browser-specific data
const ENCRYPTION_SALT = 'pdf2markdown-v1-salt';

async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // Use a combination of origin and salt for key derivation
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(window.location.origin + ENCRYPTION_SALT),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPTION_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';

  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV and encrypted data, then base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return '';

  try {
    const key = await getEncryptionKey();
    const combined = new Uint8Array(
      atob(ciphertext).split('').map((c) => c.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    console.error('Failed to decrypt data');
    return '';
  }
}

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create projects store
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }

      // Create files store with projectId index
      if (!db.objectStoreNames.contains('files')) {
        const filesStore = db.createObjectStore('files', { keyPath: 'id' });
        filesStore.createIndex('projectId', 'projectId', { unique: false });
      }

      // Create settings store (v2)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Project CRUD operations
export async function getAllProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();

    request.onsuccess = () => {
      const projects = request.result.map((p) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        resolve({
          ...request.result,
          createdAt: new Date(request.result.createdAt),
          updatedAt: new Date(request.result.updatedAt),
        });
      } else {
        resolve(undefined);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.add({
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.put({
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();

  // First delete all files in this project
  const files = await getFilesByProject(id);
  for (const file of files) {
    await deleteFile(file.id);
  }

  // Then delete the project
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// File CRUD operations
export async function getFilesByProject(projectId: string): Promise<StoredFile[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const store = transaction.objectStore('files');
    const index = store.index('projectId');
    const request = index.getAll(projectId);

    request.onsuccess = () => {
      const files = request.result.map((f) => ({
        ...f,
        createdAt: new Date(f.createdAt),
        updatedAt: new Date(f.updatedAt),
      }));
      resolve(files);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const store = transaction.objectStore('files');
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        resolve({
          ...request.result,
          createdAt: new Date(request.result.createdAt),
          updatedAt: new Date(request.result.updatedAt),
        });
      } else {
        resolve(undefined);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createFile(file: StoredFile): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.add({
      ...file,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateFile(file: StoredFile): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.put({
      ...file,
      createdAt: file.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Utility: Get file count per project
export async function getProjectFileCounts(): Promise<Map<string, number>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const store = transaction.objectStore('files');
    const request = store.getAll();

    request.onsuccess = () => {
      const counts = new Map<string, number>();
      for (const file of request.result) {
        const count = counts.get(file.projectId) || 0;
        counts.set(file.projectId, count + 1);
      }
      resolve(counts);
    };
    request.onerror = () => reject(request.error);
  });
}

// Settings operations
interface StoredSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    const setting: StoredSetting = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    };
    const request = store.put(setting);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result?.value ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// API Key operations (encrypted)
const API_KEY_SETTING = 'visionAPIKey';

export async function saveAPIKey(apiKey: string): Promise<void> {
  if (!apiKey) {
    await deleteSetting(API_KEY_SETTING);
    return;
  }
  const encrypted = await encrypt(apiKey);
  await saveSetting(API_KEY_SETTING, encrypted);
}

export async function loadAPIKey(): Promise<string> {
  const encrypted = await getSetting(API_KEY_SETTING);
  if (!encrypted) return '';
  return decrypt(encrypted);
}
