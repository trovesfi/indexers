import { bigint, doublePrecision, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const investment_flows = pgTable('investment_flows', {
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
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (investment_flows) => ({
	'event_id': uniqueIndex('event_id')
		.on(investment_flows.block_number, investment_flows.tx_index, investment_flows.event_index)
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
	vault_address: text('vault_address').notNull(),
	user_address: text('user_address').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (position_updated) => ({
	'event_id': uniqueIndex('event_id')
		.on(position_updated.block_number, position_updated.txIndex, position_updated.eventIndex)
}));

export const dnmm_user_actions = pgTable('dnmm_user_actions', {
	block_number: integer('block_number').notNull(),
	txIndex: integer('txIndex').notNull(),
	eventIndex: integer('eventIndex').notNull(),
	txHash: text('txHash').notNull(),
	sender: text('sender').notNull(),
	receiver: text('receiver').notNull(),
	owner: text('owner').notNull(),
	assets: text('assets').notNull(),
	position_acc1_supply_shares: text('position_acc1_supply_shares').notNull(),
	position_acc1_borrow_shares: text('position_acc1_borrow_shares').notNull(),
	position_acc2_supply_shares: text('position_acc2_supply_shares').notNull(),
	position_acc2_borrow_shares: text('position_acc2_borrow_shares').notNull(),
	contract: text('contract').notNull(),
	type: text('type').notNull(),
	timestamp: integer('timestamp').notNull(),
	cursor: bigint('_cursor', { mode: 'bigint' })
}, (dnmm_user_actions) => ({
	'event_id': uniqueIndex('event_id')
		.on(dnmm_user_actions.block_number, dnmm_user_actions.txIndex, dnmm_user_actions.eventIndex)
}));