PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_counter` (
	`id` integer PRIMARY KEY DEFAULT 0 NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_counter`("id", "value") SELECT "id", "value" FROM `counter`;--> statement-breakpoint
DROP TABLE `counter`;--> statement-breakpoint
ALTER TABLE `__new_counter` RENAME TO `counter`;--> statement-breakpoint
PRAGMA foreign_keys=ON;