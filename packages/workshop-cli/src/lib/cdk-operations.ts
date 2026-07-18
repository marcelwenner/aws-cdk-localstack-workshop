/**
 * CDK Operations
 *
 * Provides functions for manipulating the CDK stack file:
 * - Detecting commented-out Lambda definitions
 * - Uncommenting Lambda blocks for each phase
 * - Validating CDK changes
 * - Providing intelligent feedback on CDK errors
 *
 * The workshop-stack.ts file uses TWO comment styles:
 * - Block comments (slash-star) for CODE that should be uncommented
 * - Line comments (//) for explanations that should STAY as comments
 *
 * This makes it easy to apply solutions: just remove block comment markers!
 */

import { readFile, writeFile, copyFile, mkdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { getProjectRoot, getBackupDir } from './paths.js';

// =============================================================================
// Types
// =============================================================================

export interface CdkBlock {
  phase: number;
  lambdaName: string;
  startLine: number;
  endLine: number;
  isCommented: boolean;
  content: string;
}

export interface CdkAnalysis {
  stackPath: string;
  blocks: CdkBlock[];
  errors: CdkError[];
}

export type CdkErrorType =
  | 'MISSING_LAMBDA'      // Lambda definition completely missing
  | 'STILL_COMMENTED'     // Lambda still has // in front
  | 'PARTIAL_UNCOMMENT'   // Some lines uncommented, some not
  | 'SYNTAX_ERROR'        // TypeScript syntax error
  | 'MISSING_GRANT'       // grant* call missing
  | 'WRONG_GRANT'         // Wrong grant method used
  | 'MISSING_EVENT_SOURCE'// SQS Event Source missing (Phase 3/4)
  | 'WRONG_VARIABLE_NAME' // Variable name changed
  | 'DELETED_CODE'        // User deleted code instead of uncommenting
  | 'EXTRA_CODE';         // User added unexpected code

export interface CdkError {
  type: CdkErrorType;
  phase: number;
  message: string;
  hint: string;
  lineNumber?: number;
  canAutoFix: boolean;
  severity: 'error' | 'warning';
}

export interface CdkDiff {
  phase: number;
  lambdaName: string;
  linesAdded: number;
  preview: string[];
}

// =============================================================================
// Constants
// =============================================================================

const CDK_STACK_PATH = 'cdk/lib/workshop-stack.ts';

// Lambda definitions per phase with expected code patterns
export const PHASE_LAMBDAS: Record<number, {
  name: string;
  variableName: string;
  startMarker: string;
  expectedPatterns: string[];      // Must be present (uncommented)
  requiredGrants: string[];        // Grant calls that must exist
  hasEventSource: boolean;         // Needs SqsEventSource?
  entryPathContains: string;       // Entry path should contain this
}> = {
  2: {
    name: 'MarkingStarterLambda',
    variableName: 'markingStarterLambda',
    startMarker: '// ⚠️ TODO PHASE 2:',
    expectedPatterns: [
      "new nodejs.NodejsFunction",
      "functionName: 'MarkingStarterLambda'",
      "marking-starter-lambda",
    ],
    requiredGrants: ['ltsWorkerQueue.grantSendMessages(markingStarterLambda)'],
    hasEventSource: false,
    entryPathContains: 'marking-starter-lambda',
  },
  3: {
    name: 'LtsExecutorLambda',
    variableName: 'ltsExecutorLambda',
    startMarker: '// ⚠️ TODO PHASE 3:',
    expectedPatterns: [
      "new nodejs.NodejsFunction",
      "functionName: 'LtsExecutorLambda'",
      "lts-executor-lambda",
      "addEventSource",
      "SqsEventSource",
    ],
    requiredGrants: [
      'ltsWorkerQueue.grantConsumeMessages(ltsExecutorLambda)',
      'ltsWorkerQueue.grantSendMessages(ltsExecutorLambda)',
      'completionQueue.grantSendMessages(ltsExecutorLambda)',
    ],
    hasEventSource: true,
    entryPathContains: 'lts-executor-lambda',
  },
  4: {
    name: 'StatusPollerLambda',
    variableName: 'statusPollerLambda',
    startMarker: '// ⚠️ TODO PHASE 4:',
    expectedPatterns: [
      "new nodejs.NodejsFunction",
      "functionName: 'StatusPollerLambda'",
      "status-poller-lambda",
      "addEventSource",
      "SqsEventSource",
    ],
    requiredGrants: [
      'statusCheckQueue.grantConsumeMessages(statusPollerLambda)',
      'statusCheckQueue.grantSendMessages(statusPollerLambda)',
      'completionQueue.grantSendMessages(statusPollerLambda)',
    ],
    hasEventSource: true,
    entryPathContains: 'status-poller-lambda',
  },
};

/** Expected line ranges for each phase (approximate, for deletion detection) */
const EXPECTED_LINE_COUNTS: Record<number, { min: number; max: number }> = {
  2: { min: 10, max: 20 },  // Lambda + 1 grant
  3: { min: 20, max: 35 },  // Lambda + EventSource + 3 grants
  4: { min: 20, max: 35 },  // Lambda + EventSource + 3 grants
};

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Get the full path to the CDK stack file
 */
export function getCdkStackPath(): string {
  return join(getProjectRoot(), CDK_STACK_PATH);
}

/**
 * Read the CDK stack file content
 */
export async function readCdkStack(): Promise<string> {
  const stackPath = getCdkStackPath();
  try {
    return await readFile(stackPath, 'utf-8');
  } catch (error) {
    throw new Error(`CDK Stack nicht gefunden: ${CDK_STACK_PATH}`);
  }
}

/**
 * Analyze the CDK stack and find all Lambda blocks
 */
export async function analyzeCdkStack(): Promise<CdkAnalysis> {
  const content = await readCdkStack();
  const lines = content.split('\n');
  const blocks: CdkBlock[] = [];
  const errors: CdkError[] = [];

  for (const [phase, config] of Object.entries(PHASE_LAMBDAS)) {
    const phaseNum = parseInt(phase);
    const block = findLambdaBlock(lines, phaseNum, config);

    if (block) {
      blocks.push(block);
    } else {
      // Lambda definition not found at all (not even commented)
      errors.push({
        type: 'MISSING_LAMBDA',
        phase: phaseNum,
        message: `${config.name} Definition nicht gefunden`,
        hint: `Füge den TODO-Kommentar "${config.startMarker}" hinzu`,
        canAutoFix: true,
        severity: 'error',
      });
    }
  }

  return {
    stackPath: getCdkStackPath(),
    blocks,
    errors,
  };
}

/**
 * Find a Lambda block in the CDK stack
 *
 * NEW: Detects block comments instead of line comments
 */
function findLambdaBlock(
  lines: string[],
  phase: number,
  config: { name: string; startMarker: string }
): CdkBlock | null {
  let startLine = -1;
  let endLine = -1;
  let isCommented = false;

  // Find the start marker (// ⚠️ TODO PHASE X:)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(config.startMarker)) {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) {
    // Check if Lambda exists without marker (already uncommented and marker removed)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`'${config.name}'`) && !lines[i].trim().startsWith('//')) {
        // Found uncommented Lambda definition
        return findUncommentedLambdaBlock(lines, i, phase, config.name);
      }
    }
    return null;
  }

  // Find the end of this phase's section (next TODO marker or Outputs section)
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('// ⚠️ TODO PHASE') || line.includes('// ========')) {
      endLine = i - 1;
      break;
    }
  }

  if (endLine === -1) {
    endLine = lines.length - 1;
  }

  // Check if block contains /* */ block comment (code is commented out)
  const blockContent = lines.slice(startLine, endLine + 1).join('\n');

  // Look for /* that starts a block comment (not inside a string)
  const hasBlockCommentStart = /^\s*\/\*/m.test(blockContent);
  const hasBlockCommentEnd = /\*\/\s*$/m.test(blockContent);

  // Block is "commented" if it has /* ... */ wrapping the code
  isCommented = hasBlockCommentStart && hasBlockCommentEnd;

  return {
    phase,
    lambdaName: config.name,
    startLine,
    endLine,
    isCommented,
    content: blockContent,
  };
}

/**
 * Find an uncommented Lambda block (when it's already been uncommented)
 */
function findUncommentedLambdaBlock(
  lines: string[],
  startLine: number,
  phase: number,
  lambdaName: string
): CdkBlock {
  let endLine = startLine;
  let braceCount = 0;
  let foundStart = false;

  // Find the full Lambda definition by counting braces
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === '{' || char === '(') {
        braceCount++;
        foundStart = true;
      } else if (char === '}' || char === ')') {
        braceCount--;
      }
    }

    if (foundStart && braceCount === 0) {
      endLine = i;
      break;
    }
  }

  // Look for associated grant calls after the Lambda definition
  for (let i = endLine + 1; i < lines.length && i < endLine + 10; i++) {
    const line = lines[i].trim();
    if (line.includes('.grant') && !line.startsWith('//')) {
      endLine = i;
    } else if (line.startsWith('const ') || line.startsWith('// ')) {
      break;
    }
  }

  const content = lines.slice(startLine, endLine + 1).join('\n');

  return {
    phase,
    lambdaName,
    startLine,
    endLine,
    isCommented: false,
    content,
  };
}

/**
 * Check if a Lambda is deployed (for a specific phase)
 */
export async function isLambdaInCdk(lambdaName: string): Promise<boolean> {
  const content = await readCdkStack();

  // Check if Lambda is defined AND not commented out
  const lines = content.split('\n');

  for (const line of lines) {
    // Look for functionName: 'LambdaName' that's not commented
    if (line.includes(`functionName: '${lambdaName}'`) && !line.trim().startsWith('//')) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Modification Functions
// =============================================================================

/**
 * Uncomment a Lambda block for a specific phase
 * Returns a diff preview of what will change
 *
 * NEW: Shows preview with block comments removed
 */
export async function getUncommentDiff(phase: number): Promise<CdkDiff | null> {
  const config = PHASE_LAMBDAS[phase];
  if (!config) return null;

  const analysis = await analyzeCdkStack();
  const block = analysis.blocks.find(b => b.phase === phase);

  if (!block || !block.isCommented) {
    return null; // Nothing to uncomment
  }

  // Generate preview with /* */ removed
  const uncommentedLines = block.content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Remove lines that are just /* or */
      return trimmed !== '/*' && trimmed !== '*/';
    })
    .map(line => {
      // Remove /* or */ from lines that have other content
      return line.replace(/\/\*\s*/, '').replace(/\s*\*\//, '');
    });

  return {
    phase,
    lambdaName: config.name,
    linesAdded: uncommentedLines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
    preview: uncommentedLines.slice(0, 15), // First 15 lines as preview
  };
}

/**
 * Apply CDK changes for a phase (uncomment the Lambda block)
 * Creates a backup before modification
 * For Phase 3+, also activates previous phases if they're still commented
 *
 * NEW: Removes block comments instead of line comments
 */
export async function applyCdkChanges(phase: number): Promise<{ success: boolean; message: string }> {
  const config = PHASE_LAMBDAS[phase];
  if (!config) {
    return { success: false, message: `Keine CDK-Änderungen für Phase ${phase} definiert` };
  }

  // Create backup first
  await backupCdkStack(phase);

  let content = await readCdkStack();
  const activatedPhases: string[] = [];

  // For Phase 3+, first activate any previous phases that are still commented
  if (phase >= 3) {
    for (let prevPhase = 2; prevPhase < phase; prevPhase++) {
      const prevConfig = PHASE_LAMBDAS[prevPhase];
      if (!prevConfig) continue;

      const analysis = await analyzeCdkStack();
      const prevBlock = analysis.blocks.find(b => b.phase === prevPhase);

      if (prevBlock && prevBlock.isCommented) {
        // Remove /* */ block comments for this phase
        content = removeBlockComments(content, prevBlock);
        activatedPhases.push(prevConfig.name);

        // Write and re-read for next analysis
        await writeFile(getCdkStackPath(), content, 'utf-8');
        content = await readCdkStack();
      }
    }
  }

  // Now activate the current phase
  const analysis = await analyzeCdkStack();
  const block = analysis.blocks.find(b => b.phase === phase);

  if (!block) {
    return { success: false, message: `${config.name} Block nicht gefunden` };
  }

  if (!block.isCommented) {
    if (activatedPhases.length === 0) {
      return { success: true, message: `${config.name} ist bereits aktiv` };
    }
  } else {
    // Remove /* */ block comments
    content = removeBlockComments(content, block);
    await writeFile(getCdkStackPath(), content, 'utf-8');
  }

  // Build message
  if (activatedPhases.length > 0) {
    activatedPhases.push(config.name);
    return {
      success: true,
      message: `Aktiviert: ${activatedPhases.join(', ')}. Führe jetzt 'cdklocal deploy' aus.`,
    };
  }

  return {
    success: true,
    message: `${config.name} aktiviert! Führe jetzt 'cdklocal deploy' aus.`,
  };
}

/**
 * Remove block comments from a CDK block
 * Preserves line comments (explanations)
 */
function removeBlockComments(content: string, block: CdkBlock): string {
  const lines = content.split('\n');

  // Find and remove /* and */ lines within the block
  for (let i = block.startLine; i <= block.endLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Remove lines that are just /* or */
    if (trimmed === '/*' || trimmed === '*/') {
      lines[i] = '';
    }
    // Remove /* at start of line (keeping rest of line)
    else if (trimmed.startsWith('/*')) {
      lines[i] = line.replace(/\/\*\s*/, '');
    }
    // Remove */ at end of line (keeping rest of line)
    else if (trimmed.endsWith('*/')) {
      lines[i] = line.replace(/\s*\*\//, '');
    }
  }

  // Clean up empty lines (but keep at most one)
  const result: string[] = [];
  let lastWasEmpty = false;

  for (const line of lines) {
    const isEmpty = line.trim() === '';
    if (isEmpty && lastWasEmpty) {
      continue; // Skip consecutive empty lines
    }
    result.push(line);
    lastWasEmpty = isEmpty;
  }

  return result.join('\n');
}

/**
 * Create a backup of the CDK stack before modification
 */
async function backupCdkStack(phase: number): Promise<void> {
  const backupDir = join(getBackupDir(), `cdk-phase${phase}`);
  const backupPath = join(backupDir, 'workshop-stack.ts');

  await mkdir(backupDir, { recursive: true });
  await copyFile(getCdkStackPath(), backupPath);
}

/**
 * Restore CDK stack from backup
 */
export async function restoreCdkStack(phase: number): Promise<boolean> {
  const backupPath = join(getBackupDir(), `cdk-phase${phase}`, 'workshop-stack.ts');

  try {
    await stat(backupPath);
    await copyFile(backupPath, getCdkStackPath());
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Validation & Error Detection (Intelligent)
// =============================================================================

/**
 * Deep validation of CDK stack for a specific phase.
 * Detects exactly what the user did wrong and provides precise fixes.
 *
 * NEW: Checks for block comments instead of line comments
 */
export async function validateCdkForPhase(phase: number): Promise<CdkError[]> {
  const errors: CdkError[] = [];
  const config = PHASE_LAMBDAS[phase];
  if (!config) return errors;

  const content = await readCdkStack();
  const lines = content.split('\n');

  // Find the block for this phase
  const analysis = await analyzeCdkStack();
  const block = analysis.blocks.find(b => b.phase === phase);

  // ==========================================================================
  // Check 1: Does the block exist at all?
  // ==========================================================================
  if (!block) {
    // Check if user deleted the TODO marker
    const hasAnyReference = content.includes(config.name);
    if (hasAnyReference) {
      errors.push({
        type: 'DELETED_CODE',
        phase,
        message: `Der TODO-Marker für ${config.name} wurde gelöscht`,
        hint: 'Der Original-Code-Block wurde verändert. Nutze [r] um den CDK-Stack zurückzusetzen.',
        canAutoFix: true,
        severity: 'error',
      });
    } else {
      errors.push({
        type: 'MISSING_LAMBDA',
        phase,
        message: `${config.name} ist nicht im CDK Stack`,
        hint: 'Der Code-Block fehlt komplett. Nutze [r] um den CDK-Stack zurückzusetzen.',
        canAutoFix: true,
        severity: 'error',
      });
    }
    return errors;
  }

  // ==========================================================================
  // Check 2: Is it still wrapped in /* */ block comments?
  // ==========================================================================
  if (block.isCommented) {
    // Find where /* and */ are located
    let blockCommentStart = -1;
    let blockCommentEnd = -1;

    for (let i = block.startLine; i <= block.endLine; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '/*' || trimmed.startsWith('/*')) {
        blockCommentStart = i + 1;
      }
      if (trimmed === '*/' || trimmed.endsWith('*/')) {
        blockCommentEnd = i + 1;
      }
    }

    errors.push({
      type: 'STILL_COMMENTED',
      phase,
      message: `${config.name} ist noch auskommentiert`,
      hint: `Entferne /* (Zeile ${blockCommentStart}) und */ (Zeile ${blockCommentEnd}) um den Code zu aktivieren`,
      lineNumber: blockCommentStart,
      canAutoFix: true,
      severity: 'error',
    });
    return errors; // Can't check more if fully commented
  }

  // ==========================================================================
  // Check 3: Check for stray /* or */ that weren't fully removed
  // ==========================================================================
  const blockContent = block.content;

  // Check if there are still /* or */ markers that need to be removed.
  // Line comments may mention the markers in their text (the TODO steps do),
  // so only lines that are not // comments count.
  const hasStrayBlockMarkers = blockContent.split('\n').some(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return false;
    return trimmed.includes('/*') || trimmed.includes('*/');
  });

  if (hasStrayBlockMarkers) {
    errors.push({
      type: 'PARTIAL_UNCOMMENT',
      phase,
      message: `Block-Kommentar wurde nicht vollständig entfernt`,
      hint: `Entferne alle /* und */ Marker im ${config.name} Block`,
      lineNumber: block.startLine + 1,
      canAutoFix: true,
      severity: 'error',
    });
  }

  // ==========================================================================
  // Check 4: Required patterns present (Lambda definition correct)
  // ==========================================================================
  const uncommentedContent = content; // For regex-based checks below

  // Check each expected pattern - must exist and be uncommented
  for (const pattern of config.expectedPatterns) {
    // Check if pattern exists on any uncommented line
    const patternExists = lines.some(line => {
      const trimmed = line.trim();
      // Line contains pattern AND is not commented out
      return line.includes(pattern) && !trimmed.startsWith('//');
    });

    if (!patternExists) {
      // Check if it exists but is commented
      const existsButCommented = lines.some(line =>
        line.includes(pattern) && line.trim().startsWith('//')
      );

      if (existsButCommented) {
        errors.push({
          type: 'STILL_COMMENTED',
          phase,
          message: `"${pattern}" ist noch auskommentiert`,
          hint: `Suche nach "${pattern}" und entferne die // davor`,
          canAutoFix: true,
          severity: 'error',
        });
      } else {
        errors.push({
          type: 'DELETED_CODE',
          phase,
          message: `Erwarteter Code fehlt: "${pattern}"`,
          hint: `Der Code wurde verändert oder gelöscht. Nutze [r] für Reset.`,
          canAutoFix: true,
          severity: 'error',
        });
      }
    }
  }

  // ==========================================================================
  // Check 5: Grant permissions
  // ==========================================================================
  for (const grant of config.requiredGrants) {
    // Extract parts: queue.grantMethod(lambda)
    const grantMatch = grant.match(/(\w+)\.(grant\w+)\((\w+)\)/);
    if (!grantMatch) continue;

    const [, queueVar, grantMethod, lambdaVar] = grantMatch;

    // Check if grant exists and is not commented
    const grantRegex = new RegExp(`^[^/]*${queueVar}\\.${grantMethod}\\(${lambdaVar}\\)`, 'm');

    if (!grantRegex.test(uncommentedContent)) {
      // Check if it's commented
      const commentedRegex = new RegExp(`//.*${queueVar}\\.${grantMethod}\\(${lambdaVar}\\)`);
      if (commentedRegex.test(uncommentedContent)) {
        // Find the line number
        let lineNum = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(`${queueVar}.${grantMethod}(${lambdaVar})`)) {
            lineNum = i + 1;
            break;
          }
        }
        errors.push({
          type: 'STILL_COMMENTED',
          phase,
          message: `${grantMethod} ist noch auskommentiert`,
          hint: `Zeile ${lineNum}: Entferne // vor ${grant}`,
          lineNumber: lineNum,
          canAutoFix: true,
          severity: 'error',
        });
      } else {
        errors.push({
          type: 'MISSING_GRANT',
          phase,
          message: `Permission fehlt: ${grantMethod}`,
          hint: `Füge hinzu: ${grant};`,
          canAutoFix: false, // User needs to add this
          severity: 'error',
        });
      }
    }
  }

  // ==========================================================================
  // Check 6: Event Source (Phase 3 & 4)
  // ==========================================================================
  if (config.hasEventSource) {
    const hasEventSource = /^[^/]*\.addEventSource\s*\(/m.test(uncommentedContent) &&
                          /^[^/]*new\s+lambdaEventSources\.SqsEventSource/m.test(uncommentedContent);

    if (!hasEventSource) {
      // Check if commented
      if (uncommentedContent.includes('addEventSource') && uncommentedContent.includes('SqsEventSource')) {
        errors.push({
          type: 'STILL_COMMENTED',
          phase,
          message: 'SQS Event Source ist noch auskommentiert',
          hint: 'Der Event Source Code (addEventSource + SqsEventSource) muss einkommentiert werden',
          canAutoFix: true,
          severity: 'error',
        });
      } else {
        errors.push({
          type: 'MISSING_EVENT_SOURCE',
          phase,
          message: 'SQS Event Source fehlt',
          hint: `${config.name} braucht einen SqsEventSource um von der Queue getriggert zu werden`,
          canAutoFix: true,
          severity: 'error',
        });
      }
    }
  }

  // ==========================================================================
  // Check 7: Variable name (did user rename it?)
  // ==========================================================================
  const varNameRegex = new RegExp(`const\\s+${config.variableName}\\s*=`);
  if (!varNameRegex.test(uncommentedContent)) {
    // Check if Lambda exists with different name
    const anyLambdaRegex = new RegExp(`const\\s+(\\w+)\\s*=\\s*new\\s+nodejs\\.NodejsFunction[^;]*${config.name}`);
    const match = uncommentedContent.match(anyLambdaRegex);
    if (match && match[1] !== config.variableName) {
      errors.push({
        type: 'WRONG_VARIABLE_NAME',
        phase,
        message: `Variable heißt "${match[1]}" statt "${config.variableName}"`,
        hint: `Benenne die Variable zurück zu "${config.variableName}" (grants referenzieren diesen Namen)`,
        canAutoFix: false,
        severity: 'warning',
      });
    }
  }

  return errors;
}

/**
 * Get detailed editing instructions for a phase
 *
 * NEW: Instructions for block comments
 */
export async function getCdkEditInstructions(phase: number): Promise<{
  fileName: string;
  startLine: number;
  endLine: number;
  instruction: string;
  linesToUncomment: number[];
}> {
  const config = PHASE_LAMBDAS[phase];
  if (!config) {
    return {
      fileName: CDK_STACK_PATH,
      startLine: 0,
      endLine: 0,
      instruction: 'Keine Änderungen für diese Phase nötig',
      linesToUncomment: [],
    };
  }

  const content = await readCdkStack();
  const lines = content.split('\n');
  const analysis = await analyzeCdkStack();
  const block = analysis.blocks.find(b => b.phase === phase);

  if (!block) {
    return {
      fileName: CDK_STACK_PATH,
      startLine: 0,
      endLine: 0,
      instruction: 'Code-Block nicht gefunden. Bitte CDK-Stack zurücksetzen.',
      linesToUncomment: [],
    };
  }

  // Find /* and */ lines
  const linesToUncomment: number[] = [];

  for (let i = block.startLine; i <= block.endLine; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '/*' || trimmed === '*/' || trimmed.startsWith('/*') || trimmed.endsWith('*/')) {
      linesToUncomment.push(i + 1); // 1-indexed
    }
  }

  // Build instruction
  let instruction: string;
  if (!block.isCommented) {
    instruction = `${config.name} ist bereits aktiv`;
  } else if (linesToUncomment.length === 2) {
    instruction = `Entferne /* (Zeile ${linesToUncomment[0]}) und */ (Zeile ${linesToUncomment[1]})`;
  } else {
    instruction = `Entferne die /* und */ Marker um den Code zu aktivieren`;
  }

  return {
    fileName: CDK_STACK_PATH,
    startLine: block.startLine + 1,
    endLine: block.endLine + 1,
    instruction,
    linesToUncomment,
  };
}

/**
 * Get user-friendly status of CDK for a phase
 */
export async function getCdkStatus(phase: number): Promise<{
  isReady: boolean;
  lambdaName: string;
  status: 'active' | 'commented' | 'missing';
  errors: CdkError[];
}> {
  const config = PHASE_LAMBDAS[phase];
  if (!config) {
    return {
      isReady: true, // No CDK changes needed for this phase
      lambdaName: '',
      status: 'active',
      errors: [],
    };
  }

  const analysis = await analyzeCdkStack();
  const block = analysis.blocks.find(b => b.phase === phase);
  const errors = await validateCdkForPhase(phase);

  if (!block) {
    return {
      isReady: false,
      lambdaName: config.name,
      status: 'missing',
      errors: [{
        type: 'MISSING_LAMBDA',
        phase,
        message: `${config.name} nicht im Stack gefunden`,
        hint: 'Der TODO-Marker fehlt im workshop-stack.ts',
        canAutoFix: true,
        severity: 'error',
      }],
    };
  }

  return {
    isReady: !block.isCommented && errors.length === 0,
    lambdaName: config.name,
    status: block.isCommented ? 'commented' : 'active',
    errors,
  };
}
