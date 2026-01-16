export type GeneratedMigrationSchema = {
	journal: {
		entries: {
			idx: number
			when: number
			tag: string
			breakpoints: boolean
		}[]
	}
	migrations: Record<string, string>
}
