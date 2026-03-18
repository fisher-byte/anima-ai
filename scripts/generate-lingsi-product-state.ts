import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildPersonaEvalSummary,
  buildProductStateSummary,
  extractLatestReleaseSnapshot,
} from '../src/shared/lingsiProductState'
import type {
  DecisionProductStatePack,
  DecisionSourceManifestEntry,
  DecisionUnit,
} from '../src/shared/types'

interface PackageJson {
  version: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const evocanvasRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(evocanvasRoot, '..')
const animaBaseRoot = join(workspaceRoot, 'anima-base')

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

function resolveGitHead(repoPath: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim()
  } catch {
    return undefined
  }
}

async function main() {
  const packageJsonPath = join(evocanvasRoot, 'package.json')
  const changelogPath = join(evocanvasRoot, 'docs', 'changelog.md')
  const unitsPath = join(evocanvasRoot, 'seeds', 'lingsi', 'decision-units.json')
  const manifestPath = join(evocanvasRoot, 'seeds', 'lingsi', 'decision-source-manifest.json')
  const statePath = join(evocanvasRoot, 'seeds', 'lingsi', 'decision-product-state.json')
  const lennyEvalPath = join(evocanvasRoot, 'reports', 'lingsi-m4-eval.json')
  const zhangEvalPath = join(evocanvasRoot, 'reports', 'lingsi-zhang-eval.json')

  const [packageJson, changelog, units, manifest, currentState, lennyEval, zhangEval] = await Promise.all([
    readJson<PackageJson>(packageJsonPath),
    readFile(changelogPath, 'utf8'),
    readJson<DecisionUnit[]>(unitsPath),
    readJson<DecisionSourceManifestEntry[]>(manifestPath),
    readJson<DecisionProductStatePack>(statePath),
    readJson<Array<{ judge?: { winner?: 'decision' | 'normal' | 'tie' } }>>(lennyEvalPath),
    readJson<Array<{ judge?: { winner?: 'decision' | 'normal' | 'tie' } }>>(zhangEvalPath),
  ])

  const release = extractLatestReleaseSnapshot(changelog)
  if (release.version !== packageJson.version) {
    throw new Error(`package.json version ${packageJson.version} does not match changelog ${release.version}`)
  }

  const approvedUnits = units.filter(unit => unit.status === 'approved')
  const unitsByPersona = approvedUnits.reduce<Partial<Record<'lenny' | 'zhang', number>>>((acc, unit) => {
    const personaId = unit.personaId === 'lenny' || unit.personaId === 'zhang' ? unit.personaId : undefined
    if (!personaId) return acc
    acc[personaId] = (acc[personaId] ?? 0) + 1
    return acc
  }, {})
  const dataSnapshot = {
    personas: new Set(approvedUnits.map(unit => unit.personaId)).size,
    sources: manifest.length,
    approvedUnits: approvedUnits.length,
    unitsByPersona,
    animaBaseHead: resolveGitHead(animaBaseRoot),
  }

  const nextState: DecisionProductStatePack = {
    ...currentState,
    id: `anima-product-state-v${packageJson.version.replace(/\./g, '-')}`,
    version: packageJson.version,
    updatedAt: `${release.date}T00:00:00.000Z`,
    summary: buildProductStateSummary({
      version: packageJson.version,
      releaseTitle: release.title,
      dataSnapshot,
      changes: release.changes,
    }),
    completedChanges: release.changes,
    evalSummary: {
      ...currentState.evalSummary,
      lenny: buildPersonaEvalSummary('Lenny', lennyEval),
      zhang: buildPersonaEvalSummary('张小龙', zhangEval),
    },
    dataSnapshot,
    docRefs: Array.from(new Set([
      'docs/PROJECT.md',
      'docs/ROADMAP.md',
      'docs/changelog.md',
      'docs/lingsi-flywheel.md',
      'docs/lingsi-eval-m4.md',
      'docs/lingsi-eval-zhang.md',
      ...(currentState.docRefs ?? []),
    ])),
  }

  const nextSerialized = `${JSON.stringify(nextState, null, 2)}\n`
  const previousSerialized = await readFile(statePath, 'utf8')
  if (nextSerialized === previousSerialized) {
    console.log('decision-product-state.json up to date')
    console.log('Files changed: 0')
    return
  }

  await writeFile(statePath, nextSerialized)
  console.log('updated decision-product-state.json')
  console.log('Files changed: 1')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
