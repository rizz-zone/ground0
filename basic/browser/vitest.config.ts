import { configDefaults, defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, '**/*.config.ts'],
		coverage: {
			exclude: [
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				...configDefaults.coverage.exclude!,
				'**/*.config.ts',
				'**/testing/**',
				'src/resource_managers/db/raw_stage/vfs/*.js',
				// Re-export entry points - nothing can be tested here
				'src/index.ts',
				'src/wasm.ts',
				'src/worker.ts',
				'src/adapter_extras.ts',
				// Type-only files (no executable code)
				'src/types/LocalEngineDefinition.ts',
				'src/types/SomeActorRef.ts',
				'src/types/internal_messages/DownstreamDbWorkerInitMessage.ts',
				'src/types/internal_messages/UpstreamDbWorkerInitMessage.ts',
				'src/types/memory_model/Tranformation.ts',
				'src/types/memory_model/Unwrappable.ts',
				'src/types/status/ResourceBundle.ts',
				'src/types/status/ResourceStatus.ts'
			],
			reporter: ['lcov', 'text']
		},
		globals: true,
		environment: 'jsdom'
	},
	plugins: [tsconfigPaths()]
})
