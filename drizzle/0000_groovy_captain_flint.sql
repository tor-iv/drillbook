CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text NOT NULL,
	`daily_target` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_key_unique` ON `activities` (`key`);--> statement-breakpoint
CREATE TABLE `ai_nudges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cron_runs` (
	`job_key` text PRIMARY KEY NOT NULL,
	`last_run_date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_activity_date_idx` ON `entries` (`activity_id`,`date`);--> statement-breakpoint
CREATE TABLE `google_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`connected_at` text NOT NULL,
	`calendar_id` text DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taken_at` text NOT NULL,
	`file_path` text NOT NULL,
	`caption` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`duration_min` real,
	`distance_mi` real,
	`calories` real,
	`started_at` text,
	`source` text DEFAULT 'apple_health' NOT NULL,
	`raw_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_started_type_idx` ON `workouts` (`started_at`,`type`);