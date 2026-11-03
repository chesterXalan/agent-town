import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DEFAULT_HELPER } from '../server/source'

const root = fileURLToPath(new URL('..', import.meta.url))
const bridge = join(root, 'vendor/agent-session-bridge')
const action = process.argv[2]

async function run(command: string[], capture = false) {
  const process = Bun.spawn(command, {
    cwd: root,
    stdin: 'inherit',
    stdout: capture ? 'pipe' : 'inherit',
    stderr: 'inherit',
  })
  const output = capture ? await new Response(process.stdout).text() : ''
  const code = await process.exited
  if (code !== 0) throw new Error(`${command[0]} exited with status ${code}`)
  return output.trim()
}

try {
  if (process.platform !== 'darwin') throw new Error('The live bridge requires macOS. Demo mode works without it.')
  if (action === 'setup') {
    if (!existsSync(join(bridge, 'Package.swift'))) {
      await run(['git', 'submodule', 'update', '--init', '--recursive', '--', 'vendor/agent-session-bridge'])
    }
    const build = ['swift', 'build', '--package-path', bridge, '-c', 'release', '--build-system', 'native']
    await run([...build, '--product', 'agent-session-bridge'])
    const bin = await run([...build, '--show-bin-path'], true)
    await run([join(bin, 'agent-session-bridge'), 'install-runtime'])
    console.log('Bridge ready. Run bun run hooks:install to configure shared Claude Code and Codex hooks.')
  } else if (action === 'install' || action === 'uninstall') {
    if (!existsSync(DEFAULT_HELPER)) throw new Error('Run bun run bridge:setup first.')
    await run([DEFAULT_HELPER, action])
    console.log(
      action === 'install'
        ? 'Restart CLI sessions and accept updated hooks if prompted.'
        : 'Shared hooks removed for all bridge consumers.',
    )
  } else {
    throw new Error('Use bun run bridge:setup, bun run hooks:install, or bun run hooks:remove.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Bridge setup failed')
  process.exitCode = 1
}
