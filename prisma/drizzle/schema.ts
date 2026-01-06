import { sql } from 'drizzle-orm'
import { bigint, boolean, decimal, doublePrecision, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const investment_flows = pgTable('investment_flows', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	sender: text('sender').notNull(),
	receiver: text('receiver').notNull(),
	owner: text('owner').notNull(),
	amount: text('amount').notNull(),
	shares: text('shares').notNull(),
	asset: text('asset').notNull(),
	contract: text('contract').notNull(),
	epoch: integer('epoch').notNull(),
	request_id: integer('request_id').notNull(),
	type: text('type').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' }),
	quote_amount: decimal('quote_amount', { precision: 65, scale: 30 }).notNull()
}, (investment_flows) => ({
	'event_id': uniqueIndex('event_id')
		.on(investment_flows.block_number, investment_flows.tx_index, investment_flows.event_index)
}));

export const harvests = pgTable('harvests', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	user: text('user').notNull(),
	contract: text('contract').notNull(),
	amount: text('amount').notNull(),
	price: doublePrecision('price').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (harvests) => ({
	'event_id': uniqueIndex('event_id')
		.on(harvests.block_number, harvests.tx_index, harvests.event_index)
}));

export const position_fees_collected = pgTable('position_fees_collected', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	token0: text('token0').notNull(),
	token1: text('token1').notNull(),
	amount0: text('amount0').notNull(),
	amount1: text('amount1').notNull(),
	vault_address: text('vault_address').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (position_fees_collected) => ({
	'event_id': uniqueIndex('event_id')
		.on(position_fees_collected.block_number, position_fees_collected.tx_index, position_fees_collected.event_index)
}));

export const position_updated = pgTable('position_updated', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	locker: text('locker').notNull(),
	token0: text('token0').notNull(),
	token1: text('token1').notNull(),
	fee: text('fee').notNull(),
	tick_spacing: text('tick_spacing').notNull(),
	extension: text('extension').notNull(),
	salt: text('salt').notNull(),
	lower_bound: text('lower_bound').notNull(),
	upper_bound: text('upper_bound').notNull(),
	liquidity_delta: text('liquidity_delta').notNull(),
	amount0: text('amount0').notNull(),
	amount1: text('amount1').notNull(),
	vault_address: text('vault_address').notNull(),
	user_address: text('user_address').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' }),
	quote_amount: decimal('quote_amount', { precision: 65, scale: 30 }).notNull()
}, (position_updated) => ({
	'event_id': uniqueIndex('event_id')
		.on(position_updated.block_number, position_updated.tx_index, position_updated.event_index)
}));

export const strategy_metadata = pgTable('strategy_metadata', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	strategy_address: text('strategy_address').notNull().unique(),
	strategy_name: text('strategy_name').notNull(),
	quote_asset: text('quote_asset').notNull()
}, (strategy_metadata) => ({
	'strategy_metadata_id': uniqueIndex('strategy_metadata_id')
		.on(strategy_metadata.strategy_address)
}));

export const raw_price_events = pgTable('raw_price_events', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	timestamp: integer('timestamp').notNull(),
	source: text('source').notNull(),
	publisher: text('publisher').notNull(),
	price: decimal('price', { precision: 65, scale: 30 }).notNull(),
	pair_id: text('pair_id').notNull(),
	volume: decimal('volume', { precision: 65, scale: 30 }).notNull()
}, (raw_price_events) => ({
	'event_id': uniqueIndex('event_id')
		.on(raw_price_events.block_number, raw_price_events.tx_index, raw_price_events.event_index)
}));

export const prices = pgTable('prices', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	asset: text('asset').notNull(),
	price: doublePrecision('price').notNull(),
	timestamp: integer('timestamp').notNull(),
	block_number: integer('block_number').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (prices) => ({
	'price_id': uniqueIndex('price_id')
		.on(prices.asset, prices.timestamp)
}));

export const token_metadata = pgTable('token_metadata', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	address: text('address').notNull().unique(),
	name: text('name').notNull(),
	symbol: text('symbol').notNull(),
	decimals: integer('decimals').notNull(),
	pragma_pair_id: text('pragma_pair_id').notNull(),
	pragma_decimals: integer('pragma_decimals').notNull()
}, (token_metadata) => ({
	'token_metadata_id': uniqueIndex('token_metadata_id')
		.on(token_metadata.address)
}));

export const lst_price_sync_progress = pgTable('lst_price_sync_progress', {
	id: text('id').notNull().primaryKey().default("lst_price_sync"),
	last_processed_block: integer('last_processed_block')
});

export const svk_alt_redemptions_subscribed = pgTable('svk_alt_redemptions_subscribed', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	contract_address: text('contract_address').notNull(),
	new_nft_id: integer('new_nft_id').notNull(),
	old_nft_id: integer('old_nft_id').notNull(),
	receiver: text('receiver').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (svk_alt_redemptions_subscribed) => ({
	'event_id': uniqueIndex('event_id')
		.on(svk_alt_redemptions_subscribed.block_number, svk_alt_redemptions_subscribed.tx_index, svk_alt_redemptions_subscribed.event_index)
}));

export const svk_alt_redemptions_claimed = pgTable('svk_alt_redemptions_claimed', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	contract_address: text('contract_address').notNull(),
	new_nft_id: integer('new_nft_id').notNull(),
	old_nft_id: integer('old_nft_id').notNull(),
	receivable: text('receivable').notNull(),
	swap_id: integer('swap_id').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (svk_alt_redemptions_claimed) => ({
	'event_id': uniqueIndex('event_id')
		.on(svk_alt_redemptions_claimed.block_number, svk_alt_redemptions_claimed.tx_index, svk_alt_redemptions_claimed.event_index)
}));

export const svk_alt_redemptions_unsubscribed = pgTable('svk_alt_redemptions_unsubscribed', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	contract_address: text('contract_address').notNull(),
	new_nft_id: integer('new_nft_id').notNull(),
	old_nft_id: integer('old_nft_id').notNull(),
	owner: text('owner').notNull(),
	is_old_nft_returned: boolean('is_old_nft_returned').notNull(),
	is_original_assets_returned: boolean('is_original_assets_returned').notNull(),
	original_assets_returned: text('original_assets_returned').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (svk_alt_redemptions_unsubscribed) => ({
	'event_id': uniqueIndex('event_id')
		.on(svk_alt_redemptions_unsubscribed.block_number, svk_alt_redemptions_unsubscribed.tx_index, svk_alt_redemptions_unsubscribed.event_index)
}));

export const svk_alt_redemptions = pgTable('svk_alt_redemptions', {
	id: text('id').notNull().primaryKey().default(sql`gen_random_uuid()`),
	block_number: integer('block_number').notNull(),
	tx_index: integer('tx_index').notNull(),
	event_index: integer('event_index').notNull(),
	tx_hash: text('tx_hash').notNull(),
	contract_address: text('contract_address').notNull(),
	old_nft_id: text('old_nft_id').notNull(),
	new_nft_id: text('new_nft_id').notNull(),
	receiver: text('receiver'),
	owner: text('owner'),
	receivable: text('receivable'),
	swap_id: text('swap_id'),
	is_claimed: boolean('is_claimed').notNull(),
	is_unsubscribed: boolean('is_unsubscribed').notNull(),
	is_old_nft_returned: boolean('is_old_nft_returned').notNull(),
	is_original_assets_returned: boolean('is_original_assets_returned').notNull(),
	original_assets_returned: text('original_assets_returned'),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (svk_alt_redemptions) => ({
	'redemption_unique': uniqueIndex('redemption_unique')
		.on(svk_alt_redemptions.contract_address, svk_alt_redemptions.old_nft_id)
}));