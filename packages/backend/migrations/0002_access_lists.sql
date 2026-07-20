CREATE TABLE `npm_access_lists` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`satisfy_any` integer DEFAULT false,
	`pass_auth` integer DEFAULT true,
	`proxy_host_count` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
ALTER TABLE services ADD `access_list_id` integer;
