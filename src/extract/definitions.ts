// @agentmap
// Extract top-level function and class definitions using tree-sitter.

import type { Definition, Language, SyntaxNode } from '../types.js'

/**
 * Node types that represent functions per language
 */
const FUNCTION_TYPES: Record<Language, string[]> = {
  typescript: ['function_declaration', 'method_definition'],
  javascript: ['function_declaration', 'method_definition'],
  python: ['function_definition'],
  rust: ['function_item'],
  go: ['function_declaration', 'method_declaration'],
}

/**
 * Node types that represent classes per language
 */
const CLASS_TYPES: Record<Language, string[]> = {
  typescript: ['class_declaration', 'abstract_class_declaration'],
  javascript: ['class_declaration'],
  python: ['class_definition'],
  rust: ['struct_item', 'enum_item', 'impl_item', 'trait_item'],
  go: ['type_declaration'],
}

/**
 * Extract top-level definitions from a syntax tree
 */
export function extractDefinitions(
  rootNode: SyntaxNode,
  language: Language
): Definition[] {
  const definitions: Definition[] = []
  const functionTypes = FUNCTION_TYPES[language]
  const classTypes = CLASS_TYPES[language]

  // Walk immediate children of root (top-level only)
  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i)
    if (!node) continue

    // Handle export statements (unwrap to get actual declaration)
    const actualNode = unwrapExport(node)
    
    // Check for function
    if (functionTypes.includes(actualNode.type)) {
      const name = extractName(actualNode, language)
      if (name) {
        definitions.push({
          name,
          line: actualNode.startPosition.row + 1,  // 1-based
          type: 'function',
        })
      }
    }

    // Check for class
    if (classTypes.includes(actualNode.type)) {
      const name = extractName(actualNode, language)
      if (name) {
        definitions.push({
          name,
          line: actualNode.startPosition.row + 1,  // 1-based
          type: 'class',
        })
      }
    }

    // Handle variable declarations with arrow functions (TS/JS)
    if (language === 'typescript' || language === 'javascript') {
      const arrowFn = extractArrowFunction(actualNode)
      if (arrowFn) {
        definitions.push({
          name: arrowFn.name,
          line: arrowFn.line,
          type: 'function',
        })
      }
    }
  }

  return definitions
}

/**
 * Unwrap export statement to get the actual declaration
 */
function unwrapExport(node: SyntaxNode): SyntaxNode {
  if (node.type === 'export_statement') {
    // Find the declaration child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue
      // Skip 'export' keyword and other tokens
      if (child.type !== 'export' && !child.type.includes('comment')) {
        return child
      }
    }
  }
  return node
}

/**
 * Extract the name from a definition node
 */
function extractName(node: SyntaxNode, language: Language): string | null {
  // Try to find 'name' field first
  const nameNode = node.childForFieldName('name')
  if (nameNode) {
    return nameNode.text
  }

  // Language-specific fallbacks
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
  }

  return null
}

function extractJSName(node: SyntaxNode): string | null {
  // Look for identifier or type_identifier child
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
  // For impl blocks, try to get the type name
  if (node.type === 'impl_item') {
    const typeNode = node.childForFieldName('type')
    if (typeNode) {
      // Get the type identifier
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
  // For type declarations, look in type_spec
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

/**
 * Extract arrow function assigned to const/let
 */
function extractArrowFunction(node: SyntaxNode): { name: string; line: number } | null {
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
