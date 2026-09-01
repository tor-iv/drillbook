CREATE TABLE `day_metrics` (
	`date` text PRIMARY KEY NOT NULL,
	`active_energy` real,
	`basal_energy` real,
	`steps` real,
	`exercise_min` real,
	`distance_mi` real,
	`sleep_hours` real,
	`resting_hr` real,
	`hrv` real,
	`vo2_max` real,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `meals` ADD `items_json` text;