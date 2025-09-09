export type Migrations = {
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
