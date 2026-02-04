export interface TranslationItem {
  key: string; // The full dot-notation key (e.g., "login.title")
  localKey: string; // The specific key for this level (e.g., "title")
  zh: string;
  en: string;
}

export interface SectionData {
  id: string; // Top level key (e.g., "LoginPage")
  items: TranslationItem[];
  screenshots: string[]; // Array of Data URLs
}

export interface ParsedFile {
  content: Record<string, any>;
  prefix: string; // e.g., "export default "
  suffix: string; // e.g., ";"
}

// Helper to keep track of the original file formatting structure if possible
export interface FileMetadata {
  zhPrefix: string;
  zhSuffix: string;
  enPrefix: string;
  enSuffix: string;
}