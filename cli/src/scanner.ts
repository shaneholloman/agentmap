// Scan directory for files with header comments/docstrings.

import { execSync } from 'child_process'
import picomatch from 'picomatch'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { extractMarker, extractMarkdownDescription } from './extract/marker.js'
import { extractDefinitions } from './extract/definitions.js'
import { getAllDiffData, applyDiffToDefinitions } from './extract/git-status.js'
import { parseCode, detectLanguage, LANGUAGE_EXTENSIONS } from './parser/index.js'
import type { FileResult, GenerateOptions, FileDiff, FileDiffStats } from './types.js'

/**
 * Maximum number of files to process (safety limit)
 * If exceeded, returns empty results to avoid scanning huge directories
 */
const MAX_FILES = 5_000_000

/**
 * Supported file extensions (from LANGUAGE_EXTENSIONS)
 */
const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_EXTENSIONS))

/**
 * Check if a file has a supported extension
 */
function isSupportedFile(filepath: string): boolean {
  const ext = filepath.slice(filepath.lastIndexOf('.'))
  return SUPPORTED_EXTENSIONS.has(ext)
}

/**
 * Check if a file is a README file (case-insensitive, with or without .md extension)
 */
function isReadmeFile(filepath: string): boolean {
  const filename = filepath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  return filename === 'readme.md' || filename === 'readme'
}

/**
 * Get tracked files using git ls-files
 * Only returns files that are tracked by git (committed or staged)
 */
function getGitFiles(dir: string): string[] {
  const maxBuffer = 1024 * 10000000
  try {
    // Get only tracked files
    const stdout = execSync('git ls-files', {
      cwd: dir,
      maxBuffer,
      encoding: 'utf8',
    })
    
    return stdout
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .map(normalize)
  } catch {
    return []
  }
}



/**
 * Scan directory and process files with header comments
 */
export async function scanDirectory(options: GenerateOptions = {}): Promise<FileResult[]> {
  const dir = options.dir ?? process.cwd()
  // Filter out null/undefined/empty patterns (cac can pass [null] when option not used)
  const ignorePatterns = (options.ignore ?? []).filter((p): p is string => !!p)
  const includeDiff = options.diff ?? false

  // Get file list from git (caller should ensure we're in a git repo)
  let files = getGitFiles(dir)

  // Filter by supported extensions or README files
  files = files.filter(f => isSupportedFile(f) || isReadmeFile(f))

  // Filter by ignore patterns
  if (ignorePatterns.length > 0) {
    const isIgnored = picomatch(ignorePatterns)
    files = files.filter(f => !isIgnored(f))
  }

  // Safety check: bail if too many files to avoid scanning huge directories
  if (files.length > MAX_FILES) {
    console.error(`Warning: Too many files (${files.length} > ${MAX_FILES}), skipping scan`)
    return []
  }

  // Get git diff data if needed (isolated from main processing)
  let fileStats: Map<string, FileDiffStats> | null = null
  let fileDiffs: Map<string, FileDiff> | null = null
  
  if (includeDiff) {
    try {
      const diffData = getAllDiffData(dir)
      fileStats = diffData.fileStats
      fileDiffs = diffData.fileDiffs
    } catch {
      // Diff failed - continue without diff info
      fileStats = null
      fileDiffs = null
    }
  }

  // Process each file
  const results: FileResult[] = []

  for (const relativePath of files) {
    const fullPath = join(dir, relativePath)
    // Normalize path for lookup (handle Windows backslashes)
    const normalizedPath = relativePath.replace(/\\/g, '/')

    try {
      const fileDiff = fileDiffs?.get(normalizedPath)
      const stats = fileStats?.get(normalizedPath)
      const result = await processFile(fullPath, relativePath, fileDiff, stats)
      if (result) {
        results.push(result)
      }
    } catch (err) {
      // Skip files that fail to process
      console.error(`Warning: Failed to process ${relativePath}:`, err)
    }
  }

  return results
}

/**
 * Process a single file - check for marker and extract definitions
 */
async function processFile(
  fullPath: string,
  relativePath: string,
  fileDiff?: FileDiff,
  fileStats?: FileDiffStats
): Promise<FileResult | null> {
  // Handle README.md files specially
  if (isReadmeFile(relativePath)) {
    const description = await extractMarkdownDescription(fullPath)
    if (!description) {
      return null
    }
    return {
      relativePath,
      description,
      definitions: [],
      diff: fileStats,
    }
  }

  // Check for marker first (only reads first 30KB)
  const marker = await extractMarker(fullPath)
  if (!marker.found) {
    return null
  }

  // Detect language
  const language = detectLanguage(relativePath)
  if (!language) {
    return null
  }

  // Read full file for parsing
  const code = await readFile(fullPath, 'utf8')

  // Parse and extract definitions
  const tree = await parseCode(code, language)
  let definitions = extractDefinitions(tree.rootNode, language)

  // Apply diff info if available (for definition-level stats)
  if (fileDiff) {
    definitions = applyDiffToDefinitions(definitions, fileDiff)
  }

  return {
    relativePath,
    description: marker.description,
    definitions,
    // Use pre-calculated file stats from --numstat (more reliable)
    diff: fileStats,
  }
}
