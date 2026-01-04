// Extract top-level definitions using tree-sitter.

import type { Definition, DefinitionType, Language, SyntaxNode } from '../types.js'

/**
 * Minimum body lines for a function/class to be included in defs
 */
const MIN_BODY_LINES = 5

/**
 * Node types that represent functions per language
 */
const FUNCTION_TYPES: Record<Language, string[]> = {
  typescript: ['function_declaration', 'method_definition'],
  javascript: ['function_declaration', 'method_definition'],
  python: ['function_definition'],
  rust: ['function_item'],
  go: ['function_declaration', 'method_declaration'],
  zig: ['function_declaration', 'test_declaration'],
  cpp: ['function_definition'],
}

/**
 * Node types that represent classes per language
 */
const CLASS_TYPES: Record<Language, string[]> = {
  typescript: ['class_declaration', 'abstract_class_declaration'],
  javascript: ['class_declaration'],
  python: ['class_definition'],
  rust: [],  // Rust has structs/traits, not classes
  go: [],    // Go has structs, not classes
  zig: [],   // Zig has structs/unions, not classes
  cpp: ['class_specifier'],
}

/**
 * Node types that represent structs per language
 */
const STRUCT_TYPES: Record<Language, string[]> = {
  typescript: [],
  javascript: [],
  python: [],
  rust: ['struct_item'],
  go: [],
  zig: [],  // Handled via variable_declaration with struct value
  cpp: ['struct_specifier'],
}

/**
 * Node types that represent traits per language
 */
const TRAIT_TYPES: Record<Language, string[]> = {
  typescript: [],
  javascript: [],
  python: [],
  rust: ['trait_item'],
  go: [],
  zig: [],
  cpp: [],
}

/**
 * Node types that represent interfaces per language
 */
const INTERFACE_TYPES: Record<Language, string[]> = {
  typescript: ['interface_declaration'],
  javascript: [],
  python: [],
  rust: [],  // Rust traits handled in TRAIT_TYPES
  go: [],
  zig: [],
  cpp: [],
}

/**
 * Node types that represent type aliases per language
 */
const TYPE_TYPES: Record<Language, string[]> = {
  typescript: ['type_alias_declaration'],
  javascript: [],
  python: [],
  rust: ['type_item'],
  go: ['type_declaration'],
  zig: [],
  cpp: ['type_definition', 'alias_declaration'],
}

/**
 * Node types that represent enums per language
 */
const ENUM_TYPES: Record<Language, string[]> = {
  typescript: ['enum_declaration'],
  javascript: [],
  python: [],
  rust: ['enum_item'],
  go: [],
  zig: [],  // Handled via variable_declaration with enum value
  cpp: ['enum_specifier'],
}

/**
 * Node types that represent constants per language
 */
const CONST_TYPES: Record<Language, string[]> = {
  typescript: ['lexical_declaration'],
  javascript: ['lexical_declaration'],
  python: [],  // Python constants handled separately
  rust: ['const_item', 'static_item'],
  go: ['const_declaration', 'var_declaration'],
  zig: ['variable_declaration'],
  cpp: ['declaration'],
}

// ============================================================================
// Export detection helpers
// ============================================================================

/**
 * Check if a TS/JS node is an export statement
 */
function isExportStatement(node: SyntaxNode): boolean {
  return node.type === 'export_statement'
}

/**
 * Unwrap export statement to get the actual declaration
 */
function unwrapExport(node: SyntaxNode): SyntaxNode {
  if (node.type === 'export_statement') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue
      if (child.type !== 'export' && !child.type.includes('comment') && child.type !== 'default') {
        return child
      }
    }
  }
  return node
}

/**
 * Check if a Zig node has 'pub' modifier
 */
function isZigPub(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'pub') return true
    if (child?.type === 'identifier' || child?.type === 'block') break
  }
  return false
}

/**
 * Check if a Zig variable_declaration uses 'const' (not 'var')
 */
function isZigConst(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'const') return true
    if (child?.type === 'var') return false
  }
  return false
}

/**
 * Check if a Zig variable_declaration contains a struct/enum/union declaration
 */
function getZigTypeDeclaration(node: SyntaxNode): DefinitionType | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'struct_declaration') return 'struct'
    if (child?.type === 'union_declaration') return 'union'
    if (child?.type === 'enum_declaration') return 'enum'
  }
  return null
}

/**
 * Check if a Zig function has 'extern' modifier
 */
function isZigExtern(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'extern') return true
    if (child?.type === 'block' || child?.type === 'fn') break
  }
  return false
}

/**
 * Check if a Rust node has 'pub' visibility modifier
 */
function isRustPub(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'visibility_modifier') {
      return child.text.startsWith('pub')
    }
    if (child?.type === 'identifier' || child?.type === 'type_identifier') break
  }
  return false
}

/**
 * Check if a Go identifier is exported (starts with uppercase)
 */
function isGoExported(name: string | null): boolean {
  if (!name || name.length === 0) return false
  const firstChar = name.charAt(0)
  return firstChar >= 'A' && firstChar <= 'Z'
}

/**
 * Check if a C++ node has extern storage class or is in linkage_specification
 */
function isCppExtern(node: SyntaxNode): boolean {
  if (node.type === 'declaration' || node.type === 'function_definition') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'storage_class_specifier' && child.text === 'extern') {
        return true
      }
    }
  }
  return false
}

// ============================================================================
// Main extraction logic
// ============================================================================

interface ExtractOptions {
  node: SyntaxNode
  language: Language
}

interface ExtractInternalOptions extends ExtractOptions {
  /** Override: node is inside extern "C" block */
  forceExtern?: boolean
}

/**
 * Extract top-level definitions from a syntax tree
 */
export function extractDefinitions(
  rootNode: SyntaxNode,
  language: Language
): Definition[] {
  const definitions: Definition[] = []
  const seenNames = new Set<string>()

  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i)
    if (!node) continue

    // Handle C++ linkage_specification (extern "C" { ... })
    if (language === 'cpp' && node.type === 'linkage_specification') {
      for (let j = 0; j < node.childCount; j++) {
        const inner = node.child(j)
        if (!inner) continue
        if (inner.type === 'extern' || inner.type === 'string_literal') continue
        
        const defs = extractDefinition({ node: inner, language, forceExtern: true })
        for (const def of defs) {
          if (!seenNames.has(def.name)) {
            definitions.push(def)
            seenNames.add(def.name)
          }
        }
      }
      continue
    }

    const defs = extractDefinition({ node, language })
    for (const def of defs) {
      if (!seenNames.has(def.name)) {
        definitions.push(def)
        seenNames.add(def.name)
      }
    }
  }

  return definitions
}

/**
 * Extract definition(s) from a single node.
 * Handles export detection, unwrapping, and multiple declarations internally.
 */
function extractDefinition(opts: ExtractInternalOptions): Definition[] {
  const { node, language, forceExtern = false } = opts
  
  // Determine exported status and get actual node to process
  let exported: boolean
  let actualNode: SyntaxNode
  let isExtern = forceExtern
  
  switch (language) {
    case 'typescript':
    case 'javascript':
      exported = isExportStatement(node)
      actualNode = unwrapExport(node)
      break
    case 'zig':
      exported = isZigPub(node)
      actualNode = node
      isExtern = isExtern || isZigExtern(node)
      break
    case 'rust':
      exported = isRustPub(node)
      actualNode = node
      break
    case 'go':
      // Go: exported determined per-name (uppercase = exported)
      // We'll handle this in createDefinition
      exported = false  // placeholder, resolved per-name
      actualNode = node
      break
    case 'cpp':
      exported = false  // C++ doesn't have module exports in this sense
      actualNode = node
      isExtern = isExtern || isCppExtern(node)
      break
    case 'python':
    default:
      exported = false
      actualNode = node
      break
  }

  const results: Definition[] = []
  
  // Helper to resolve export status (Go uses name-based exports)
  const resolveExported = (name: string): boolean => {
    if (language === 'go') return isGoExported(name)
    return exported
  }
  
  // Helper to create a definition
  const createDef = (
    name: string,
    type: DefinitionType,
    startLine: number,
    endLine: number
  ): Definition => ({
    name,
    line: startLine,
    endLine,
    type,
    exported: resolveExported(name),
    ...(isExtern ? { extern: true } : {})
  })

  const functionTypes = FUNCTION_TYPES[language]
  const classTypes = CLASS_TYPES[language]
  const structTypes = STRUCT_TYPES[language]
  const traitTypes = TRAIT_TYPES[language]
  const interfaceTypes = INTERFACE_TYPES[language]
  const typeTypes = TYPE_TYPES[language]
  const enumTypes = ENUM_TYPES[language]
  const constTypes = CONST_TYPES[language]

  // Functions
  if (functionTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'function', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Classes
  if (classTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'class', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Structs
  if (structTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'struct', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Traits
  if (traitTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name && getBodyLineCount(actualNode) > MIN_BODY_LINES) {
      results.push(createDef(name, 'trait', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Interfaces
  if (interfaceTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name) {
      results.push(createDef(name, 'interface', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Type aliases
  if (typeTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name) {
      results.push(createDef(name, 'type', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Enums
  if (enumTypes.includes(actualNode.type)) {
    const name = extractName({ node: actualNode, language })
    if (name) {
      results.push(createDef(name, 'enum', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  // Constants/variables
  if (constTypes.includes(actualNode.type)) {
    // Zig: pub const (may be struct/enum/union or plain const)
    if (language === 'zig') {
      if (!exported || !isZigConst(actualNode)) {
        return results
      }
      const name = extractZigName(actualNode)
      if (name) {
        // Use specific type if struct/enum/union, otherwise const
        const zigType = getZigTypeDeclaration(actualNode)
        const type = zigType ?? 'const'
        results.push(createDef(name, type, actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
      }
      return results
    }

    // TS/JS: handle arrow functions and multiple declarations
    if (language === 'typescript' || language === 'javascript') {
      // Non-exported: only include large arrow functions
      if (!exported) {
        const arrowFn = extractArrowFunction(actualNode)
        if (arrowFn && arrowFn.bodyLines > MIN_BODY_LINES) {
          results.push({
            name: arrowFn.name,
            line: arrowFn.line,
            endLine: arrowFn.endLine,
            type: 'function',
            exported: false
          })
        }
        return results
      }
      
      // Exported: extract all declarations
      return extractJSDeclarations({ node: actualNode, language, exported, isExtern })
    }

    // Other languages: simple const extraction
    const name = extractConstName({ node: actualNode, language })
    if (name) {
      results.push(createDef(name, 'const', actualNode.startPosition.row + 1, actualNode.endPosition.row + 1))
    }
    return results
  }

  return results
}

/**
 * Extract all declarations from a TS/JS lexical_declaration
 * Handles: const a = 1, const b = () => {}, const c = 1, d = 2
 */
function extractJSDeclarations(opts: {
  node: SyntaxNode
  language: Language
  exported: boolean
  isExtern: boolean
}): Definition[] {
  const { node, exported, isExtern } = opts
  const results: Definition[] = []

  if (node.type !== 'lexical_declaration') {
    // Single const extraction fallback
    const name = extractConstName({ node, language: opts.language })
    if (name) {
      results.push({
        name,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'const',
        exported,
        ...(isExtern ? { extern: true } : {})
      })
    }
    return results
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type !== 'variable_declarator') continue

    const nameNode = child.childForFieldName('name')
    const valueNode = child.childForFieldName('value')
    if (!nameNode) continue

    const isArrowFn = valueNode?.type === 'arrow_function'
    const type: DefinitionType = isArrowFn ? 'function' : 'const'

    // Skip small arrow functions
    if (isArrowFn && valueNode && getBodyLineCount(valueNode) <= MIN_BODY_LINES) {
      continue
    }

    results.push({
      name: nameNode.text,
      line: child.startPosition.row + 1,
      endLine: child.endPosition.row + 1,
      type,
      exported,
      ...(isExtern ? { extern: true } : {})
    })
  }

  return results
}

// ============================================================================
// Name extraction helpers
// ============================================================================

/**
 * Extract the name from a definition node
 */
function extractName(opts: ExtractOptions): string | null {
  const { node, language } = opts
  
  // Try 'name' field first
  const nameNode = node.childForFieldName('name')
  if (nameNode) {
    return nameNode.text
  }

  switch (language) {
    case 'typescript':
    case 'javascript':
      return extractJSName(node)
    case 'python':
      return extractPythonName(node)
    case 'rust':
      return extractRustName(node)
    case 'go':
      return extractGoName(node)
    case 'zig':
      return extractZigName(node)
    case 'cpp':
      return extractCppName(node)
  }

  return null
}

/**
 * Extract name from a const/let declaration
 */
function extractConstName(opts: ExtractOptions): string | null {
  const { node, language } = opts

  if (language === 'typescript' || language === 'javascript') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'variable_declarator') {
        const nameNode = child.childForFieldName('name')
        return nameNode?.text ?? null
      }
    }
  }

  if (language === 'rust') {
    return extractName(opts)
  }

  if (language === 'go') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'const_spec' || child?.type === 'var_spec') {
        const nameNode = child.childForFieldName('name')
        return nameNode?.text ?? null
      }
    }
  }

  if (language === 'zig') {
    return extractZigName(node)
  }

  if (language === 'cpp') {
    return extractCppName(node)
  }

  return null
}

function extractJSName(node: SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === 'identifier' || child.type === 'type_identifier') {
      return child.text
    }
    if (child.type === 'property_identifier') {
      return child.text
    }
  }
  return null
}

function extractPythonName(node: SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier') {
      return child.text
    }
  }
  return null
}

function extractRustName(node: SyntaxNode): string | null {
  if (node.type === 'impl_item') {
    const typeNode = node.childForFieldName('type')
    if (typeNode) {
      const ident = typeNode.type === 'type_identifier' 
        ? typeNode 
        : findChild(typeNode, 'type_identifier')
      return ident?.text ?? null
    }
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier' || child?.type === 'type_identifier') {
      return child.text
    }
  }
  return null
}

function extractGoName(node: SyntaxNode): string | null {
  if (node.type === 'type_declaration') {
    const spec = findChild(node, 'type_spec')
    if (spec) {
      const nameNode = spec.childForFieldName('name')
      return nameNode?.text ?? null
    }
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier' || child?.type === 'field_identifier') {
      return child.text
    }
  }
  return null
}

function extractZigName(node: SyntaxNode): string | null {
  if (node.type === 'test_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'string') {
        const text = child.text
        if (text.startsWith('"') && text.endsWith('"')) {
          return text.slice(1, -1)
        }
        return text
      }
      if (child?.type === 'identifier') {
        return child.text
      }
    }
    return null
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier') {
      return child.text
    }
  }
  return null
}

function extractCppName(node: SyntaxNode): string | null {
  if (node.type === 'function_definition') {
    const declarator = node.childForFieldName('declarator')
    if (declarator) {
      const funcDecl = declarator.type === 'function_declarator' 
        ? declarator 
        : findChild(declarator, 'function_declarator')
      if (funcDecl) {
        const innerDecl = funcDecl.childForFieldName('declarator')
        if (innerDecl?.type === 'identifier') {
          return innerDecl.text
        }
        if (innerDecl?.type === 'qualified_identifier') {
          const name = innerDecl.childForFieldName('name')
          return name?.text ?? null
        }
      }
    }
  }

  if (node.type === 'struct_specifier' || node.type === 'class_specifier' || node.type === 'enum_specifier') {
    const nameNode = node.childForFieldName('name')
    if (nameNode) {
      return nameNode.text
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child?.type === 'type_identifier') {
        return child.text
      }
    }
  }

  if (node.type === 'type_definition') {
    const declarator = node.childForFieldName('declarator')
    if (declarator?.type === 'type_identifier') {
      return declarator.text
    }
  }

  if (node.type === 'alias_declaration') {
    const nameNode = node.childForFieldName('name')
    return nameNode?.text ?? null
  }

  if (node.type === 'declaration') {
    const declarator = node.childForFieldName('declarator')
    if (declarator) {
      if (declarator.type === 'identifier') {
        return declarator.text
      }
      if (declarator.type === 'init_declarator') {
        const innerDecl = declarator.childForFieldName('declarator')
        if (innerDecl?.type === 'identifier') {
          return innerDecl.text
        }
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === 'identifier' || child?.type === 'type_identifier') {
      return child.text
    }
  }
  return null
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Extract arrow function assigned to const/let
 */
function extractArrowFunction(node: SyntaxNode): { name: string; line: number; endLine: number; bodyLines: number } | null {
  if (node.type !== 'lexical_declaration') return null

  for (let i = 0; i < node.childCount; i++) {
    const declarator = node.child(i)
    if (declarator?.type !== 'variable_declarator') continue

    const nameNode = declarator.childForFieldName('name')
    const valueNode = declarator.childForFieldName('value')

    if (nameNode && valueNode?.type === 'arrow_function') {
      return {
        name: nameNode.text,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        bodyLines: getBodyLineCount(valueNode),
      }
    }
  }

  return null
}

/**
 * Find a child node by type
 */
function findChild(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === type) return child
  }
  return null
}

/**
 * Get the number of lines in a node's body
 */
function getBodyLineCount(node: SyntaxNode): number {
  return node.endPosition.row - node.startPosition.row + 1
}
