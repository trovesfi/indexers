import { bigint, boolean, doublePrecision, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const subscriptions = pgTable('subscriptions', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	user: text('user').notNull(),
	is_active: boolean('is_active').notNull(),
	min_health_factor: integer('min_health_factor').notNull(),
	max_health_factor: integer('max_health_factor').notNull(),
	target_health_factor: integer('target_health_factor').notNull(),
	protocol: text('protocol').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (subscriptions) => ({
	'event_id': uniqueIndex('event_id')
		.on(subscriptions.block_number, subscriptions.txIndex, subscriptions.eventIndex)
}));

export const rebalances = pgTable('rebalances', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	user: text('user').notNull(),
	strategy: text('strategy').notNull(),
	token: text('token').notNull(),
	amount: bigint('amount', { mode: 'bigint' }).notNull(),
	protocol: text('protocol').notNull(),
	is_outflow: boolean('is_outflow').notNull(),
	previous_health_factor: integer('previous_health_factor').notNull(),
	new_health_factor: integer('new_health_factor').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (rebalances) => ({
	'event_id': uniqueIndex('event_id')
		.on(rebalances.block_number, rebalances.txIndex, rebalances.eventIndex)
}));

export const zklend_liquidations = pgTable('zklend_liquidations', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	user: text('user').notNull(),
	debt_token: text('debt_token').notNull(),
	debt_face_amount: bigint('debt_face_amount', { mode: 'bigint' }).notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (zklend_liquidations) => ({
	'event_id': uniqueIndex('event_id')
		.on(zklend_liquidations.block_number, zklend_liquidations.txIndex, zklend_liquidations.eventIndex)
}));

export const dnmm_user_actions = pgTable('dnmm_user_actions', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	sender: text('sender').notNull(),
	receiver: text('receiver').notNull(),
	owner: text('owner').notNull(),
	type: text('type').notNull(),
	assets: text('assets').notNull(),
	position_acc1_supply_shares: text('position_acc1_supply_shares').notNull(),
	position_acc1_borrow_shares: text('position_acc1_borrow_shares').notNull(),
	position_acc2_supply_shares: text('position_acc2_supply_shares').notNull(),
	position_acc2_borrow_shares: text('position_acc2_borrow_shares').notNull(),
	contract: text('contract').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (dnmm_user_actions) => ({
	'event_id': uniqueIndex('event_id')
		.on(dnmm_user_actions.block_number, dnmm_user_actions.txIndex, dnmm_user_actions.eventIndex)
}));

export const investment_flows = pgTable('investment_flows', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	sender: text('sender').notNull(),
	receiver: text('receiver').notNull(),
	owner: text('owner').notNull(),
	amount: text('amount').notNull(),
	asset: text('asset').notNull(),
	contract: text('contract').notNull(),
	epoch: integer('epoch').notNull(),
	request_id: integer('request_id').notNull(),
	type: text('type').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (investment_flows) => ({
	'event_id': uniqueIndex('event_id')
		.on(investment_flows.block_number, investment_flows.txIndex, investment_flows.eventIndex)
}));

export const harvests = pgTable('harvests', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	user: text('user').notNull(),
	contract: text('contract').notNull(),
	amount: text('amount').notNull(),
	price: doublePrecision('price').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (harvests) => ({
	'event_id': uniqueIndex('event_id')
		.on(harvests.block_number, harvests.txIndex, harvests.eventIndex)
}));

export const framethispeter = pgTable('framethispeter', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	token_id: text('token_id').notNull(),
	receiver: text('receiver').notNull(),
	tweet_id: text('tweet_id').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (framethispeter) => ({
	'event_id': uniqueIndex('event_id')
		.on(framethispeter.block_number, framethispeter.txIndex, framethispeter.eventIndex)
}));

export const transfers = pgTable('transfers', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	contract: text('contract').notNull(),
	from: text('from').notNull(),
	receiver: text('receiver').notNull(),
	amount: text('amount').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (transfers) => ({
	'event_id': uniqueIndex('event_id')
		.on(transfers.block_number, transfers.txIndex, transfers.eventIndex)
}));

export const position_fees_collected = pgTable('position_fees_collected', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	token0: text('token0').notNull(),
	token1: text('token1').notNull(),
	fee: text('fee').notNull(),
	tick_spacing: text('tick_spacing').notNull(),
	extension: text('extension').notNull(),
	salt: text('salt').notNull(),
	owner: text('owner').notNull(),
	lower_bound: text('lower_bound').notNull(),
	upper_bound: text('upper_bound').notNull(),
	amount0: text('amount0').notNull(),
	amount1: text('amount1').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (position_fees_collected) => ({
	'event_id': uniqueIndex('event_id')
		.on(position_fees_collected.block_number, position_fees_collected.txIndex, position_fees_collected.eventIndex)
}));

export const position_updated = pgTable('position_updated', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
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
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (position_updated) => ({
	'event_id': uniqueIndex('event_id')
		.on(position_updated.block_number, position_updated.txIndex, position_updated.eventIndex)
}));