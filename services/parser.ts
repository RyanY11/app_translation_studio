import { ParsedFile } from '../types';

/**
 * A heuristic parser to convert a TS object literal file into a JSON object.
 * NOTE: This is not a full AST parser but works for standard config files.
 */
export const parseTsFile = async (file: File): Promise<ParsedFile> => {
  const text = await file.text();
  
  // 1. Identify the range of the main object literal.
  // We prioritize finding "export default {" or similar patterns to avoid capturing imports.
  let startIndex = -1;
  const matchers = [
      /export\s+default\s*\{/,
      /export\s+const\s+\w+\s*=\s*\{/,
      /module\.exports\s*=\s*\{/
  ];

  for (const matcher of matchers) {
      const match = text.match(matcher);
      if (match && match.index !== undefined) {
          // The match includes the opening brace '{' at the end
          startIndex = match.index + match[0].length - 1;
          break;
      }
  }

  // Fallback: If no explicit export pattern found, take the first '{'
  if (startIndex === -1) {
      startIndex = text.indexOf('{');
  }

  const lastBrace = text.lastIndexOf('}');

  if (startIndex === -1 || lastBrace === -1 || startIndex >= lastBrace) {
    throw new Error("Invalid file format: Could not find object brackets {}");
  }

  const prefix = text.substring(0, startIndex);
  const objectString = text.substring(startIndex, lastBrace + 1);
  const suffix = text.substring(lastBrace + 1);

  // 2. Strategy A: Use Function constructor.
  // This is the most robust method for valid JavaScript object literals as it natively
  // handles trailing commas, single quotes, comments, etc.
  try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return ${objectString}`);
      const content = fn();
      if (content && typeof content === 'object') {
          return { content, prefix, suffix };
      }
  } catch (e) {
      // If Function constructor fails (e.g. strict mode issues, or undefined variables), 
      // proceed to Strategy B.
  }

  // 3. Strategy B: Regex-based JSON conversion.
  // Used as a fallback if the object cannot be directly evaluated.
  let jsonString = objectString;

  // Remove comments (Block and Line)
  jsonString = jsonString.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');

  // Convert single-quoted strings to double-quoted strings, handling escaped quotes.
  // e.g. 'It\'s me' -> "It's me"
  jsonString = jsonString.replace(/'((?:\\.|[^\\'])*)'/g, (match, p1) => {
      // p1 is the content inside quotes
      // 1. Unescape single quotes (e.g. \' -> ')
      let content = p1.replace(/\\'/g, "'");
      // 2. Escape double quotes (e.g. " -> \")
      content = content.replace(/"/g, '\\"');
      return `"${content}"`;
  });

  // Quote unquoted keys (e.g. { key: value } -> { "key": value })
  // Matches start of object or after comma
  jsonString = jsonString.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');

  // Remove trailing commas
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

  try {
    const content = JSON.parse(jsonString);
    return { content, prefix, suffix };
  } catch (e) {
    // Only log error if both strategies fail to avoid false alarms.
    console.error("Parse error details:", e);
    // console.error("Failed JSON string:", jsonString); 
    throw new Error("Could not parse file content. Please ensure it is a valid TypeScript object literal.");
  }
};

/**
 * Converts the state back into a TypeScript file string.
 */
export const generateTsFile = (content: Record<string, any>, prefix: string, suffix: string): string => {
  const json = JSON.stringify(content, null, 2);
  
  // Convert "key": to key: to make it look more like TS
  const tsLike = json.replace(/^(\s*)"([a-zA-Z0-9_]+)":/gm, '$1$2:');

  return `${prefix}${tsLike}${suffix}`;
};

/**
 * Flattens a nested object into a list of items for a specific top-level section.
 */
export const flattenSection = (sectionId: string, data: any): { localKey: string, value: string }[] => {
    const result: { localKey: string, value: string }[] = [];
    
    const recurse = (current: any, parentKey: string) => {
        if (typeof current === 'string') {
            result.push({ localKey: parentKey, value: current });
        } else if (typeof current === 'object' && current !== null) {
            Object.keys(current).forEach(key => {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                recurse(current[key], newKey);
            });
        }
    };

    recurse(data, "");
    return result;
};

/**
 * Unflattens the flat list back into the nested object structure for export.
 */
export const unflattenData = (items: { localKey: string, value: string }[]): any => {
    const result: any = {};
    
    items.forEach(item => {
        const parts = item.localKey.split('.');
        let current = result;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = item.value;
            } else {
                current[part] = current[part] || {};
                current = current[part];
            }
        }
    });
    
    return result;
};