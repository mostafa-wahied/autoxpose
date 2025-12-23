CREATE TABLE `provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subdomain` text NOT NULL,
	`port` integer NOT NULL,
	`scheme` text DEFAULT 'http',
	`enabled` integer DEFAULT true,
	`source` text NOT NULL,
	`source_id` text,
	`dns_record_id` text,
	`proxy_host_id` text,
	`exposure_source` text,
	`dns_exists` integer,
	`proxy_exists` integer,
	`last_reachability_check` integer,
	`reachability_status` text,
	`config_warnings` text,
	`exposed_subdomain` text,
	`ssl_pending` integer,
	`ssl_error` text,
	`ssl_forced` integer DEFAULT false,
	`tags` text,
	`has_explicit_subdomain_label` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
