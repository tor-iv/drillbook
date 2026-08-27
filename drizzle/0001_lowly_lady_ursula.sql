CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`calories` real NOT NULL,
	`protein` real,
	`method` text NOT NULL,
	`photo_path` text,
	`model` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
