CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`actions_json` text,
	`results_json` text,
	`client_msg_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_client_msg_id_idx` ON `chat_messages` (`client_msg_id`);